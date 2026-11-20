'use client';

import { lazy, Suspense, useMemo } from 'react';
import type { PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import { useRecipeShowStore } from '@/stores/recipe-show-store';
import { useFetchData } from '@/hooks/useFetchData';
import { FETCH_KEY_REGISTRY, mealsDataUrl } from '@/lib/fetch-keys';
import { readMealAnswer } from '@/lib/meal-client';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MealVotesProvider } from '@/components/meals/meal-votes';
import { MealRecipeContext, type MealRecipeContextValue } from '@/components/modules/shared/MealRecipeContext';

// Lazy so the card and its QR code are only fetched the first time a phone
// sends a recipe; most walls never get one.
const RecipeCard = lazy(() =>
  import('@/components/modules/shared/RecipeCard').then((m) => ({ default: m.RecipeCard })),
);

const NO_PLAN: PlannedMeal[] = [];
const NO_MEALS: SavedMeal[] = [];

/**
 * A recipe sent from a phone with "Show on the wall": the same recipe card a
 * tapped meal opens, over whatever screen is up, drawn in the display's
 * full-screen theme. It was not tapped in a plan, so the card has no meal
 * badge and no courses. A second recipe replaces it (the key gives it a fresh
 * card); the card's close, or its own idle timer, takes it down.
 *
 * While a recipe is up the overlay reads the meals answer the meal modules
 * read, for the family's votes: the card's Rate button saves a vote, and
 * without the votes around it the stars never filled in. A wall showing no
 * recipe asks for nothing.
 */
export default function RecipeShowOverlay({ theme, timeFormat }: { theme: string | undefined; timeFormat: TimeFormat }) {
  const shown = useRecipeShowStore((s) => s.shown);
  const hide = useRecipeShowStore((s) => s.hide);
  // An empty address reads nothing (see `useFetchData`).
  const [raw] = useFetchData<unknown>(shown ? mealsDataUrl() : '', FETCH_KEY_REGISTRY['meal-planner']?.ttlMs ?? 60_000);
  const data = useMemo(() => (raw ? readMealAnswer(raw, timeFormat) : null), [raw, timeFormat]);
  const context = useMemo<MealRecipeContextValue>(
    () => ({
      theme,
      plan: data?.plan ?? NO_PLAN,
      savedMeals: data?.savedMeals ?? NO_MEALS,
      settings: data?.settings ?? DEFAULT_MEAL_SETTINGS,
      timeFormat,
      now: new Date(),
    }),
    [theme, timeFormat, data],
  );
  if (!shown) return null;
  return (
    <MealRecipeContext.Provider value={context}>
      <MealVotesProvider loaded={data?.familyRatings}>
        <Suspense fallback={null}>
          <RecipeCard key={shown.id} meal={shown.meal} onClose={hide} />
        </Suspense>
      </MealVotesProvider>
    </MealRecipeContext.Provider>
  );
}
