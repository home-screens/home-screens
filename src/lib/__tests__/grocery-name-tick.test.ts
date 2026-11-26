import { describe, expect, it } from 'vitest';
import { groceryTickByName } from '../grocery-name-tick';
import type { GroceryList } from '../grocery-utils';
import type { TodoListItem } from '@/types/todos';

/** A tick by name ("check off milk") on a week's list that holds the meals' ingredients and the other things to buy. */

const AT = '2026-11-18T10:00:00.000Z';

const meals: GroceryList = new Map([
  ['dairy', { items: [{ name: 'Milk', amount: '1 gal', checked: false }, { name: 'Crème fraîche', amount: '', checked: true }] }],
  ['bakery', { items: [{ name: 'Tortillas', amount: '12', checked: false }] }],
]);

const extras: TodoListItem[] = [
  { id: 'towels', text: 'Paper towels', completed: false, createdAt: AT },
  { id: 'food', text: 'Dog food', completed: true, createdAt: AT, completedAt: AT },
  { id: 'milk', text: 'milk', completed: false, createdAt: AT },
  { id: 'creme', text: 'Creme Fraiche', completed: false, createdAt: AT },
];

describe('groceryTickByName', () => {
  it('ticks an item on the other-things list there, and leaves the meal ticks alone', () => {
    expect(groceryTickByName(meals, extras, 'Paper Towels', 'check')).toEqual({ meal: null, todo: { ids: ['towels'], completed: true } });
    expect(groceryTickByName(meals, extras, 'dog food', 'uncheck')).toEqual({ meal: null, todo: { ids: ['food'], completed: false } });
  });

  it('changes nothing on a repeat', () => {
    expect(groceryTickByName(meals, extras, 'Dog food', 'check')).toEqual({ meal: null, todo: { ids: [], completed: true } });
  });

  it('flips an item on the other-things list when no direction is sent', () => {
    expect(groceryTickByName(meals, extras, 'paper towels').todo).toEqual({ ids: ['towels'], completed: true });
    expect(groceryTickByName(meals, extras, 'dog food').todo).toEqual({ ids: ['food'], completed: false });
  });

  it('keeps the call as sent for a name the other-things list does not have', () => {
    expect(groceryTickByName(meals, extras, 'Tortillas', 'check')).toEqual({ meal: { direction: 'check' }, todo: null });
    expect(groceryTickByName(meals, extras, 'Tortillas')).toEqual({ meal: { direction: undefined }, todo: null });
    expect(groceryTickByName(meals, [], 'Milk')).toEqual({ meal: { direction: undefined }, todo: null });
    // On neither list: the meals' ticks take it, as they always have.
    expect(groceryTickByName(meals, extras, 'saffron', 'check')).toEqual({ meal: { direction: 'check' }, todo: null });
  });

  it('ticks a name on both lists on both, in one direction', () => {
    expect(groceryTickByName(meals, extras, 'MILK', 'check')).toEqual({ meal: { direction: 'check' }, todo: { ids: ['milk'], completed: true } });
    expect(groceryTickByName(meals, extras, 'milk', 'uncheck')).toEqual({ meal: { direction: 'uncheck' }, todo: { ids: [], completed: false } });
  });

  it('flips a name on both lists to ticked while any of its rows is left to get', () => {
    // Ticked as an ingredient, still open on the other-things list: both end up ticked.
    expect(groceryTickByName(meals, extras, 'creme fraiche')).toEqual({ meal: { direction: 'check' }, todo: { ids: ['creme'], completed: true } });
    const bothTicked = extras.map((it) => (it.id === 'creme' ? { ...it, completed: true, completedAt: AT } : it));
    expect(groceryTickByName(meals, bothTicked, 'Crème Fraîche')).toEqual({ meal: { direction: 'uncheck' }, todo: { ids: ['creme'], completed: false } });
  });
});
