// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { MealFetch } from '@/lib/meal-client';
import { useMealieRecipeSearch } from '../useMealieRecipeSearch';
import { HubUnreachableError } from '@/lib/hub-request';

afterEach(cleanup);

const search = (fetcher: MealFetch) =>
  renderHook(() => useMealieRecipeSearch(fetcher, { search: '', filter: 'favorites', enabled: true }));

describe('useMealieRecipeSearch', () => {
  /* A phone that lost the hub mid-search was told Mealie is down. */
  it('says a lost hub is a connection problem, not Mealie being down', async () => {
    const { result } = search(vi.fn().mockRejectedValue(new HubUnreachableError()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.problem).toBe('connection');
  });

  it('keeps Mealie\'s own reason when Mealie refused', async () => {
    const refused = { ok: false, status: 400, json: async () => ({ error: 'No.', failure: 'key-rejected' }) };
    const { result } = search(vi.fn().mockResolvedValue(refused));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.problem).toBe('token');
  });

  /* Cookbooks, categories and the count failed with the recipes when Mealie was down, and never came back. */
  it('says when Mealie answers again after failing, and only then', async () => {
    let down = true;
    const fetch = vi.fn(() => down
      ? Promise.reject(new HubUnreachableError())
      : Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: 'mealie:a', name: 'A' }], page: 1, totalPages: 1, total: 1 }) }));
    const { result } = search(fetch as unknown as MealFetch);
    await waitFor(() => expect(result.current.problem).toBe('connection'));
    expect(result.current.recovered).toBe(0);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.problem).toBe('connection'));
    expect(result.current.recovered).toBe(0);

    down = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.recovered).toBe(1);
    // Answering as usual is not a recovery.
    act(() => result.current.retry());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recovered).toBe(1);
  });

  /* The wall's list fires a scroll event every frame near its end, and each one asked for the next page again. */
  describe('loadMore', () => {
    const pageNumber = (url: string) => Number(new URL(url, 'http://hub').searchParams.get('page') ?? '1');
    const paged = (fail = new Set<number>()) => vi.fn((url: string) => {
      const n = pageNumber(url);
      if (fail.has(n)) return Promise.reject(new Error('Mealie did not answer'));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [{ id: `mealie:r${n}`, name: `Recipe ${n}` }], page: n, totalPages: 3, total: 3 }) });
    });
    const asked = (fetch: ReturnType<typeof paged>) => fetch.mock.calls.map(([url]) => pageNumber(url as string));

    it('asks for each page once, however many times the list scrolls near its end', async () => {
      const fetch = paged();
      const { result } = search(fetch as unknown as MealFetch);
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => { for (let i = 0; i < 10; i++) result.current.loadMore(); });
      await waitFor(() => expect(result.current.items).toHaveLength(2));
      // The same scroll run again before page 2 re-renders, and after it.
      act(() => { for (let i = 0; i < 10; i++) result.current.loadMore(); });
      await waitFor(() => expect(result.current.items).toHaveLength(3));
      expect(asked(fetch)).toEqual([1, 2, 3]);
      expect(result.current.hasMore).toBe(false);
    });

    it('asks for a page again after it failed', async () => {
      const fail = new Set([2]);
      const fetch = paged(fail);
      const { result } = search(fetch as unknown as MealFetch);
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => { result.current.loadMore(); result.current.loadMore(); });
      await waitFor(() => expect(asked(fetch)).toEqual([1, 2]));
      fail.clear();
      await act(async () => { await Promise.resolve(); });
      act(() => { result.current.loadMore(); result.current.loadMore(); });
      await waitFor(() => expect(result.current.items).toHaveLength(2));
      expect(asked(fetch)).toEqual([1, 2, 2]);
    });
  });

  /* A child at the wall spells "choclate"; Mealie's search does not forgive spelling. */
  describe('widen', () => {
    const page = (names: string[]) => ({
      ok: true,
      status: 200,
      json: async () => ({ items: names.map((name) => ({ id: `mealie:${name}`, name })), page: 1, totalPages: names.length ? 1 : 0, total: names.length }),
    });
    const fetcher = () => vi.fn((url: string) => Promise.resolve(page(url.includes('search=choc&') || url.endsWith('search=choc') ? ['Chocolate cake'] : [])));
    const run = (fetch: MealFetch, widen: boolean) =>
      renderHook(() => useMealieRecipeSearch(fetch, { search: 'choclate', filter: 'favorites', enabled: true, widen }));

    it('tries the start of the word when the words found nothing', async () => {
      const fetch = fetcher();
      const { result } = run(fetch as unknown as MealFetch, true);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.items.map((m) => m.name)).toEqual(['Chocolate cake']);
      expect(result.current.widenedTo).toBe('choc');
    });

    it('leaves a picker with what it typed', async () => {
      const fetch = fetcher();
      const { result } = run(fetch as unknown as MealFetch, false);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.items).toEqual([]);
      expect(result.current.widenedTo).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
