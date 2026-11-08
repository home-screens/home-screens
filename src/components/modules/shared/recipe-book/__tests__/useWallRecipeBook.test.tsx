// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('@/lib/display-fetch', () => ({ displayFetch: vi.fn() }));
const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

import { displayFetch } from '@/lib/display-fetch';
import { holdRotationFor, releaseRotationHold } from '@/lib/interaction-hold';
import { markRecipeGone, resetGoneRecipes } from '@/components/meals/goneRecipes';
import { RECIPE_BOOK_CHECK_MS, useWallRecipeBook } from '../useWallRecipeBook';

/**
 * The wall's recipe book is read once when its screen comes up, and a kitchen
 * wall stays on that screen all day: recipes added in Mealie never showed and
 * the counts stayed where they were.
 */

type Recipe = { id: string; name: string };
let book: Recipe[];
let revision: string;
const r = (name: string): Recipe => ({ id: `mealie:${name}`, name });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const asked = (path: string) => vi.mocked(displayFetch).mock.calls.filter(([url]) => String(url).split('?')[0] === path).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  book = [r('Apple crumble'), r('Banana bread')];
  revision = 'r1';
  vi.mocked(displayFetch).mockImplementation(async (url) => {
    const u = String(url);
    if (u.startsWith('/api/mealie/recipes/revision')) return json({ revision });
    if (u.startsWith('/api/mealie/recipes')) return json({ items: book, page: 1, totalPages: 1, total: book.length });
    if (u.startsWith('/api/mealie/categories')) return json({ categories: [] });
    if (u.startsWith('/api/mealie/cookbooks')) return json({ cookbooks: [] });
    throw new Error(`unexpected ${u}`);
  });
});

afterEach(() => {
  cleanup();
  releaseRotationHold();
  resetGoneRecipes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Let the answers in flight land. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};

function mount() {
  const hook = renderHook(() => useWallRecipeBook({ source: 'mealie', savedMeals: [], enabled: true }));
  return hook;
}

async function onAll(result: ReturnType<typeof mount>['result']) {
  await settle();
  const all = result.current.chips.find((c) => c.kind === 'mealie' && c.filter === 'all')!;
  act(() => result.current.choose(all));
  await settle();
}

describe('useWallRecipeBook', () => {
  it('reads Mealie again once its recipes changed, the count with them', async () => {
    const { result } = mount();
    await onAll(result);
    expect(result.current.items.map((m) => m.name)).toEqual(['Apple crumble', 'Banana bread']);
    expect(result.current.recipeCount).toBe(2);

    // Nothing changed: the minute check asks only whether anything did.
    const lists = asked('/api/mealie/recipes');
    await act(async () => { await vi.advanceTimersByTimeAsync(RECIPE_BOOK_CHECK_MS); });
    await settle();
    expect(asked('/api/mealie/recipes')).toBe(lists);

    book = [r('Aaa new'), ...book];
    revision = 'r2';
    await act(async () => { await vi.advanceTimersByTimeAsync(RECIPE_BOOK_CHECK_MS); });
    await settle();
    expect(result.current.items.map((m) => m.name)).toEqual(['Aaa new', 'Apple crumble', 'Banana bread']);
    expect(result.current.total).toBe(3);
    expect(result.current.recipeCount).toBe(3);
    expect(result.current.loading).toBe(false);
  });

  it('waits until nobody is using the wall, so the tiles never move under a finger', async () => {
    const { result } = mount();
    await onAll(result);
    holdRotationFor(60_000);
    book = [r('Aaa new'), ...book];
    revision = 'r2';
    await act(async () => { await vi.advanceTimersByTimeAsync(RECIPE_BOOK_CHECK_MS - 1_000); });
    await settle();
    expect(result.current.items).toHaveLength(2);
    // The hold runs out a few seconds later.
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await settle();
    expect(result.current.items).toHaveLength(3);
  });

  it('reads Mealie again when the lit chip is tapped, chips and count included', async () => {
    const { result } = mount();
    await onAll(result);
    const categories = asked('/api/mealie/categories');
    book = [r('Aaa new'), ...book];
    act(() => result.current.choose(result.current.active));
    await settle();
    expect(result.current.items).toHaveLength(3);
    expect(result.current.recipeCount).toBe(3);
    expect(asked('/api/mealie/categories')).toBe(categories + 1);
  });

  it('leaves out a recipe a card found gone at once', async () => {
    const { result } = mount();
    await onAll(result);
    act(() => markRecipeGone('mealie:Apple crumble'));
    expect(result.current.items.map((m) => m.name)).toEqual(['Banana bread']);
  });
});
