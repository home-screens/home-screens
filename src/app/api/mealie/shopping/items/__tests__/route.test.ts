import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  readMealieShopping: vi.fn(),
  addMealieShoppingItem: vi.fn(),
}));

import { POST } from '../route';
import { addMealieShoppingItem, MealieShoppingGoneError, readMealieShopping } from '@/lib/mealie-shopping';
import { MealieError } from '@/lib/mealie';

const LIST = '930a09f2-00f6-44b3-89ec-449586cffcc0';
const post = (body: unknown) => new NextRequest('http://localhost/api/mealie/shopping/items', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/mealie/shopping/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(addMealieShoppingItem).mockResolvedValue('new-1');
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: { id: LIST, name: 'Groceries', groups: [] }, fetchedAt: 1, baseUrl: 'http://mealie.local' });
  });

  it('adds the words, tidied, and answers with the list read fresh', async () => {
    const res = await POST(post({ list: LIST, text: '  oat   milk ' }));
    expect(res.status).toBe(200);
    expect(addMealieShoppingItem).toHaveBeenCalledWith(LIST, 'oat milk');
    expect(readMealieShopping).toHaveBeenCalledWith(LIST, { fresh: true });
    // The new item's id comes back, for Undo.
    expect(await res.json()).toMatchObject({ list: { id: LIST }, added: 'new-1' });
  });

  it('refuses nothing typed, too much typed, or no list', async () => {
    expect((await POST(post({ list: LIST, text: '   ' }))).status).toBe(400);
    expect((await POST(post({ list: LIST, text: 'x'.repeat(201) }))).status).toBe(400);
    expect((await POST(post({ text: 'Milk' }))).status).toBe(400);
    expect(addMealieShoppingItem).not.toHaveBeenCalled();
  });

  it('says the list is gone when Mealie no longer has it', async () => {
    vi.mocked(addMealieShoppingItem).mockRejectedValue(new MealieShoppingGoneError());
    const res = await POST(post({ list: LIST, text: 'Milk' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: 'gone' });
  });

  it('says why Mealie did not take it', async () => {
    vi.mocked(addMealieShoppingItem).mockRejectedValue(new MealieError('unreachable', 'Mealie did not answer'));
    const res = await POST(post({ list: LIST, text: 'Milk' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ failure: 'unreachable' });
  });
});
