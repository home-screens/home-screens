import { describe, it, expect } from 'vitest';
import {
  generateGroceryList,
  groceryListNeedsHeadings,
  plannedMealsWithoutIngredients,
  shortNameList,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/grocery-utils';
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
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'breakfast', mealId: 'nonexistent' }];
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
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.has('meat')).toBe(true);
    expect(result.has('produce')).toBe(true);
    expect(result.get('meat')!.items[0].name).toBe('Chicken');
    expect(result.get('produce')!.items[0].name).toBe('Lettuce');
  });

  it("adds up an ingredient's amounts across meals", () => {
    const meals = [
      meal('a', [{ name: 'Butter', amount: '2 tbsp', category: 'dairy' }]),
      meal('b', [{ name: 'Butter', amount: '1 tbsp', category: 'dairy' }]),
    ];
    const plan: PlannedMeal[] = [
      { date: '2026-04-04', slot: 'breakfast', mealId: 'a' },
      { date: '2026-04-05', slot: 'lunch', mealId: 'b' },
    ];

    const result = generateGroceryList(plan, meals, []);
    const dairy = result.get('dairy')!;
    expect(dairy.items).toHaveLength(1);
    expect(dairy.items[0].amount).toBe('3 tbsp');
  });

  it('counts a meal planned twice in the week twice', () => {
    const meals = [
      meal('tacos', [{ name: 'Ground beef', amount: '2 lb' }]),
      meal('chili', [{ name: 'Ground beef', amount: '1 lb' }, { name: 'Bread', amount: '1 loaf' }]),
    ];
    const plan: PlannedMeal[] = [
      { date: '2026-04-04', slot: 'dinner', mealId: 'tacos' },
      { date: '2026-04-05', slot: 'dinner', mealId: 'chili' },
      { date: '2026-04-06', slot: 'dinner', mealId: 'tacos' },
      { date: '2026-04-07', slot: 'lunch', mealId: 'chili' },
    ];
    const items = [...generateGroceryList(plan, meals, []).values()].flatMap((g) => g.items);
    expect(items.find((i) => i.name === 'Ground beef')!.amount).toBe('6 lb');
    expect(items.find((i) => i.name === 'Bread')!.amount).toBe('2 loaves');
  });

  it('merges seafood into meat category', () => {
    const meals = [
      meal('a', [{ name: 'Salmon', amount: '1 fillet', category: 'seafood' }]),
    ];
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.has('seafood')).toBe(false);
    expect(result.has('meat')).toBe(true);
    expect(result.get('meat')!.items[0].name).toBe('Salmon');
  });

  it('defaults missing category to other', () => {
    const meals = [
      meal('a', [{ name: 'Sriracha', amount: '1 bottle' }]),
    ];
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'lunch', mealId: 'a' }];

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
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'breakfast', mealId: 'a' }];

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
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'breakfast', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, ['butter']);
    const names = result.get('dairy')!.items.map((i) => i.name);
    // Unchecked first (alphabetical), then checked
    expect(names).toEqual(['Cream', 'Yogurt', 'Butter']);
  });

  it('capitalizes ingredient names', () => {
    const meals = [
      meal('a', [{ name: 'brown sugar', amount: '1 cup', category: 'pantry' }]),
    ];
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

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
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

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
      { date: '2026-04-04', slot: 'lunch', mealId: '' },
      { date: '2026-04-05', slot: 'dinner', mealId: 'a' },
    ];

    const result = generateGroceryList(plan, meals, []);
    expect(result.size).toBe(1);
    expect(result.get('pantry')!.items).toHaveLength(1);
  });

  it('skips meals that have no ingredients', () => {
    const meals = [meal('a', undefined)];
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

    const result = generateGroceryList(plan, meals, []);
    expect(result.size).toBe(0);
  });
});

/**
 * Before this, the category select was a fourth control on a three-tap form
 * row, so a hurried parent set none of them and every item on the week's list
 * appeared under one OTHER heading.
 */
