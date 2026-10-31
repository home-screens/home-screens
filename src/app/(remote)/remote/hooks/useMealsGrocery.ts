'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { generateGroceryList, plannedMealsWithoutIngredients } from '@/lib/grocery-utils';
import { groceryChecksForWeek, type GroceryChecked } from '@/lib/grocery-checks';

interface MealsGroceryParams {
  /** Plan entries for the viewed week only — the list never spans weeks */
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
  const groceryList = useMemo(() => generateGroceryList(weekPlan, savedMeals, weekChecked), [weekPlan, savedMeals, weekChecked]);

  const groceryStats = useMemo(() => {
    let total = 0;
    let checked = 0;
    for (const [, cat] of groceryList) {
      for (const item of cat.items) {
        total++;
        if (item.checked) checked++;
      }
    }
    return { total, checked };
  }, [groceryList]);

  const withoutIngredients = useMemo(
    () => plannedMealsWithoutIngredients(weekPlan, savedMeals),
    [weekPlan, savedMeals],
  );

  return { groceryList, groceryStats, withoutIngredients };
}
