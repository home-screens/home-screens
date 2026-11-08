import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * How the hub searches Mealie for the pickers and the wall's recipe book:
 * what each search asks Mealie for, and how many reach it at once. Mealie
 * keeps running a search the hub stopped waiting for, and its own search on
 * one letter held a Pi's database for minutes, so these are the limits that
 * keep a picker from piling work onto a slow Mealie.
 */

const secrets = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock('../secrets', () => ({ getSecret: vi.fn(async (key: string) => secrets.values[key]) }));
vi.mock('../api-utils', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api-utils')>();
  return { ...real, fetchWithTimeout: vi.fn() };
});

import { nameHoldsWords, searchMealieRecipes } from '../mealie';
import { fetchWithTimeout, type FetchRetryOptions } from '../api-utils';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const recipe = (name: string) => ({ id: `id-${name}`, slug: name.toLowerCase().replace(/\s+/g, '-'), name });
const listing = (...names: string[]) => json({ page: 1, total_pages: 1, total: names.length, items: names.map(recipe) });

/** The recipe calls Mealie was sent, as their query parameters, with the options each went out with. */
function recipeCalls() {
  return vi.mocked(fetchWithTimeout).mock.calls
    .filter(([url]) => String(url).includes('/api/recipes'))
    .map(([url, init]) => ({ params: new URL(String(url)).searchParams, init: init as FetchRetryOptions }));
}

let n = 0;
beforeEach(() => {
  vi.clearAllMocks();
  // Each test its own key, so the favorites cache of one never answers another.
  secrets.values = { mealie_url: 'http://mealie.local', mealie_api_key: `key-${n++}` };
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
    const u = String(url);
    if (u.endsWith('/api/users/self/favorites')) return json({ ratings: [{ recipeId: 'r1', isFavorite: true }] });
    return listing('Banana bread');
  });
});

