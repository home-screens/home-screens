'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import { planEntryMealIds } from '@/lib/meal-courses';
import { isMealieMeal } from '@/lib/meal-dish-rules';

/**
 * Mealie recipes picked, opened or taken off the plan here, kept so they draw
 * at once. A Mealie copy carries only the recipes its plan uses: until a save
 * answers, a dish just picked is only an id, and an Undo would put back a
 * dish with no name or picture. The family's own meals are always in the
 * copy, so only Mealie recipes are kept. Shared by the phone's Meals tab and
 * the editor's planner window.
 */
export function usePickedMeals(savedMeals: SavedMeal[]): {
  /** `savedMeals`, then every kept recipe it does not hold. */
  meals: SavedMeal[];
  /** Keep these recipes drawable. */
  keep: (meals: readonly SavedMeal[]) => void;
  /** Keep the recipes `entry` names, its main dish and its courses, before a change takes them off the plan. */
  keepEntry: (entry: PlannedMeal) => void;
} {
  const [picked, setPicked] = useState<ReadonlyMap<string, SavedMeal>>(() => new Map());
  const meals = useMemo(() => {
    if (picked.size === 0) return savedMeals;
    const known = new Set(savedMeals.map((m) => m.id));
    const extra = [...picked.values()].filter((m) => !known.has(m.id));
    return extra.length > 0 ? [...savedMeals, ...extra] : savedMeals;
  }, [savedMeals, picked]);

  const keep = useCallback((list: readonly SavedMeal[]) => {
    const recipes = list.filter((m) => isMealieMeal(m));
    if (recipes.length === 0) return;
    setPicked((prev) => {
      if (recipes.every((m) => prev.get(m.id) === m)) return prev;
      const next = new Map(prev);
      for (const m of recipes) next.set(m.id, m);
      return next;
    });
  }, []);

  const keepEntry = useCallback((entry: PlannedMeal) => {
    const ids = new Set(planEntryMealIds(entry));
    keep(meals.filter((m) => ids.has(m.id)));
  }, [meals, keep]);

  return { meals, keep, keepEntry };
}
