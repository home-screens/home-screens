import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  hasEditorSession: vi.fn().mockResolvedValue(true),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn() }));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  setMealieShoppingItemChecked: vi.fn(),
  deleteMealieShoppingItem: vi.fn(),
  readMealieShopping: vi.fn(),
}));

import { DELETE, PATCH } from '../route';
import { deleteMealieShoppingItem, MealieShoppingGoneError, readMealieShopping, setMealieShoppingItemChecked } from '@/lib/mealie-shopping';
import { readMealData } from '@/lib/meal-data';
import type { MealData } from '@/lib/meal-data';
import { MealieError } from '@/lib/mealie';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { noteWallAdded, resetWallAdded, wallMayUndo } from '@/lib/wall-added';

const ITEM = 'a168eaec-3774-43de-9e11-683da1c3f46a';
const patch = (itemId: string, body: unknown) => PATCH(
  new NextRequest(`http://localhost/api/mealie/shopping/items/${itemId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ itemId }) },
);

describe('PATCH /api/mealie/shopping/items/[itemId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasEditorSession).mockResolvedValue(true);
    vi.mocked(setMealieShoppingItemChecked).mockResolvedValue(true);
  });

  it('ticks the item and says whether anything changed', async () => {
    const res = await patch(ITEM, { checked: true });
    expect(await res.json()).toEqual({ changed: true });
    // The phone ticks on any of the household's lists.
    expect(setMealieShoppingItemChecked).toHaveBeenCalledWith(ITEM, true, {});
    expect(readMealieShopping).not.toHaveBeenCalled();
  });

  it('refuses a body that is not an object', async () => {
    for (const body of [null, [], 'checked', 7]) expect((await patch(ITEM, body)).status).toBe(400);
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });

  it('only ticks: anything but true or false is refused', async () => {
    expect((await patch(ITEM, { checked: 'yes' })).status).toBe(400);
    expect((await patch(ITEM, { note: 'Bread' })).status).toBe(400);
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });

  it('never puts something that is not an id into a path to Mealie', async () => {
    expect((await patch('..%2F..%2Fusers', { checked: true })).status).toBe(400);
  });

  it('says an item cleared in Mealie is gone', async () => {
    vi.mocked(setMealieShoppingItemChecked).mockRejectedValue(new MealieShoppingGoneError());
    const res = await patch(ITEM, { checked: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'gone' });
  });

  it('says why Mealie did not take it', async () => {
    vi.mocked(setMealieShoppingItemChecked).mockRejectedValue(new MealieError('key-rejected', 'Mealie did not accept the key', 401));
    const res = await patch(ITEM, { checked: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ failure: 'key-rejected' });
  });
});

describe('PATCH /api/mealie/shopping/items/[itemId] from a wall', () => {
  const FAMILY = '930a09f2-00f6-44b3-89ec-449586cffcc0';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasEditorSession).mockResolvedValue(false);
    vi.mocked(setMealieShoppingItemChecked).mockResolvedValue(true);
    vi.mocked(readMealData).mockResolvedValue({ settings: { planSource: 'mealie' }, mealieShoppingList: FAMILY } as unknown as MealData);
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: { id: FAMILY, name: 'Groceries', groups: [] }, fetchedAt: 1, baseUrl: 'http://mealie.local' });
  });

  it('ticks only on the list the family shops from', async () => {
    const res = await patch(ITEM, { checked: true });
    expect(await res.json()).toEqual({ changed: true });
    expect(readMealieShopping).toHaveBeenCalledWith(FAMILY);
    expect(setMealieShoppingItemChecked).toHaveBeenCalledWith(ITEM, true, { onList: FAMILY });
  });

  it('says an item on another list is not there', async () => {
    vi.mocked(setMealieShoppingItemChecked).mockRejectedValue(new MealieShoppingGoneError());
    const res = await patch(ITEM, { checked: true });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'gone' });
  });

  it('ticks nothing while the household has no list', async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: null, fetchedAt: 1, baseUrl: 'http://mealie.local' });
    expect((await patch(ITEM, { checked: true })).status).toBe(404);
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });

  it('ticks nothing while Mealie cannot say which list that is', async () => {
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'failed', failure: 'unreachable' });
    const res = await patch(ITEM, { checked: true });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ failure: 'unreachable' });
    expect(setMealieShoppingItemChecked).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/mealie/shopping/items/[itemId]', () => {
  const del = (itemId: string) => DELETE(new NextRequest(`http://localhost/api/mealie/shopping/items/${itemId}`, { method: 'DELETE' }), { params: Promise.resolve({ itemId }) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasEditorSession).mockResolvedValue(true);
  });

  it('takes the item off its list, for Undo', async () => {
    vi.mocked(deleteMealieShoppingItem).mockResolvedValue();
    const res = await del(ITEM);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteMealieShoppingItem).toHaveBeenCalledWith(ITEM);
  });

  it('never puts something that is not an id into a path to Mealie', async () => {
    expect((await del('..%2F..%2Fusers')).status).toBe(400);
    expect(deleteMealieShoppingItem).not.toHaveBeenCalled();
  });

  it('says why Mealie did not take it', async () => {
    vi.mocked(deleteMealieShoppingItem).mockRejectedValue(new MealieError('unreachable', 'Mealie did not answer'));
    const res = await del(ITEM);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ failure: 'unreachable' });
  });
});

describe('DELETE /api/mealie/shopping/items/[itemId] from a wall', () => {
  const del = (itemId: string) => DELETE(new NextRequest(`http://localhost/api/mealie/shopping/items/${itemId}`, { method: 'DELETE' }), { params: Promise.resolve({ itemId }) });

  beforeEach(() => {
    vi.clearAllMocks();
    resetWallAdded();
    vi.mocked(hasEditorSession).mockResolvedValue(false);
    vi.mocked(requireSession).mockRejectedValue(new Response('{}', { status: 401 }));
    vi.mocked(deleteMealieShoppingItem).mockResolvedValue(undefined);
  });

  it('takes off an item the hub just added for a wall, once', async () => {
    noteWallAdded(ITEM);
    expect((await del(ITEM)).status).toBe(200);
    expect(deleteMealieShoppingItem).toHaveBeenCalledWith(ITEM);
    expect(wallMayUndo(ITEM)).toBe(false);
  });

  it('leaves anything else to the phone', async () => {
    expect((await del(ITEM)).status).toBe(401);
    expect(deleteMealieShoppingItem).not.toHaveBeenCalled();
  });
});