describe('searchMealieRecipes', () => {
  it("reads only recipe names for one or two letters, by the start of a word, and never Mealie's own search", async () => {
    const page = await searchMealieRecipes({ search: ' b ' });
    expect(page.items.map((r) => r.name)).toEqual(['Banana bread']);
    const [call, ...rest] = recipeCalls();
    expect(rest).toEqual([]);
    expect(call.params.has('search')).toBe(false);
    expect(call.params.get('queryFilter')).toBe('name LIKE "b%" OR name LIKE "% b%"');
    expect(call.params.get('orderBy')).toBe('name');
    expect(call.params.get('orderDirection')).toBe('asc');
  });

  it('keeps a filter beside two letters, each in brackets', async () => {
    await searchMealieRecipes({ search: 'pi', filter: 'recent' });
    await searchMealieRecipes({ search: 'pi', filter: 'favorites' });
    const [recent, favorites] = recipeCalls();
    expect(recent.params.get('queryFilter')).toBe('(lastMade > 1970-01-01) AND (name LIKE "pi%" OR name LIKE "% pi%")');
    expect(recent.params.get('orderBy')).toBe('lastMade');
    expect(favorites.params.get('queryFilter')).toBe('(id IN ["r1"]) AND (name LIKE "pi%" OR name LIKE "% pi%")');
  });

  it('leaves quotes and wildcards out of a short search', async () => {
    await searchMealieRecipes({ search: '"%' });
    const [call] = recipeCalls();
    // Nothing left to look for: the whole book by name, as with nothing typed.
    expect(call.params.has('queryFilter')).toBe(false);
    expect(call.params.has('search')).toBe(false);
  });

  it("asks Mealie's own search for three letters or more, and never twice", async () => {
    await searchMealieRecipes({ search: 'pie' });
    const [call, ...rest] = recipeCalls();
    expect(rest).toEqual([]);
    expect(call.params.get('search')).toBe('pie');
    expect(call.params.has('queryFilter')).toBe(false);
    // Mealie would still be running the first when a retry went out.
    expect(call.init.retries).toBe(0);
  });

  it('keeps a retry for a plain listing, which costs Mealie little, inside the time a wall waits', async () => {
    await searchMealieRecipes({ filter: 'all' });
    const { retries, timeout } = recipeCalls()[0].init;
    expect(retries).toBe(1);
    // Two tries and the half-second pause between them end before a wall stops waiting for the hub.
    expect(2 * (timeout ?? 0) + 500).toBeLessThan(15_000);
  });

  it('asks first for names where each word starts a word, keeps those that hold the words, and goes no further', async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async () => listing('Best Macaroni and Cheese Ever', 'Cheese and Onion Bread in the (bread Machine)'));
    const page = await searchMealieRecipes({ search: 'mac and cheese' });
    // "Machine" starts with "mac" too, but sits far from "cheese".
    expect(page.items.map((r) => r.name)).toEqual(['Best Macaroni and Cheese Ever']);
    expect(page.total).toBe(1);
    const calls = recipeCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].params.get('queryFilter')).toBe(
      '(name LIKE "mac%" OR name LIKE "% mac%") AND (name LIKE "and%" OR name LIKE "% and%") AND (name LIKE "cheese%" OR name LIKE "% cheese%")',
    );
    // Enough to choose the first page's thirty from.
    expect(calls[0].params.get('perPage')).toBe('100');
    expect(calls[0].init.retries).toBe(0);
  });

  it("falls back to Mealie's own search only when no name holds every word", async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
      const params = new URL(String(url)).searchParams;
      return params.get('queryFilter')?.includes('LIKE') ? listing() : listing('Cheesy mac', 'Cheese scones');
    });
    const page = await searchMealieRecipes({ search: 'mac and cheese' });
    expect(page.items.map((r) => r.name)).toEqual(['Cheesy mac', 'Cheese scones']);
    const [names, wide] = recipeCalls();
    expect(names.params.has('search')).toBe(false);
    expect(wide.params.get('search')).toBe('mac and cheese');
  });

  it("still asks Mealie's own search when the name lookup fails", async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) => (
      new URL(String(url)).searchParams.has('search') ? listing('Cheesy mac') : new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } })
    ));
    const page = await searchMealieRecipes({ search: 'mac and cheese' });
    expect(page.items.map((r) => r.name)).toEqual(['Cheesy mac']);
  });

  it('hands the caller giving up to the call to Mealie', async () => {
    const controller = new AbortController();
    await searchMealieRecipes({ search: 'pie', signal: controller.signal });
    expect(recipeCalls()[0].init.signal).toBe(controller.signal);
  });
});

