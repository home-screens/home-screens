import { describe, it, expect } from 'vitest';
import { mapMealieShoppingList, mealieListSummary, type MealieShoppingItem, type MealieShoppingListRaw } from '../mealie-shopping-map';

// Shapes as a real Mealie 3.29.0 answers them (recorded 2026-10-31 from the
// rig's "Groceries" list), trimmed to the fields Home Screens reads.
const BAKING = { id: 'l-baking', name: 'Baking' };
const DAIRY = { id: 'l-dairy', name: 'Dairy Products' };
const SPICES = { id: 'l-spices', name: 'Spices' };
const PUDDINGS = 'r-puddings';
const LASAGNE = 'r-lasagne';

function item(id: string, fields: Partial<MealieShoppingItem>): MealieShoppingItem {
  return { id, shoppingListId: 'list-1', checked: false, position: 0, quantity: 0, note: '', display: '', food: null, unit: null, label: null, recipeReferences: [], ...fields };
}

const RAW: MealieShoppingListRaw = {
  id: 'list-1',
  name: 'Groceries',
  labelSettings: [
    { position: 0, label: BAKING },
    { position: 1, label: DAIRY },
    { position: 2, label: SPICES },
  ],
  recipeReferences: [
    { recipeId: PUDDINGS, recipe: { name: 'Yorkshire Puddings' } },
    { recipeId: LASAGNE, recipe: { name: 'Lasagne Sandwiches' } },
  ],
  listItems: [
    item('salt-taste', { quantity: 0, note: 'To taste', display: 'salt To taste', food: { name: 'salt' }, label: SPICES, recipeReferences: [{ recipeId: LASAGNE }] }),
    item('flour', { quantity: 140, display: '140 grams flour', food: { name: 'flour' }, unit: { name: 'gram' }, label: BAKING, recipeReferences: [{ recipeId: PUDDINGS }] }),
    item('eggs', { checked: true, quantity: 4, display: '4 eggs', food: { name: 'egg' }, label: DAIRY, recipeReferences: [{ recipeId: PUDDINGS }, { recipeId: LASAGNE }] }),
    item('milk-typed', { quantity: 1, note: 'Milk', display: '1 Milk' }),
    item('tape', { quantity: 0, note: 'Probe tape', display: 'Probe tape' }),
    item('bread-two', { quantity: 2, note: 'Bread', display: '2 Bread' }),
    item('salt-tsp', { quantity: 1.25, display: '1 ¹/₄ teaspoons salt', food: { name: 'salt' }, unit: { name: 'teaspoon' }, label: SPICES, recipeReferences: [{ recipeId: PUDDINGS }, { recipeId: PUDDINGS }] }),
    item('steak', { quantity: 1, display: '1 kilogram Beef Flank Steak', food: { name: 'Beef Flank Steak' }, unit: { name: 'kilogram' } }),
  ],
};

describe('mapMealieShoppingList', () => {
  const list = mapMealieShoppingList(RAW);

  it('puts items with no label first, then the list\'s own label order', () => {
    expect(list.groups.map((g) => g.label)).toEqual([null, 'Baking', 'Dairy Products', 'Spices']);
  });

  it('reads a typed item as typed, never "1 Milk"', () => {
    const none = list.groups[0].items;
    expect(none.map((i) => i.text)).toEqual(['Milk', 'Probe tape', '2 Bread', '1 kilogram Beef Flank Steak']);
    expect(none.map((i) => i.name)).toEqual(['Milk', 'Probe tape', 'Bread', 'Beef Flank Steak']);
  });

  it("keeps Mealie's wording and puts the note on its own line", () => {
    const [saltTaste, saltTsp] = list.groups[3].items;
    expect(saltTaste).toMatchObject({ text: 'salt', note: 'To taste', name: 'salt' });
    expect(saltTsp).toMatchObject({ text: '1 ¹/₄ teaspoons salt', name: 'salt' });
    expect(saltTsp.note).toBeUndefined();
    expect(list.groups[2].items[0]).toMatchObject({ text: '4 eggs', checked: true });
  });

  it('names a line the way a person says it, keeping the food name too', () => {
    expect(list.groups[2].items[0]).toMatchObject({ name: 'eggs', alsoCalled: 'egg' });
    expect(list.groups[1].items[0]).toMatchObject({ text: '140 grams flour', name: 'flour' });
    expect(list.groups[1].items[0].alsoCalled).toBeUndefined();
    const raw: MealieShoppingListRaw = { id: 'x', name: 'x', listItems: [
      item('bread', { quantity: 8, display: '8 Slices bread', food: { name: 'bread' }, unit: { name: 'Slices' } }),
      item('leaves', { quantity: 5, display: '5 bay leaves', food: { name: 'bay leaf' } }),
      item('cream', { quantity: 0.25, display: '¹/₄ cup sour cream', food: { name: 'sour cream' }, unit: { name: 'cup', abbreviation: 'c' } }),
    ] };
    expect(mapMealieShoppingList(raw).groups[0].items.map((i) => [i.name, i.alsoCalled])).toEqual([
      ['bread', undefined],
      ['bay leaves', 'bay leaf'],
      ['sour cream', undefined],
    ]);
  });

  it("keeps a recipe's name once Mealie drops it from the list (all its items ticked)", () => {
    const raw: MealieShoppingListRaw = { id: 'x', name: 'x', recipeReferences: [], listItems: [
      item('flour', { checked: true, display: '140 grams flour', food: { name: 'flour' }, recipeReferences: [{ recipeId: PUDDINGS }] }),
    ] };
    expect(mapMealieShoppingList(raw).groups[0].items[0].recipes).toEqual([]);
    expect(mapMealieShoppingList(raw, new Map([[PUDDINGS, 'Yorkshire Puddings']])).groups[0].items[0].recipes).toEqual(['Yorkshire Puddings']);
  });

  it('names the recipes an item is for, once each', () => {
    expect(list.groups[2].items[0].recipes).toEqual(['Yorkshire Puddings', 'Lasagne Sandwiches']);
    expect(list.groups[3].items[1].recipes).toEqual(['Yorkshire Puddings']);
    expect(list.groups[0].items[0].recipes).toEqual([]);
  });

  it('orders by position inside a label, ties in the order Mealie answered', () => {
    const raw: MealieShoppingListRaw = {
      id: 'x', name: 'x', listItems: [
        item('b', { position: 2, note: 'B' }),
        item('a', { position: 1, note: 'A' }),
        item('c', { position: 2, note: 'C' }),
      ],
    };
    expect(mapMealieShoppingList(raw).groups[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts a label the list has no setting for after the ordered ones', () => {
    const raw: MealieShoppingListRaw = {
      id: 'x', name: 'x', labelSettings: [{ position: 0, label: BAKING }], listItems: [
        item('new', { note: 'Hot sauce', label: { id: 'l-new', name: 'Sauces' } }),
        item('flour', { note: 'Flour', label: BAKING }),
      ],
    };
    expect(mapMealieShoppingList(raw).groups.map((g) => g.label)).toEqual(['Baking', 'Sauces']);
  });

  it('counts what is left for the list chooser', () => {
    expect(mealieListSummary(RAW)).toEqual({ id: 'list-1', name: 'Groceries', left: 7 });
    expect(mealieListSummary({ id: 'e', name: 'Empty' })).toEqual({ id: 'e', name: 'Empty', left: 0 });
  });
});
