'use client';

import { useEffect, useMemo } from 'react';
import type { SavedMeal } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { mealieRecipeUrl, parseMealieMealId, type MealieRecipeDetail } from '@/lib/mealie-map';
import { mealieRecipe, savedMealRecipe, type RecipeDetail } from '@/lib/meal-recipe';
import { markRecipeGone } from '@/components/meals/goneRecipes';

/**
 * A fix made in Mealie (a typo, an amount) reaches an open card within a
 * minute: the hub keeps a recipe half a minute, so each of these re-reads
 * gets Mealie's own.
 */
export const MEALIE_RECIPE_TTL_MS = 60_000;

export type MealRecipeState =
  | { status: 'loading' }
  | { status: 'failed' }
  /** Mealie no longer has the recipe: deleted there after the list it was tapped in was read. */
  | { status: 'gone' }
  /** `favorite`: whether a Mealie recipe is one of Mealie's favorites, as the hub said when it was read. */
  | { status: 'ready'; recipe: RecipeDetail; favorite?: boolean };

/**
 * A meal's recipe for the wall: a Mealie recipe read through the hub
 * (`/api/mealie/recipe/<id>`, display access) with its amounts for `scale`
 * batches, or a saved meal's own ingredients and notes, which need no
 * request. A recipe found gone is recorded (`markRecipeGone`), so a recipe
 * book still listing it leaves it out.
 */
export function useMealRecipe(meal: SavedMeal | null, scale = 1): MealRecipeState {
  const mealieId = parseMealieMealId(meal?.id);
  const [wire, error] = useFetchData<MealieRecipeDetail>(mealieId ? mealieRecipeUrl(mealieId, scale) : '', MEALIE_RECIPE_TTL_MS);
  const state = useMemo<MealRecipeState>(() => {
    if (!meal) return { status: 'failed' };
    if (!mealieId) return { status: 'ready', recipe: savedMealRecipe(meal) };
    if (wire && Array.isArray(wire.ingredients) && Array.isArray(wire.steps)) {
      return { status: 'ready', recipe: mealieRecipe(wire), ...(typeof wire.meal?.isFavorite === 'boolean' ? { favorite: wire.meal.isFavorite } : {}) };
    }
    if (error?.reason === 'gone') return { status: 'gone' };
    return error ? { status: 'failed' } : { status: 'loading' };
  }, [meal, mealieId, wire, error]);
  const goneId = state.status === 'gone' ? meal?.id : undefined;
  useEffect(() => {
    if (goneId) markRecipeGone(goneId);
  }, [goneId]);
  return state;
}
