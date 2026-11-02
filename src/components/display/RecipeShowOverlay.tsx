'use client';

import { lazy, Suspense, useMemo } from 'react';
import type { PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import { useRecipeShowStore } from '@/stores/recipe-show-store';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
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
 */
export default function RecipeShowOverlay({ theme, timeFormat }: { theme: string | undefined; timeFormat: TimeFormat }) {
  const shown = useRecipeShowStore((s) => s.shown);
  const hide = useRecipeShowStore((s) => s.hide);
  const context = useMemo<MealRecipeContextValue>(
    () => ({ theme, plan: NO_PLAN, savedMeals: NO_MEALS, settings: DEFAULT_MEAL_SETTINGS, timeFormat, now: new Date() }),
    [theme, timeFormat],
  );
  if (!shown) return null;
  return (
    <MealRecipeContext.Provider value={context}>
      <Suspense fallback={null}>
        <RecipeCard key={shown.id} meal={shown.meal} onClose={hide} />
      </Suspense>
    </MealRecipeContext.Provider>
  );
}
