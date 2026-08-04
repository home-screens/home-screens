'use client';

import { useMemo } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { generateGroceryList } from '@/lib/grocery-utils';

interface MealsGroceryParams {
  /** Plan entries for the viewed week only — the list never spans weeks */
  weekPlan: PlannedMeal[];
  savedMeals: SavedMeal[];
  groceryChecked: string[];
}

/**
 * The grocery list derived from the viewed week's plan, plus its checked/total
 * counts. Purely derived — the checkbox writes go through `useMealsData`.
 */
export function useMealsGrocery({ weekPlan, savedMeals, groceryChecked }: MealsGroceryParams) {
  const groceryList = useMemo(() => generateGroceryList(weekPlan, savedMeals, groceryChecked), [weekPlan, savedMeals, groceryChecked]);

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

  return { groceryList, groceryStats };
}
