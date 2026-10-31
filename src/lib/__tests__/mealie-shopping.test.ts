import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../mealie', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mealie')>();
  return { ...real, requireMealieConfig: vi.fn(), mealieJson: vi.fn(), mealieFetch: vi.fn(), getMealieRecipe: vi.fn() };
});

import { MealieError, getMealieRecipe, mealieFetch, mealieJson, requireMealieConfig } from '../mealie';
import {
  addMealieShoppingItem,
  clearMealieShoppingCache,
  deleteMealieShoppingItem,
  MealieShoppingGoneError,
  readMealieShopping,
  setMealieShoppingItemChecked,
} from '../mealie-shopping';

const json = vi.mocked(mealieJson);
const LISTS = '/api/households/shopping/lists?perPage=-1&orderBy=name&orderDirection=asc';

/** A typed item as Mealie 3.29 answers it, with the fields a whole-item update must carry back. */
const TOWELS = {
  id: 'item-1', shoppingListId: 'list-g', checked: false, position: 3, quantity: 1, note: 'Paper towels', display: '1 Paper towels',
  labelId: 'l-house', label: { id: 'l-house', name: 'Household' }, recipeReferences: [{ recipeId: 'r1' }], groupId: 'g', householdId: 'h',
};

type FakeItem = { id: string; checked?: boolean; position?: number; recipeReferences?: { recipeId: string }[] };

function household(lists: Record<string, { name: string; createdAt?: string; recipes?: Record<string, string>; items: FakeItem[] }>) {
  json.mockImplementation(async (path: string) => {
    if (path === LISTS) return { items: Object.entries(lists).map(([id, l]) => ({ id, name: l.name })) } as never;
    const one = /\/lists\/([^/?]+)$/.exec(path);
    if (one && lists[one[1]]) {
      const l = lists[one[1]];
      return {
        id: one[1], name: l.name, createdAt: l.createdAt,
        listItems: l.items.map((i) => ({ shoppingListId: one[1], note: i.id, checked: false, ...i })),
        recipeReferences: Object.entries(l.recipes ?? {}).map(([recipeId, name]) => ({ recipeId, recipe: { name } })),
      } as never;
    }
    throw new MealieError('upstream', 'Mealie answered 404', 404);
  });
}

