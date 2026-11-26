/**
 * Route-level tests for `/api/meals/grocery`.
 *
 * The shared meal store (`meal-data`) is faked so we exercise only the route:
 * GET returns one week's checked set, POST validates and toggles an item on
 * one week's list (add when absent, remove when present) and persists through
 * one `updateMealData` cycle. The fake models the store's no-op contract
 * exactly: a mutator that returns the reference it was handed skips the write.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MealData } from '@/lib/meal-data';
import type { GroceryChecked } from '@/lib/grocery-checks';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withAuth: (handler: unknown) => handler,
    withDisplayAuth: (handler: unknown) => handler,
  };
});

vi.mock('@/lib/meal-data', () => ({
  readMealData: vi.fn(),
  updateMealData: vi.fn(),
}));

vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  readMealieShopping: vi.fn(),
  setMealieShoppingItemChecked: vi.fn(),
}));

vi.mock('@/lib/todo-data', () => ({
  readTodoData: vi.fn(),
  updateTodoData: vi.fn(),
}));

// Wednesday of the Sunday-start week Sep 27 - Oct 3.
vi.mock('@/lib/household-day', () => ({
  householdToday: vi.fn(async () => '2026-09-30'),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { readMealData, updateMealData } from '@/lib/meal-data';
import { MealieShoppingGoneError, readMealieShopping, setMealieShoppingItemChecked } from '@/lib/mealie-shopping';
import { MealieError } from '@/lib/mealie';
import { readTodoData, updateTodoData } from '@/lib/todo-data';
import type { TodoData } from '@/types/todos';

const mockRead = vi.mocked(readMealData);
const mockUpdate = vi.mocked(updateMealData);

const THIS_WEEK = '2026-09-27';
const NEXT_WEEK = '2026-10-04';

function mealData(groceryChecked: GroceryChecked, plannedDays: string[] = ['2026-09-30', '2026-10-06']): MealData {
  return {
    savedMeals: [],
    plan: plannedDays.map((date) => ({ date, slot: 'dinner', mealId: 'tacos' })),
    groceryChecked,
    settings: { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultSlotTimes: {} },
  };
}

/** Stand-in for the on-disk store, plus the values that actually got written. */
let current: MealData;
let persisted: MealData[];

function setStore(groceryChecked: GroceryChecked, plannedDays?: string[]): void {
  current = mealData(groceryChecked, plannedDays);
  mockRead.mockResolvedValue(current);
}

/** Apply a mutator the way `updateAtomic` does: same reference back means no write. */
function applyMutator(mutator: (d: MealData) => MealData | Promise<MealData>) {
  return async () => {
    const next = await mutator(current);
    if (next !== current) {
      current = next;
      persisted.push(next);
    }
    return current;
  };
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/meals/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  persisted = [];
  setStore({});
  mockUpdate.mockImplementation((mutator) => applyMutator(mutator)());
});

