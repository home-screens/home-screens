import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  hasEditorSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn() }));
vi.mock('@/lib/meal-data', () => ({ readMealData: vi.fn() }));
vi.mock('@/lib/mealie-shopping', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mealie-shopping')>()),
  readMealieShopping: vi.fn(),
  addMealieShoppingItem: vi.fn(),
}));

import { POST } from '../route';
import { addMealieShoppingItem, MealieShoppingGoneError, readMealieShopping } from '@/lib/mealie-shopping';
import { MealieError } from '@/lib/mealie';
import { hasEditorSession, requireSession } from '@/lib/auth';
import { readConfig } from '@/lib/config';
import { readMealData } from '@/lib/meal-data';
import { resetWallAdded, wallMayUndo } from '@/lib/wall-added';
import type { ScreenConfiguration } from '@/types/config';
import type { MealData } from '@/lib/meal-data';

const LIST = '930a09f2-00f6-44b3-89ec-449586cffcc0';
const post = (body: unknown) => new NextRequest('http://localhost/api/mealie/shopping/items', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/mealie/shopping/items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWallAdded();
    vi.mocked(hasEditorSession).mockResolvedValue(true);
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

describe('POST /api/mealie/shopping/items from a wall', () => {
  const groceryCard = (config: Record<string, unknown>) => ({
    version: 21, settings: {}, screens: [{ id: 's', name: 'S', modules: [{ id: 'g', type: 'meal-planner', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, style: {}, config }] }],
  }) as unknown as ScreenConfiguration;
  const meals = (planSource?: 'mealie') => ({ settings: { planSource }, mealieShoppingList: LIST }) as unknown as MealData;

  beforeEach(() => {
    vi.clearAllMocks();
    resetWallAdded();
    vi.mocked(hasEditorSession).mockResolvedValue(false);
    vi.mocked(requireSession).mockRejectedValue(new Response('{}', { status: 401 }));
    vi.mocked(addMealieShoppingItem).mockResolvedValue('new-1');
    vi.mocked(readMealieShopping).mockResolvedValue({ status: 'ok', lists: [], list: { id: LIST, name: 'Groceries', groups: [] }, fetchedAt: 1, baseUrl: 'http://mealie.local' });
    vi.mocked(readConfig).mockResolvedValue(groceryCard({ view: 'grocery', wallAdd: true }));
    vi.mocked(readMealData).mockResolvedValue(meals('mealie'));
  });

  it('adds to the list the family shops from, and remembers it for Undo', async () => {
    const res = await POST(post({ list: LIST, text: 'Milk' }));
    expect(res.status).toBe(200);
    expect(addMealieShoppingItem).toHaveBeenCalledWith(LIST, 'Milk');
    expect(wallMayUndo('new-1')).toBe(true);
  });

  it('refuses another of the household lists', async () => {
    const res = await POST(post({ list: 'b0b0b0b0-0000-4000-8000-000000000000', text: 'Milk' }));
    expect(res.status).toBe(403);
    expect(addMealieShoppingItem).not.toHaveBeenCalled();
  });

  it('refuses while no grocery card offers an Add row, or the plan is not in Mealie', async () => {
    vi.mocked(readConfig).mockResolvedValue(groceryCard({ view: 'grocery' }));
    expect((await POST(post({ list: LIST, text: 'Milk' }))).status).toBe(403);
    vi.mocked(readConfig).mockResolvedValue(groceryCard({ view: 'grocery', wallAdd: true }));
    vi.mocked(readMealData).mockResolvedValue(meals());
    expect((await POST(post({ list: LIST, text: 'Milk' }))).status).toBe(403);
    expect(addMealieShoppingItem).not.toHaveBeenCalled();
  });

  it('takes no more than a wall item may say, and nothing but words', async () => {
    expect((await POST(post({ list: LIST, text: 'x'.repeat(81) }))).status).toBe(400);
    expect((await POST(post({ list: LIST, text: 'Milk', note: 'two' }))).status).toBe(401);
    expect(addMealieShoppingItem).not.toHaveBeenCalled();
  });

  it('has nothing to undo when Mealie folded the words into a line already there', async () => {
    vi.mocked(addMealieShoppingItem).mockResolvedValue(null);
    const res = await POST(post({ list: LIST, text: 'Milk' }));
    expect(await res.json()).toMatchObject({ added: null });
  });
});
