import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  setMealieShoppingItemChecked: vi.fn(),
  deleteMealieShoppingItem: vi.fn(),
}));

import { DELETE, PATCH } from '../route';
import { deleteMealieShoppingItem, MealieShoppingGoneError, setMealieShoppingItemChecked } from '@/lib/mealie-shopping';
import { MealieError } from '@/lib/mealie';

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
    vi.mocked(setMealieShoppingItemChecked).mockResolvedValue(true);
  });

  it('ticks the item and says whether anything changed', async () => {
    const res = await patch(ITEM, { checked: true });
    expect(await res.json()).toEqual({ changed: true });
    expect(setMealieShoppingItemChecked).toHaveBeenCalledWith(ITEM, true);
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

describe('DELETE /api/mealie/shopping/items/[itemId]', () => {
  const del = (itemId: string) => DELETE(new NextRequest(`http://localhost/api/mealie/shopping/items/${itemId}`, { method: 'DELETE' }), { params: Promise.resolve({ itemId }) });

  beforeEach(() => vi.clearAllMocks());

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
