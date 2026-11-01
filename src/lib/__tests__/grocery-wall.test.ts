import { describe, expect, it } from 'vitest';
import { wallGroceryFlatRows, wallGroceryFromLocal, wallGroceryFromMealie, wallGroceryRows } from '../grocery-wall';
import { GROCERY_CATEGORY_ICONS } from '../grocery-utils';
import type { ShoppingList } from '../shopping-list';

const mealie: ShoppingList = {
  id: 'l1',
  name: 'Groceries',
  groups: [
    { label: null, items: [
      { id: 'a', text: 'Birthday candles', name: 'Birthday candles', checked: false, recipes: [] },
      { id: 'b', text: '3 Spring Onions', note: 'chopped', name: 'Spring Onions', checked: true, recipes: [] },
    ] },
    { label: 'Produce', items: [{ id: 'c', text: '1 pomegranate', name: 'pomegranate', checked: false, recipes: ['Salad'] }] },
    { label: 'Household', items: [{ id: 'd', text: 'Paper towels', name: 'Paper towels', checked: true, recipes: [] }] },
  ],
};

describe('wallGroceryFromMealie', () => {
  it('keeps Mealie\'s order, ids, lines and notes', () => {
    const groups = wallGroceryFromMealie(mealie);
    expect(groups.map((g) => g.label)).toEqual([null, 'Produce', 'Household']);
    expect(groups[0].items[1]).toEqual({ id: 'b', text: '3 Spring Onions', note: 'chopped', checked: true });
  });
});

describe('wallGroceryFromLocal', () => {
  it('names a tick by the lowercase item and names aisles when there are several', () => {
    const list = new Map([
      ['produce', { items: [{ name: 'Red onions', amount: '3', checked: false }] }],
      ['dairy', { items: [{ name: 'Milk', amount: '', checked: true }] }],
    ]);
    expect(wallGroceryFromLocal(list)).toEqual([
      { key: 'produce', label: null, aisle: 'produce', items: [{ id: 'red onions', text: 'Red onions', amount: '3', checked: false }] },
      { key: 'dairy', label: null, aisle: 'dairy', items: [{ id: 'milk', text: 'Milk', checked: true }] },
    ]);
  });

  it('names a tick the way ticks are stored, whatever spaces the name came with', () => {
    const list = new Map([['dairy', { items: [{ name: 'Milk ', amount: '', checked: false }] }]]);
    expect(wallGroceryFromLocal(list)[0].items[0].id).toBe('milk');
  });

  it('draws one aisle with no heading, as the phone does', () => {
    const list = new Map([['other', { items: [{ name: 'Foil', amount: '', checked: false }] }]]);
    expect(wallGroceryFromLocal(list)[0].aisle).toBeUndefined();
  });
});

describe('wallGroceryRows', () => {
  const groups = wallGroceryFromMealie(mealie);

  it('draws only what is still to get, and counts the whole list', () => {
    const rows = wallGroceryRows(groups, new Map(), new Set());
    expect(rows.groups.map((g) => g.items.map((i) => i.id))).toEqual([['a'], ['c']]);
    expect(rows).toMatchObject({ left: 2, got: 2 });
  });

  it('keeps an item ticked here drawn, ticked, while it is kept', () => {
    const rows = wallGroceryRows(groups, new Map([['c', true]]), new Set(['c']));
    expect(rows.groups[1].items).toEqual([{ id: 'c', text: '1 pomegranate', checked: true }]);
    expect(rows).toMatchObject({ left: 1, got: 3 });
    expect(wallGroceryRows(groups, new Map([['c', true]]), new Set()).groups.map((g) => g.label)).toEqual([null]);
  });

  it("counts each group's items still to get, not the crossed-out ones it keeps drawing", () => {
    const rows = wallGroceryRows(groups, new Map([['c', true]]), new Set(['c']));
    expect(rows.groups.map((g) => [g.label, g.items.length, g.left])).toEqual([[null, 1, 1], ['Produce', 1, 0]]);
  });

  it('brings back an item put back from here', () => {
    const rows = wallGroceryRows(groups, new Map([['d', false]]), new Set());
    expect(rows.groups.map((g) => g.label)).toEqual([null, 'Produce', 'Household']);
    expect(rows).toMatchObject({ left: 3, got: 1 });
  });
});

describe('wallGroceryFlatRows', () => {
  it("puts each group's heading and aisle icon on its first item, and its count on every item", () => {
    const local = wallGroceryFromLocal(new Map([
      ['produce', { items: [{ name: 'Onions', amount: '', checked: false }, { name: 'Lemons', amount: '', checked: true }] }],
      ['dairy', { items: [{ name: 'Milk', amount: '', checked: false }] }],
    ]));
    const rows = wallGroceryFlatRows(wallGroceryRows(local, new Map(), new Set(['lemons'])).groups, (g) => g.aisle ?? null);
    expect(rows.map((r) => [r.item.id, r.heading, r.icon, r.left])).toEqual([
      ['onions', 'produce', GROCERY_CATEGORY_ICONS.produce, 1],
      ['lemons', null, undefined, 1],
      ['milk', 'dairy', GROCERY_CATEGORY_ICONS.dairy, 1],
    ]);
  });
});