describe('uncategorised ingredients', () => {
  const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'a' }];

  it('files them by name instead of dropping them all in other', () => {
    const meals = [meal('a', [
      { name: 'Ground beef', amount: '1 lb' },
      { name: 'Cheddar cheese', amount: '200g' },
      { name: 'Tomatoes', amount: '4' },
    ])];
    const result = generateGroceryList(plan, meals, []);
    expect([...result.keys()].sort()).toEqual(['dairy', 'meat', 'produce']);
    expect(result.get('other')).toBeUndefined();
  });

  it('never guesses over a category the household set', () => {
    const meals = [meal('a', [{ name: 'Ground beef', amount: '1 lb', category: 'pantry' }])];
    const result = generateGroceryList(plan, meals, []);
    expect([...result.keys()]).toEqual(['pantry']);
  });

  it('reads "other" as no aisle given: the phone saved it on every row nobody touched', () => {
    const meals = [
      meal('a', [{ name: 'Milk', amount: '1 l', category: 'other' }, { name: 'Chicken', category: 'other' }]),
      meal('b', [{ name: 'Milk', amount: '2 cups' }]),
    ];
    const both: PlannedMeal[] = [...plan, { date: '2026-04-05', slot: 'dinner', mealId: 'b' }];
    const result = generateGroceryList(both, meals, []);
    expect([...result.keys()].sort()).toEqual(['dairy', 'meat']);
    // One Milk, in one aisle, with both amounts.
    expect(result.get('dairy')!.items).toEqual([{ name: 'Milk', amount: '1 l, 2 cups', checked: false }]);
  });

  it('leaves out a row that was saved with no name', () => {
    const meals = [meal('a', [{ name: '', amount: '', category: 'other' }, { name: '   ' }, { name: 'Tomatoes' }])];
    const result = generateGroceryList(plan, meals, []);
    expect([...result.values()].flatMap((group) => group.items.map((item) => item.name))).toEqual(['Tomatoes']);
  });

  it('still falls back to other for a name it cannot place', () => {
    const meals = [meal('a', [{ name: 'Birthday candles', amount: '1 box' }])];
    expect([...generateGroceryList(plan, meals, []).keys()]).toEqual(['other']);
  });
});

describe('groceryListNeedsHeadings', () => {
  const list = (...keys: string[]) =>
    new Map(keys.map((k) => [k, { items: [{ name: 'x' }] }]));

  it('draws headings once there is more than one aisle', () => {
    expect(groceryListNeedsHeadings(list('produce', 'meat'))).toBe(true);
  });

  /* One heading over the whole list is a label on a flat list, not a grouping. */
  it('leaves them off a single-aisle list', () => {
    expect(groceryListNeedsHeadings(list('other'))).toBe(false);
    expect(groceryListNeedsHeadings(list())).toBe(false);
  });
});

describe('plannedMealsWithoutIngredients', () => {
  const meals: SavedMeal[] = [
    meal('roast', undefined),
    meal('tacos', [{ name: 'Tortillas', amount: '8' }]),
    meal('soup', []),
    meal('blank', [{ name: '  ', amount: '1' }]),
    meal('pie', undefined),
  ];

  it('names the planned meals that add nothing to the list, once each, in the order of the week', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-05', slot: 'dinner', mealId: 'soup' },
      { date: '2026-04-04', slot: 'dinner', mealId: 'roast', courses: [{ kind: 'dessert', mealId: 'pie' }] },
      { date: '2026-04-04', slot: 'lunch', mealId: 'tacos' },
      { date: '2026-04-06', slot: 'dinner', mealId: 'roast' },
      { date: '2026-04-06', slot: 'lunch', mealId: 'blank' },
    ];
    expect(plannedMealsWithoutIngredients(plan, meals).map((m) => m.id)).toEqual(['roast', 'pie', 'soup', 'blank']);
  });

  it('leaves out meals typed straight into the plan and meals no longer saved', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-04', slot: 'dinner', customText: 'Pizza night' },
      { date: '2026-04-05', slot: 'dinner', mealId: 'gone' },
      { date: '2026-04-06', slot: 'dinner', mealId: 'tacos' },
    ];
    expect(plannedMealsWithoutIngredients(plan, meals)).toEqual([]);
  });
});

describe('shortNameList', () => {
  const more = (count: number) => `${count} more`;

  it('names up to four in full', () => {
    expect(shortNameList(['Soup'], 'en-US', more)).toBe('Soup');
    expect(shortNameList(['Soup', 'Pie'], 'en-US', more)).toBe('Soup and Pie');
    expect(shortNameList(['A', 'B', 'C', 'D'], 'en-US', more)).toBe('A, B, C, and D');
  });

  it('names three and counts the rest past four', () => {
    expect(shortNameList(['A', 'B', 'C', 'D', 'E'], 'en-US', more)).toBe('A, B, C, and 2 more');
    expect(shortNameList(['A', 'B', 'C', 'D', 'E'], 'de-DE', (n) => `${n} weitere`)).toBe('A, B, C und 2 weitere');
  });
});
