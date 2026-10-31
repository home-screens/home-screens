import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { MealData } from '@/lib/meal-data';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn(), updateMealData: vi.fn() }));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  readMealieShopping: vi.fn(),
  mealieShoppingListExists: vi.fn(),
}));

import { GET, PUT } from '../route';
import { readMealData, updateMealData } from '@/lib/meal-data';
import { mealieShoppingListExists, readMealieShopping } from '@/lib/mealie-shopping';
import { MealieError } from '@/lib/mealie';

const LIST_G = '930a09f2-00f6-44b3-89ec-449586cffcc0';
const LIST_C = 'a32f9905-cb4b-48ed-9521-3098a7f9346b';
const ANSWER = {
  status: 'ok' as const,
  lists: [{ id: LIST_C, name: 'Costco run', left: 15 }, { id: LIST_G, name: 'Groceries', left: 45 }],
  list: { id: LIST_G, name: 'Groceries', groups: [] },
  fetchedAt: 1,
  baseUrl: 'http://mealie.local',
};

let stored: MealData;
const get = (q = '') => new NextRequest(`http://localhost/api/mealie/shopping${q}`);
const put = (body: unknown) => new NextRequest('http://localhost/api/mealie/shopping', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('/api/mealie/shopping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored = { savedMeals: [], plan: [], groceryChecked: {}, settings: { enabledSlots: ['dinner'], weekStartDay: 'sunday', defaultSlotTimes: {}, planSource: 'mealie' }, mealieShoppingList: LIST_G };
    vi.mocked(readMealData).mockImplementation(async () => stored);
    vi.mocked(updateMealData).mockImplementation(async (mutator) => (stored = await mutator(stored)));
    vi.mocked(readMealieShopping).mockResolvedValue(ANSWER);
    vi.mocked(mealieShoppingListExists).mockResolvedValue(true);
  });

  it('answers the list the family shops from', async () => {
    const res = await GET(get());
    expect(await res.json()).toEqual(ANSWER);
    expect(readMealieShopping).toHaveBeenCalledWith(LIST_G);
  });

  it('answers another list when asked, without changing the choice', async () => {
    await GET(get(`?list=${LIST_C}`));
    expect(readMealieShopping).toHaveBeenCalledWith(LIST_C);
    expect(updateMealData).not.toHaveBeenCalled();
  });

  it('never puts something that is not an id into a path to Mealie', async () => {
    expect((await GET(get('?list=../../users/self'))).status).toBe(400);
    expect(readMealieShopping).not.toHaveBeenCalled();
  });

  it("says why when Mealie has never answered", async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'failed', failure: 'key-rejected', baseUrl: 'http://mealie.local' });
    const res = await GET(get());
    expect(res.status).toBe(400);
    // The saved address comes along, so the tab can still offer Open Mealie.
    expect(await res.json()).toMatchObject({ failure: 'key-rejected', baseUrl: 'http://mealie.local' });
  });

  it('keeps the chosen list beside the meals, outside the settings', async () => {
    const res = await PUT(put({ list: LIST_C }));
    expect(res.status).toBe(200);
    expect(stored.mealieShoppingList).toBe(LIST_C);
    expect(stored.settings).not.toHaveProperty('mealieShoppingList');
    expect(readMealieShopping).toHaveBeenCalledWith(LIST_C);
  });

  it("refuses a list Mealie doesn't have, and keeps the old choice", async () => {
    vi.mocked(mealieShoppingListExists).mockResolvedValue(false);
    const res = await PUT(put({ list: LIST_C }));
    expect(res.status).toBe(404);
    expect(stored.mealieShoppingList).toBe(LIST_G);
  });

  it('refuses a body with no list id', async () => {
    expect((await PUT(put({ list: 7 }))).status).toBe(400);
    expect((await PUT(put({}))).status).toBe(400);
  });

  it("says Mealie isn't answering instead of saving a list nobody could check", async () => {
    vi.mocked(mealieShoppingListExists).mockRejectedValue(new MealieError('unreachable', 'Mealie did not answer'));
    const res = await PUT(put({ list: LIST_C }));
    expect(res.status).toBe(502);
    expect(stored.mealieShoppingList).toBe(LIST_G);
  });
});