describe('mealie-shopping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMealieShoppingCache();
    vi.mocked(requireMealieConfig).mockResolvedValue({ url: 'http://mealie.local', apiKey: 'k' });
    vi.mocked(getMealieRecipe).mockRejectedValue(new MealieError('upstream', 'Mealie answered 404', 404));
  });

  /** How many times the household's lists were read from Mealie. */
  const listReads = () => json.mock.calls.filter(([path]) => path === LISTS).length;

  describe('setMealieShoppingItemChecked', () => {
    it('sends the whole item back: an update carrying only the tick blanks the name', async () => {
      json.mockResolvedValueOnce(TOWELS as never).mockResolvedValueOnce({ updatedItems: [] } as never);
      expect(await setMealieShoppingItemChecked('item-1', true)).toBe(true);
      expect(json).toHaveBeenLastCalledWith(
        '/api/households/shopping/items/item-1',
        { method: 'PUT', json: { ...TOWELS, checked: true } },
        expect.anything(),
      );
    });

    it('leaves an item that is already that way alone', async () => {
      json.mockResolvedValueOnce({ ...TOWELS, checked: true } as never);
      expect(await setMealieShoppingItemChecked('item-1', true)).toBe(false);
      expect(json).toHaveBeenCalledTimes(1);
    });

    it('says an item somebody cleared in Mealie is gone', async () => {
      json.mockRejectedValueOnce(new MealieError('upstream', 'Mealie answered 404', 404));
      await expect(setMealieShoppingItemChecked('item-1', true)).rejects.toBeInstanceOf(MealieShoppingGoneError);
    });

    it('reads fresh after a tick that changed nothing: somebody ticked it in Mealie first', async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'item-1' }] } });
      await readMealieShopping(undefined);
      const answer = json.getMockImplementation()!;
      json.mockImplementation(async (path, init, cfg) => (path.includes('/items/') ? { ...TOWELS, checked: true } as never : answer(path, init, cfg)));
      expect(await setMealieShoppingItemChecked('item-1', true)).toBe(false);
      await readMealieShopping(undefined);
      expect(listReads()).toBe(2);
    });

    it('reads fresh after an item turns out to be gone', async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'item-1' }] } });
      await readMealieShopping(undefined);
      const answer = json.getMockImplementation()!;
      json.mockImplementation(async (path, init, cfg) => {
        if (path.includes('/items/')) throw new MealieError('upstream', 'Mealie answered 404', 404);
        return answer(path, init, cfg);
      });
      await expect(setMealieShoppingItemChecked('item-1', true)).rejects.toBeInstanceOf(MealieShoppingGoneError);
      await readMealieShopping(undefined);
      expect(listReads()).toBe(2);
    });

    it('passes Mealie being down on as it is', async () => {
      json.mockRejectedValueOnce(new MealieError('unreachable', 'Mealie did not answer'));
      await expect(setMealieShoppingItemChecked('item-1', true)).rejects.toMatchObject({ failure: 'unreachable' });
    });
  });

  describe('readMealieShopping', () => {
    it('reads every list for its count and shows the one asked for', async () => {
      household({
        'list-c': { name: 'Costco run', items: [{ id: 'a' }, { id: 'b', checked: true }] },
        'list-g': { name: 'Groceries', items: [{ id: 'c' }] },
      });
      const result = await readMealieShopping('list-g');
      expect(result).toMatchObject({
        status: 'ok',
        lists: [{ id: 'list-c', name: 'Costco run', left: 1 }, { id: 'list-g', name: 'Groceries', left: 1 }],
        list: { id: 'list-g', name: 'Groceries' },
        baseUrl: 'http://mealie.local',
      });
    });

    it('falls back to the list made first when the chosen one is gone or unset, lists still A to Z', async () => {
      household({
        'list-z': { name: 'Zoo trip', createdAt: '2026-10-31T09:00:00Z', items: [] },
        'list-g': { name: 'Groceries', createdAt: '2026-01-02T08:00:00Z', items: [] },
        'list-a': { name: 'Aldi', createdAt: '2026-06-01T08:00:00Z', items: [] },
      });
      expect(await readMealieShopping('deleted')).toMatchObject({ list: { name: 'Groceries' } });
      const result = await readMealieShopping(undefined);
      expect(result).toMatchObject({ list: { name: 'Groceries' } });
      expect(result.status !== 'failed' && result.lists.map((l) => l.name)).toEqual(['Aldi', 'Groceries', 'Zoo trip']);
    });

    it('answers no list for a household with none', async () => {
      household({});
      expect(await readMealieShopping(undefined)).toMatchObject({ status: 'ok', lists: [], list: null });
    });

    it('asks Mealie once for reads close together', async () => {
      household({ 'list-g': { name: 'Groceries', items: [] } });
      await Promise.all([readMealieShopping(undefined), readMealieShopping(undefined)]);
      await readMealieShopping(undefined);
      expect(json).toHaveBeenCalledTimes(2);
    });

    it('keeps the last good copy while Mealie is down, and says so', async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'c' }] } });
      await readMealieShopping(undefined);
      json.mockRejectedValue(new MealieError('unreachable', 'Mealie did not answer'));
      const result = await readMealieShopping(undefined, { fresh: true });
      expect(result).toMatchObject({ status: 'stale', failure: 'unreachable', list: { name: 'Groceries' } });
    });

    it('fails with the reason when there is no copy at all, and the address for Open Mealie', async () => {
      json.mockRejectedValue(new MealieError('key-rejected', 'Mealie did not accept the key', 401));
      expect(await readMealieShopping(undefined)).toEqual({ status: 'failed', failure: 'key-rejected', baseUrl: 'http://mealie.local' });
    });

    it("names a recipe Mealie dropped from the list, from what it saw before or from the recipe itself", async () => {
      household({ 'list-g': { name: 'Groceries', recipes: { r1: 'Yorkshire Puddings' }, items: [
        { id: 'flour', recipeReferences: [{ recipeId: 'r1' }] },
        { id: 'beef', recipeReferences: [{ recipeId: 'r2' }] },
      ] } });
      vi.mocked(getMealieRecipe).mockImplementation(async (id) => ({ id, slug: id, name: id === 'r2' ? 'Cumberland Pie' : null }) as never);
      const first = await readMealieShopping(undefined);
      const recipes = (r: typeof first) => (r.status === 'failed' ? [] : r.list!.groups.flatMap((g) => g.items.map((i) => i.recipes)));
      expect(recipes(first)).toEqual([['Yorkshire Puddings'], ['Cumberland Pie']]);
      expect(getMealieRecipe).toHaveBeenCalledTimes(1);
      // Every Yorkshire Puddings item ticked: Mealie drops it from the list.
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'flour', checked: true, recipeReferences: [{ recipeId: 'r1' }] }] } });
      expect(recipes(await readMealieShopping(undefined, { fresh: true }))).toEqual([['Yorkshire Puddings']]);
    });

    it('never refills the cache with a read that started before a write', async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'c' }] } });
      let release!: () => void;
      let reading!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const inFlight = new Promise<void>((resolve) => { reading = resolve; });
      const answer = json.getMockImplementation()!;
      json.mockImplementationOnce(async (path, init, cfg) => { reading(); await gate; return answer(path, init, cfg); });
      const early = readMealieShopping(undefined);
      await inFlight;
      clearMealieShoppingCache();
      release();
      await early;
      const calls = json.mock.calls.length;
      await readMealieShopping(undefined);
      expect(json.mock.calls.length).toBeGreaterThan(calls);
    });
  });

  describe('addMealieShoppingItem', () => {
    it("adds the words the way Mealie's own box does, at the end of the list", async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'c', position: 4 }, { id: 'd', position: 7 }] } });
      const lists = json.getMockImplementation()!;
      json.mockImplementation(async (path, init, cfg) => (init?.method === 'POST' ? { createdItems: [{ id: 'new' }] } as never : lists(path, init, cfg)));
      await addMealieShoppingItem('list-g', 'Milk');
      expect(json).toHaveBeenCalledWith(
        '/api/households/shopping/items',
        { method: 'POST', json: { shoppingListId: 'list-g', note: 'Milk', quantity: 0, checked: false, position: 8 } },
        expect.anything(),
      );
    });

    it("answers the new item's id, or none when Mealie merged the words into an item already there", async () => {
      household({ 'list-g': { name: 'Groceries', items: [] } });
      const lists = json.getMockImplementation()!;
      json.mockImplementation(async (path, init, cfg) => (init?.method === 'POST' ? { createdItems: [{ id: 'new-1' }] } as never : lists(path, init, cfg)));
      expect(await addMealieShoppingItem('list-g', 'Milk')).toBe('new-1');
      json.mockImplementation(async (path, init, cfg) => (init?.method === 'POST' ? { createdItems: [], updatedItems: [{ id: 'old' }] } as never : lists(path, init, cfg)));
      expect(await addMealieShoppingItem('list-g', 'Milk')).toBeNull();
    });

    it('says the list is gone when it went in the seconds since the hub last looked', async () => {
      household({ 'list-g': { name: 'Groceries', items: [] } });
      await readMealieShopping(undefined);
      // Deleted in Mealie: the add fails with Mealie's bare 500, and the lists no longer have it.
      json.mockImplementation(async (path, init) => {
        if (init?.method === 'POST') throw new MealieError('upstream', 'Mealie answered 500', 500);
        if (path === LISTS) return { items: [] } as never;
        throw new MealieError('upstream', 'Mealie answered 404', 404);
      });
      await expect(addMealieShoppingItem('list-g', 'Milk')).rejects.toBeInstanceOf(MealieShoppingGoneError);
    });

    it('passes on a failed add when the list is still there', async () => {
      household({ 'list-g': { name: 'Groceries', items: [] } });
      const lists = json.getMockImplementation()!;
      json.mockImplementation(async (path, init, cfg) => {
        if (init?.method === 'POST') throw new MealieError('upstream', 'Mealie answered 500', 500);
        return lists(path, init, cfg);
      });
      await expect(addMealieShoppingItem('list-g', 'Milk')).rejects.toMatchObject({ failure: 'upstream' });
    });

    it('refuses a list Mealie no longer has without asking Mealie to add to it', async () => {
      household({ 'list-g': { name: 'Groceries', items: [] } });
      await expect(addMealieShoppingItem('list-gone', 'Milk')).rejects.toBeInstanceOf(MealieShoppingGoneError);
      expect(json.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    });
  });

  describe('deleteMealieShoppingItem', () => {
    it('takes the item off and reads fresh next time; already gone is fine', async () => {
      household({ 'list-g': { name: 'Groceries', items: [{ id: 'item-1' }] } });
      await readMealieShopping(undefined);
      vi.mocked(mealieFetch).mockResolvedValueOnce(new Response(null, { status: 200 }));
      await deleteMealieShoppingItem('item-1');
      expect(mealieFetch).toHaveBeenCalledWith('/api/households/shopping/items/item-1', { method: 'DELETE' });
      await readMealieShopping(undefined);
      expect(listReads()).toBe(2);
      vi.mocked(mealieFetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
      await expect(deleteMealieShoppingItem('item-1')).resolves.toBeUndefined();
      vi.mocked(mealieFetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
      await expect(deleteMealieShoppingItem('item-1')).rejects.toMatchObject({ failure: 'upstream' });
    });
  });
});