describe('GET /api/meals/grocery', () => {
  it('returns this week\'s checked state by default', async () => {
    setStore({ [THIS_WEEK]: ['milk', 'eggs'], [NEXT_WEEK]: ['bread'] });
    const res = await GET(new NextRequest('http://localhost/api/meals/grocery'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk', 'eggs'] });
  });

  it('returns the week holding ?week=', async () => {
    setStore({ [THIS_WEEK]: ['milk'], [NEXT_WEEK]: ['bread'] });
    const res = await GET(new NextRequest('http://localhost/api/meals/grocery?week=2026-10-07'));
    expect(await res.json()).toEqual({ week: NEXT_WEEK, groceryChecked: ['bread'] });
  });

  it('rejects a week that is not a date', async () => {
    const res = await GET(new NextRequest('http://localhost/api/meals/grocery?week=soon'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/meals/grocery', () => {
  it('rejects a non-string item with 400', async () => {
    const res = await POST(postRequest({ item: 42 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty string/);
    expect(persisted).toHaveLength(0);
  });

  it('rejects a blank item with 400', async () => {
    const res = await POST(postRequest({ item: '   ' }));
    expect(res.status).toBe(400);
    expect(persisted).toHaveLength(0);
  });

  it('rejects a week that is not a date with 400', async () => {
    const res = await POST(postRequest({ item: 'milk', week: '2026-13-01' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/week/);
    expect(persisted).toHaveLength(0);
  });

  it('adds an item that is not yet checked', async () => {
    setStore({ [THIS_WEEK]: ['milk'] });
    const res = await POST(postRequest({ item: 'eggs', week: THIS_WEEK }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk', 'eggs'], changed: true });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].groceryChecked).toEqual({ [THIS_WEEK]: ['milk', 'eggs'] });
  });

  it('removes an item that is already checked', async () => {
    setStore({ [THIS_WEEK]: ['milk', 'eggs'] });
    const res = await POST(postRequest({ item: 'milk', week: THIS_WEEK }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['eggs'], changed: true });
    expect(persisted).toHaveLength(1);
  });

  it('ticks on the week named and no other', async () => {
    // Tortillas bought this week must still be on next week's list, and
    // lettuce ticked on next week's list must not show as bought this week.
    setStore({ [THIS_WEEK]: ['tortillas'] });
    const res = await POST(postRequest({ item: 'Lettuce', direction: 'check', week: NEXT_WEEK }));
    expect(await res.json()).toEqual({ week: NEXT_WEEK, groceryChecked: ['lettuce'], changed: true });
    expect(current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['lettuce'] });

    const again = await POST(postRequest({ item: 'tortillas', direction: 'check', week: NEXT_WEEK }));
    expect(await again.json()).toEqual({ week: NEXT_WEEK, groceryChecked: ['lettuce', 'tortillas'], changed: true });
  });

  it('files any day of a week under the day the week starts on', async () => {
    const res = await POST(postRequest({ item: 'milk', week: '2026-10-02' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: true });
  });

  it('ticks on the household\'s current week when no week is sent', async () => {
    // What a voice "check off milk" means.
    const res = await POST(postRequest({ item: 'milk', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: true });
  });

  it('drops the ticks of weeks the plan no longer has meals in', async () => {
    setStore({ '2026-06-07': ['flour'], [THIS_WEEK]: ['milk'] }, ['2026-09-30']);
    await POST(postRequest({ item: 'eggs', week: THIS_WEEK }));
    expect(current.groceryChecked).toEqual({ [THIS_WEEK]: ['milk', 'eggs'] });
  });

  it('keeps the week it ticks even with nothing planned in it yet', async () => {
    setStore({}, []);
    const res = await POST(postRequest({ item: 'milk', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: true });
  });

  it('normalizes display-cased items to the stored lowercase form', async () => {
    setStore({ [THIS_WEEK]: ['milk'] });
    const res = await POST(postRequest({ item: '  Milk ', week: THIS_WEEK }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: true });
  });

  it('rejects an invalid direction with 400', async () => {
    const res = await POST(postRequest({ item: 'milk', direction: 'toggle' }));
    expect(res.status).toBe(400);
    expect(persisted).toHaveLength(0);
  });

  it('direction "check" is a no-op on an already-checked item', async () => {
    setStore({ [THIS_WEEK]: ['milk'] });
    const res = await POST(postRequest({ item: 'Milk', direction: 'check', week: THIS_WEEK }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: false });
    expect(persisted).toHaveLength(0);
  });

  it('direction "uncheck" is a no-op on an unchecked item', async () => {
    setStore({ [THIS_WEEK]: ['milk'] });
    const res = await POST(postRequest({ item: 'milk', direction: 'uncheck', week: NEXT_WEEK }));
    expect(await res.json()).toEqual({ week: NEXT_WEEK, groceryChecked: [], changed: false });
    expect(persisted).toHaveLength(0);
  });

  it('direction "check" adds when absent and "uncheck" removes when present', async () => {
    let res = await POST(postRequest({ item: 'milk', direction: 'check', week: THIS_WEEK }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: true });

    res = await POST(postRequest({ item: 'milk', direction: 'uncheck', week: THIS_WEEK }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: true });
  });

  it('builds the new list inside the transaction, not from an earlier read', async () => {
    // Two phones tapping at once. The route used to read with `readMealData`,
    // splice its own copy, then write it back in a second transaction, so a
    // toggle that committed in between was silently dropped. Here another
    // writer lands 'bread' before this request's mutator runs; 'bread' must
    // survive alongside the item this request is adding.
    setStore({ [THIS_WEEK]: ['milk'] });
    mockUpdate.mockImplementationOnce((mutator) => {
      current = mealData({ [THIS_WEEK]: ['milk', 'bread'] });
      return applyMutator(mutator)();
    });

    const res = await POST(postRequest({ item: 'eggs', week: THIS_WEEK }));
    expect(await res.json()).toEqual({
      week: THIS_WEEK,
      groceryChecked: ['milk', 'bread', 'eggs'],
      changed: true,
    });
  });
});

describe('POST /api/meals/grocery with a list picked for the other things to buy', () => {
  const AT = '2026-09-25T09:00:00.000Z';
  const THIS_WEEK_TICK = '2026-09-28T18:00:00.000Z';

  let todos: TodoData;
  let todoWrites: TodoData[];

  function setExtras(): void {
    const base = mealData({});
    current = {
      ...base,
      savedMeals: [{
        id: 'tacos',
        name: 'Tacos',
        ingredients: [
          { name: 'tortillas', amount: '12', category: 'bakery' },
          { name: 'milk', amount: '1 cup', category: 'dairy' },
        ],
      }],
      settings: { ...base.settings, groceryExtrasListId: 'shop' },
    };
    mockRead.mockResolvedValue(current);
    todos = {
      lists: [{
        id: 'shop', name: 'Shopping', slug: 'shopping', repeat: 'never', createdAt: AT, updatedAt: AT,
        items: [
          { id: 'batteries', text: 'Batteries', completed: false, createdAt: AT },
          { id: 'food', text: 'Dog food', completed: true, createdAt: AT, completedAt: THIS_WEEK_TICK },
          { id: 'milk', text: 'Milk', completed: false, createdAt: AT },
        ],
      }],
    };
  }

  const item = (id: string) => todos.lists[0].items.find((it) => it.id === id)!;

  beforeEach(() => {
    setExtras();
    todoWrites = [];
    vi.mocked(readTodoData).mockImplementation(async () => todos);
    vi.mocked(updateTodoData).mockImplementation(async (mutator) => {
      const next = await mutator(todos);
      if (next !== todos) {
        todos = next;
        todoWrites.push(next);
      }
      return todos;
    });
  });

  it('ticks the to-do item for a name on that list, and leaves the meal ticks alone', async () => {
    const res = await POST(postRequest({ item: 'batteries', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: true });
    expect(item('batteries')).toMatchObject({ completed: true, completedAt: expect.any(String) });
    expect(todoWrites).toHaveLength(1);
    expect(persisted).toEqual([]);
  });

  it('puts a to-do item back, and does nothing on a repeat', async () => {
    const back = await POST(postRequest({ item: 'Dog Food', direction: 'uncheck' }));
    expect(await back.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: true });
    expect(item('food')).toMatchObject({ completed: false, completedAt: undefined });

    todoWrites = [];
    const again = await POST(postRequest({ item: 'dog food', direction: 'uncheck' }));
    expect(await again.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: false });
    expect(todoWrites).toEqual([]);
    expect(persisted).toEqual([]);
  });

  it('toggles a meal ingredient as before, without touching the to-do list', async () => {
    const res = await POST(postRequest({ item: 'Tortillas' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['tortillas'], changed: true });
    const back = await POST(postRequest({ item: 'tortillas' }));
    expect(await back.json()).toEqual({ week: THIS_WEEK, groceryChecked: [], changed: true });
    expect(updateTodoData).not.toHaveBeenCalled();
  });

  it('answers a name on neither list as it always has', async () => {
    const res = await POST(postRequest({ item: 'saffron', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['saffron'], changed: true });
    expect(updateTodoData).not.toHaveBeenCalled();
  });

  it('ticks a name on both lists on both', async () => {
    const res = await POST(postRequest({ item: 'milk', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['milk'], changed: true });
    expect(item('milk').completed).toBe(true);
  });

  it("leaves the to-do list alone for a tick on another week's list", async () => {
    const res = await POST(postRequest({ item: 'batteries', direction: 'check', week: NEXT_WEEK }));
    expect(await res.json()).toEqual({ week: NEXT_WEEK, groceryChecked: ['batteries'], changed: true });
    expect(item('batteries').completed).toBe(false);
    expect(updateTodoData).not.toHaveBeenCalled();
  });

  it('reads no to-do list when none is picked', async () => {
    setStore({});
    const res = await POST(postRequest({ item: 'batteries', direction: 'check' }));
    expect(await res.json()).toEqual({ week: THIS_WEEK, groceryChecked: ['batteries'], changed: true });
    expect(readTodoData).not.toHaveBeenCalled();
  });
});

describe('POST /api/meals/grocery while the plan lives in Mealie', () => {
  const item = (id: string, name: string, checked = false) => ({ id, text: name, name, checked, recipes: [] });

  beforeEach(() => {
    current = { ...mealData({}), settings: { ...mealData({}).settings, planSource: 'mealie' }, mealieShoppingList: 'list-g' };
    mockRead.mockResolvedValue(current);
    vi.mocked(readMealieShopping).mockResolvedValue({
      status: 'ok', lists: [], fetchedAt: 0, baseUrl: 'http://mealie.local',
      list: { id: 'list-g', name: 'Groceries', groups: [{ label: 'Spices', items: [item('s1', 'salt', true), item('s2', 'Salt'), item('p', 'pepper')] }] },
    });
    vi.mocked(setMealieShoppingItemChecked).mockResolvedValue(true);
  });

  it('ticks every item of that name still to get, on the list the family shops from', async () => {
    const res = await POST(postRequest({ item: 'SALT ', direction: 'check' }));
    expect(await res.json()).toEqual({ changed: true, matched: 2, source: 'mealie' });
    expect(readMealieShopping).toHaveBeenCalledWith('list-g', { fresh: true });
    expect(vi.mocked(setMealieShoppingItemChecked).mock.calls).toEqual([['s2', true]]);
    expect(persisted).toEqual([]);
  });

  it('changes nothing for a repeat or a name not on the list', async () => {
    expect(await (await POST(postRequest({ item: 'salt', direction: 'uncheck' }))).json()).toEqual({ changed: true, matched: 2, source: 'mealie' });
    vi.mocked(setMealieShoppingItemChecked).mockClear();
    expect(await (await POST(postRequest({ item: 'pepper', direction: 'uncheck' }))).json()).toEqual({ changed: false, matched: 1, source: 'mealie' });
    // Not on the list at all: matched 0 tells it from "already done".
    expect(await (await POST(postRequest({ item: 'saffron', direction: 'check' }))).json()).toEqual({ changed: false, matched: 0, source: 'mealie' });
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });

  it("says so when Mealie isn't answering, without ticking an old copy", async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'stale', failure: 'unreachable', lists: [], list: null, fetchedAt: 0, baseUrl: '' });
    const res = await POST(postRequest({ item: 'salt', direction: 'check' }));
    expect(res.status).toBe(502);
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });

  it('skips an item cleared in Mealie a moment ago', async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({
      status: 'ok', lists: [], fetchedAt: 0, baseUrl: 'http://mealie.local',
      list: { id: 'list-g', name: 'Groceries', groups: [{ label: 'Spices', items: [item('s1', 'salt'), item('s2', 'salt')] }] },
    });
    vi.mocked(setMealieShoppingItemChecked).mockRejectedValueOnce(new MealieShoppingGoneError());
    const res = await POST(postRequest({ item: 'salt', direction: 'check' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ changed: true, matched: 2, source: 'mealie' });
    expect(setMealieShoppingItemChecked).toHaveBeenCalledTimes(2);
  });

  it('answers a failed tick with the reason', async () => {
    vi.mocked(setMealieShoppingItemChecked).mockRejectedValue(new MealieError('key-rejected', 'Mealie did not accept the key', 401));
    const res = await POST(postRequest({ item: 'pepper', direction: 'check' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ failure: 'key-rejected' });
  });
});