describe('searches waiting their turn', () => {
  /** Hold every search call until it is let go, as a slow Mealie would. */
  function holdSearches() {
    const held: Array<{ search: string; release: () => void }> = [];
    vi.mocked(fetchWithTimeout).mockImplementation((url, init) => new Promise((resolve, reject) => {
      const search = new URL(String(url)).searchParams.get('search') ?? '';
      const signal = (init as RequestInit | undefined)?.signal;
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      held.push({ search, release: () => resolve(listing(search)) });
    }));
    return held;
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('sends at most two at a time, and a search dropped while waiting never goes out', async () => {
    const held = holdSearches();
    const drops = ['chi', 'chic', 'chick', 'chicken'].map(() => new AbortController());
    const searches = ['chi', 'chic', 'chick', 'chicken'].map((search, i) => searchMealieRecipes({ search, signal: drops[i].signal }));
    await settle();
    expect(held.map((h) => h.search)).toEqual(['chi', 'chic']);

    // More letters typed: the picker drops "chick" before its turn comes.
    drops[2].abort();
    await expect(searches[2]).rejects.toMatchObject({ failure: 'unreachable' });
    held[0].release();
    await settle();
    expect(held.map((h) => h.search)).toEqual(['chi', 'chic', 'chicken']);

    held[1].release();
    held[2].release();
    expect((await searches[3]).items.map((r) => r.name)).toEqual(['chicken']);
    await Promise.all([searches[0], searches[1]]);

    // The line is empty again: the next search goes straight out.
    const next = searchMealieRecipes({ search: 'tacos' });
    await settle();
    expect(held.map((h) => h.search)).toEqual(['chi', 'chic', 'chicken', 'tacos']);
    held[3].release();
    await next;
  });

  it('frees its turn when Mealie fails, and when the caller drops it at Mealie', async () => {
    const held = holdSearches();
    const dropped = new AbortController();
    const first = searchMealieRecipes({ search: 'soup', signal: dropped.signal });
    const second = searchMealieRecipes({ search: 'stew' });
    const third = searchMealieRecipes({ search: 'chili' });
    await settle();
    expect(held.map((h) => h.search)).toEqual(['soup', 'stew']);
    dropped.abort();
    await expect(first).rejects.toMatchObject({ failure: 'unreachable' });
    await settle();
    expect(held.map((h) => h.search)).toEqual(['soup', 'stew', 'chili']);
    held[1].release();
    held[2].release();
    await Promise.all([second, third]);
  });

  it('stops a dropped search of several words at the name lookup', async () => {
    const held = holdSearches();
    const dropped = new AbortController();
    const search = searchMealieRecipes({ search: 'mac and cheese', signal: dropped.signal });
    await settle();
    dropped.abort();
    await expect(search).rejects.toMatchObject({ failure: 'unreachable' });
    await settle();
    expect(held).toHaveLength(1);
    expect(recipeCalls()).toHaveLength(1);
  });

  it('lets plain listings past a line of searches', async () => {
    const held = holdSearches();
    const searches = ['soup', 'stew'].map((search) => searchMealieRecipes({ search }));
    await settle();
    const listingAsked = searchMealieRecipes({ filter: 'all' });
    await settle();
    expect(held.map((h) => h.search)).toEqual(['soup', 'stew', '']);
    held.forEach((h) => h.release());
    await Promise.all([...searches, listingAsked]);
  });
});

describe('nameHoldsWords', () => {
  const holds = (name: string, typed: string) => nameHoldsWords(name, typed.split(' '));

  it('takes whole words anywhere in the name, in any order', () => {
    expect(holds('Lemon Pepper Chicken Breasts on a Bed of Rice', 'chicken rice')).toBe(true);
    expect(holds('Lemon Pepper Chicken Breasts on a Bed of Rice', 'rice chicken')).toBe(true);
    expect(holds("Marilyn's Mac and Cheese With Tomatoes", 'cheese mac')).toBe(true);
  });

  it('takes the start of a longer word only near another typed word', () => {
    expect(holds('Best Macaroni and Cheese Ever', 'mac and cheese')).toBe(true);
    expect(holds('Velveeta Ultimate Macaroni and Cheese', 'cheese mac')).toBe(true);
    expect(holds('Ultimate Chocolate Chip Cookies', 'choc chip cookies')).toBe(true);
    expect(holds('Easy Crock Pot Chicken and Rice', 'easy chick')).toBe(true);
    expect(holds('Cheese and Onion Bread in the (bread Machine)', 'mac and cheese')).toBe(false);
    expect(holds('Garlic Cheese Rolls for Bread Machine', 'cheese mac')).toBe(false);
    expect(holds('Strawberry Cheesecake Ice Cream (For Electric Ice Cream Machine)', 'cheese mac')).toBe(false);
  });

  it('reads words across punctuation and accents', () => {
    expect(holds('Bacon-Wrapped Jalapeño Poppers', 'bacon jalapeño')).toBe(true);
    expect(holds('Chicken & Rice (One Pot)', 'chicken rice')).toBe(true);
  });

  it('needs every word', () => {
    expect(holds('Chicken Pot Pie', 'chicken rice')).toBe(false);
  });
});
