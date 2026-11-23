'use client';

import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { SavedMeal } from '@/types/config';
import { MealRecipeContext, type MealRecipeContextValue, type MealServingRef } from './MealRecipeContext';

const RecipeCard = lazy(() => import('./RecipeCard').then((m) => ({ default: m.RecipeCard })));

/**
 * `MealRecipeContext` for a meal module's views, with the recipe card a
 * tapped meal opens kept here instead of inside the meal's own row. The row
 * goes when its meal does: taking Tuesday's curry off the menu from its own
 * card used to take the card, the sheet over it and its Undo along with it.
 */
export function MealRecipeScope({ value, children }: { value: MealRecipeContextValue; children: ReactNode }) {
  const [card, setCard] = useState<{ meal: SavedMeal; at?: MealServingRef } | null>(null);
  const openCard = useCallback((meal: SavedMeal, at?: MealServingRef) => setCard({ meal, at }), []);
  const scoped = useMemo(() => ({ ...value, openCard }), [value, openCard]);
  return (
    <MealRecipeContext.Provider value={scoped}>
      {children}
      {card && (
        <Suspense fallback={null}>
          <RecipeCard meal={card.meal} at={card.at} onClose={() => setCard(null)} />
        </Suspense>
      )}
    </MealRecipeContext.Provider>
  );
}
