import { describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_SETTINGS, normalizeMealSettings } from '@/lib/meal-constants';
import { resetMealSettings, setGroceryExtrasList } from '../meal-settings';
import { groceryExtrasItems, todoItemOfGroceryRow, wallGroceryFlatRows, wallGroceryFromTodoList, wallGroceryRows } from '../grocery-wall';
import type { MealSettings } from '@/types/config';
import type { TodoList } from '@/types/todos';

/** The family's list for the other things to buy: the meal setting and how the grocery list shows it. */

const base = (): MealSettings => ({ ...DEFAULT_MEAL_SETTINGS, enabledSlots: [...DEFAULT_MEAL_SETTINGS.enabledSlots], defaultSlotTimes: {} });

describe('setGroceryExtrasList', () => {
  it('picks a list, changes nothing for the same one, and clears with undefined', () => {
    const picked = setGroceryExtrasList(base(), 'shop');
    expect(picked.groceryExtrasListId).toBe('shop');
    expect(setGroceryExtrasList(picked, 'shop')).toBe(picked);
    expect('groceryExtrasListId' in setGroceryExtrasList(picked, undefined)).toBe(false);
  });

  it('survives a reset of the planning settings', () => {
    expect(resetMealSettings(setGroceryExtrasList(base(), 'shop')).groceryExtrasListId).toBe('shop');
  });

  it('is kept by the read-time clean-up, and anything but an id is dropped', () => {
    expect(normalizeMealSettings({ groceryExtrasListId: 'shop' }).groceryExtrasListId).toBe('shop');
    expect('groceryExtrasListId' in normalizeMealSettings({ groceryExtrasListId: 7 })).toBe(false);
    expect('groceryExtrasListId' in normalizeMealSettings({ groceryExtrasListId: '  ' })).toBe(false);
  });
});

const NOW = '2026-11-18T10:00:00.000Z';
const shopping = (): TodoList => ({
  id: 'shop', name: 'Shopping', slug: 'shopping', color: '#22c55e', repeat: 'never', createdAt: NOW, updatedAt: NOW,
  items: [
    { id: 'towels', text: 'Paper towels', completed: false, createdAt: NOW },
    { id: 'food', text: 'Dog food', completed: true, createdAt: NOW, completedAt: '2026-11-17T09:00:00.000Z' },
    { id: 'old', text: 'Batteries', completed: true, createdAt: NOW, completedAt: '2026-10-02T09:00:00.000Z' },
  ],
});

describe('groceryExtrasItems', () => {
  it("keeps what is still to get and this week's ticks, not last month's", () => {
    expect(groceryExtrasItems(shopping(), '2026-11-16').map((it) => it.id)).toEqual(['towels', 'food']);
  });
});

describe('wallGroceryFromTodoList', () => {
  it('is a group named after the list, in its colour, with rows that name the to-do item', () => {
    const group = wallGroceryFromTodoList(shopping(), '2026-11-16');
    expect(group).toMatchObject({ extrasList: 'Shopping', color: '#22c55e', label: null });
    expect(group.items.map((it) => [it.text, it.checked])).toEqual([['Paper towels', false], ['Dog food', true]]);
    expect(todoItemOfGroceryRow(group.items[0].id)).toBe('towels');
    expect(todoItemOfGroceryRow('milk')).toBeNull();
  });

  it('counts its ticks into the list and carries its dot onto the first row', () => {
    const rows = wallGroceryRows([wallGroceryFromTodoList(shopping(), '2026-11-16')], new Map(), new Set());
    expect(rows).toMatchObject({ left: 1, got: 1 });
    const flat = wallGroceryFlatRows(rows.groups, (g) => (g.extrasList ? `Also on ${g.extrasList}` : null));
    expect(flat.map((r) => [r.item.text, r.heading, r.dot])).toEqual([['Paper towels', 'Also on Shopping', '#22c55e']]);
  });
});
