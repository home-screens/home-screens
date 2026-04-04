import { describe, it, expect } from 'vitest';
import { generateGroceryList, GROCERY_CATEGORY_ORDER } from '@/lib/grocery-utils';
import type { SavedMeal, PlannedMeal } from '@/types/config';

const meal = (id: string, ingredients: SavedMeal['ingredients']): SavedMeal => ({
  id,
  name: `Meal ${id}`,
  ingredients,
});

describe('generateGroceryList', () => {
  it('returns empty map when plan is empty', () => {
    const result = generateGroceryList([], [], []);
    expect(result.size).toBe(0);
  });

  it('returns empty map when plan references no saved meals', () => {
    const plan: PlannedMeal[] = [{ day: 0, slot: 'breakfast', mealId: 'nonexistent' }];
    const result = generateGroceryList(plan, [], []);
    expect(result.size).toBe(0);
  });

  it('groups ingredients by category', () => {
    const meals = [
      meal('a', [
        { name: 'Chicken', amount: '1 lb', category: 'meat' },
        { name: 'Lettuce', amount: '1 head', category: 'produce' },
      ]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.has('meat')).toBe(true);
    expect(result.has('produce')).toBe(true);
    expect(result.get('meat')!.items[0].name).toBe('Chicken');
    expect(result.get('produce')!.items[0].name).toBe('Lettuce');
  });

  it('merges duplicate ingredient amounts across meals', () => {
    const meals = [
      meal('a', [{ name: 'Butter', amount: '2 tbsp', category: 'dairy' }]),
      meal('b', [{ name: 'Butter', amount: '1 tbsp', category: 'dairy' }]),
    ];
    const plan: PlannedMeal[] = [
      { day: 0, slot: 'breakfast', mealId: 'a' },
      { day: 1, slot: 'lunch', mealId: 'b' },
    ];

    const result = generateGroceryList(plan, meals, []);
    const dairy = result.get('dairy')!;
    expect(dairy.items).toHaveLength(1);
    expect(dairy.items[0].amount).toBe('2 tbsp, 1 tbsp');
  });

  it('merges seafood into meat category', () => {
    const meals = [
      meal('a', [{ name: 'Salmon', amount: '1 fillet', category: 'seafood' }]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.has('seafood')).toBe(false);
    expect(result.has('meat')).toBe(true);
    expect(result.get('meat')!.items[0].name).toBe('Salmon');
  });

  it('defaults missing category to other', () => {
    const meals = [
      meal('a', [{ name: 'Sriracha', amount: '1 bottle' }]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'lunch', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.has('other')).toBe(true);
    expect(result.get('other')!.items[0].name).toBe('Sriracha');
  });

  it('marks checked items correctly', () => {
    const meals = [
      meal('a', [
        { name: 'Milk', amount: '1 gal', category: 'dairy' },
        { name: 'Eggs', amount: '1 doz', category: 'dairy' },
      ]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'breakfast', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, ['milk']);
    const dairy = result.get('dairy')!;
    const milk = dairy.items.find((i) => i.name === 'Milk')!;
    const eggs = dairy.items.find((i) => i.name === 'Eggs')!;
    expect(milk.checked).toBe(true);
    expect(eggs.checked).toBe(false);
  });

  it('sorts checked items after unchecked, then alphabetically', () => {
    const meals = [
      meal('a', [
        { name: 'Yogurt', amount: '', category: 'dairy' },
        { name: 'Butter', amount: '', category: 'dairy' },
        { name: 'Cream', amount: '', category: 'dairy' },
      ]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'breakfast', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, ['butter']);
    const names = result.get('dairy')!.items.map((i) => i.name);
    // Unchecked first (alphabetical), then checked
    expect(names).toEqual(['Cream', 'Yogurt', 'Butter']);
  });

  it('capitalizes ingredient names', () => {
    const meals = [
      meal('a', [{ name: 'brown sugar', amount: '1 cup', category: 'pantry' }]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.get('pantry')!.items[0].name).toBe('Brown sugar');
  });

  it('respects GROCERY_CATEGORY_ORDER for output keys', () => {
    const meals = [
      meal('a', [
        { name: 'Item1', amount: '', category: 'frozen' },
        { name: 'Item2', amount: '', category: 'produce' },
        { name: 'Item3', amount: '', category: 'pantry' },
      ]),
    ];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    const keys = Array.from(result.keys());
    const orderIndices = keys.map((k) => GROCERY_CATEGORY_ORDER.indexOf(k));
    // Keys should be in ascending order per GROCERY_CATEGORY_ORDER
    for (let i = 1; i < orderIndices.length; i++) {
      expect(orderIndices[i]).toBeGreaterThan(orderIndices[i - 1]);
    }
  });

  it('skips plan entries with no mealId', () => {
    const meals = [meal('a', [{ name: 'Rice', amount: '1 cup', category: 'pantry' }])];
    const plan: PlannedMeal[] = [
      { day: 0, slot: 'lunch', mealId: '' },
      { day: 1, slot: 'dinner', mealId: 'a' },
    ];

    const result = generateGroceryList(plan, meals, []);
    expect(result.size).toBe(1);
    expect(result.get('pantry')!.items).toHaveLength(1);
  });

  it('skips meals that have no ingredients', () => {
    const meals = [meal('a', undefined)];
    const plan: PlannedMeal[] = [{ day: 0, slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.size).toBe(0);
  });
});
