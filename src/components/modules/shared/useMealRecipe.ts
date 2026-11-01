'use client';

import { useMemo } from 'react';
import type { SavedMeal } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { mealieRecipeUrl, parseMealieMealId, type MealieRecipeDetail } from '@/lib/mealie-map';
import { mealieRecipe, savedMealRecipe, type RecipeDetail } from '@/lib/meal-recipe';

/** The hub keeps a Mealie recipe ten minutes too; nobody edits tonight's dinner by the minute. */
const MEALIE_RECIPE_TTL_MS = 10 * 60_000;

export type MealRecipeState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; recipe: RecipeDetail };

/**
 * A meal's recipe for the wall: a Mealie recipe read through the hub
 * (`/api/mealie/recipe/<id>`, display access) with its amounts for `scale`
 * batches, or a saved meal's own ingredients and notes, which need no
 * request.
 */
export function useMealRecipe(meal: SavedMeal | null, scale = 1): MealRecipeState {
  const mealieId = parseMealieMealId(meal?.id);
  const [wire, error] = useFetchData<MealieRecipeDetail>(mealieId ? mealieRecipeUrl(mealieId, scale) : '', MEALIE_RECIPE_TTL_MS);
  return useMemo<MealRecipeState>(() => {
    if (!meal) return { status: 'failed' };
    if (!mealieId) return { status: 'ready', recipe: savedMealRecipe(meal) };
    if (wire && Array.isArray(wire.ingredients) && Array.isArray(wire.steps)) return { status: 'ready', recipe: mealieRecipe(wire) };
    return error ? { status: 'failed' } : { status: 'loading' };
  }, [meal, mealieId, wire, error]);
}
