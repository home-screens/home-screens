import { describe, it, expect } from 'vitest';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { recipeServingAt, type MealRecipeContextValue } from '../MealRecipeContext';

const salad: SavedMeal = { id: 'salad', name: 'Big salad' };
const pie: SavedMeal = { id: 'pie', name: 'Pie' };

/** Wed Apr 1 2026, 9 AM: dinner is still to come. */
function context(plan: PlannedMeal[]): MealRecipeContextValue {
  return {
    theme: undefined,
    plan,
    savedMeals: [salad, pie],
    settings: DEFAULT_MEAL_SETTINGS,
    timeFormat: '12h',
    now: new Date(2026, 3, 1, 9, 0),
  };
}

/* Mealie plans dinner as only a side, a double batch of it, with a pie. */
const sideOnly: PlannedMeal[] = [{
  date: '2026-04-01', slot: 'dinner',
  courses: [{ kind: 'side', mealId: 'salad', scale: 2 }, { kind: 'dessert', mealId: 'pie' }],
}];

describe('recipeServingAt', () => {
  it('opens the side a meal leads with as the double batch it is', () => {
    const { scale, courses } = recipeServingAt(context(sideOnly), { date: '2026-04-01', slot: 'dinner' }, salad);
    expect(scale).toBe(2);
    expect(courses.map((c) => c.name)).toEqual(['Pie']);
  });

  it('lists that side, as a side and with its batch, on the card of one of its courses', () => {
    const { scale, courses } = recipeServingAt(context(sideOnly), { date: '2026-04-01', slot: 'dinner' }, pie);
    expect(scale).toBe(1);
    expect(courses).toEqual([{ kind: 'side', meal: salad, name: 'Big salad', scale: 2 }]);
  });
});
