'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { weekGroceryList } from '@/lib/grocery-utils';
import { groceryChecksForWeek, type GroceryChecked } from '@/lib/grocery-checks';

interface MealsGroceryParams {
  /** Plan entries for the viewed week only: the list never spans weeks */
  weekPlan: PlannedMeal[];
  savedMeals: SavedMeal[];
  /** Every week's ticks; only the viewed week's are read */
  groceryChecked: GroceryChecked;
  /** The viewed week's key (`groceryWeekKey`) */
  week: string;
}

/**
 * The grocery list derived from the viewed week's plan and ticks, plus its
 * checked/total counts and the planned meals that add nothing to it because
 * they have no ingredients yet. Purely derived: the checkbox writes go through
 * `useMealsData`.
 */
export function useMealsGrocery({ weekPlan, savedMeals, groceryChecked, week }: MealsGroceryParams) {
  const weekChecked = groceryChecksForWeek(groceryChecked, week);
  const { list, counts, withoutIngredients } = useMemo(
    () => weekGroceryList(weekPlan, savedMeals, weekChecked),
    [weekPlan, savedMeals, weekChecked],
  );
  return { groceryList: list, groceryStats: counts, withoutIngredients };
}
