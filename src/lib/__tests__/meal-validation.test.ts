import { describe, it, expect } from 'vitest';
import { validateMealData, validateMealPlan, validateSavedMeals } from '../meal-validation';

describe('meal validation', () => {
  const tacos = { id: 'm1', name: 'Tacos', emoji: '🌮' };

  it('accepts the file the store writes, and the older shapes it still reads', () => {
    expect(validateMealData({ savedMeals: [tacos], plan: [{ date: '2026-04-04', slot: 'dinner', mealId: 'm1' }], groceryChecked: {}, settings: {} })).toBeNull();
    // A day number from an older build and a single grocery list both read back fine.
    expect(validateMealData({ savedMeals: [], plan: [{ day: 2, slot: 'dinner', mealId: 'm1' }], groceryChecked: ['flour'] })).toBeNull();
  });

  it.each([
    ['a list instead of the file', [], 'Meals need saved meals and a plan.'],
    ['no saved meal list', { plan: [] }, 'Meals need a list of saved meals.'],
    ['a saved meal without a name', { savedMeals: [{ id: 'm1' }], plan: [] }, 'Each saved meal needs an id and a name.'],
    ['no plan', { savedMeals: [] }, 'Meals need a plan.'],
    ['a planned meal without a day', { savedMeals: [], plan: [{ slot: 'dinner' }] }, 'Each planned meal needs a day.'],
  ])('refuses %s', (_name, raw, message) => {
    expect(validateMealData(raw)).toBe(message);
  });

  it('checks each list on its own for a partial save', () => {
    expect(validateSavedMeals([tacos])).toBeNull();
    expect(validateSavedMeals('tacos')).toBe('Meals need a list of saved meals.');
    expect(validateMealPlan([{ date: '2026-04-04', slot: 'lunch' }])).toBeNull();
    expect(validateMealPlan({})).toBe('Meals need a plan.');
  });
});
