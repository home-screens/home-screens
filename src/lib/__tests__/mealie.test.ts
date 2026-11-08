import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mealie's plan as the hub reads it: the minute cache every wall shares, and
 * what a save's own answer reads after the save cleared it.
 */

const secrets = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
vi.mock('../secrets', () => ({ getSecret: vi.fn(async (key: string) => secrets.values[key]) }));
vi.mock('../api-utils', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api-utils')>();
  return { ...real, fetchWithTimeout: vi.fn() };
});

import { clearMealiePlanCache, getMealieContext, mealieJson, readMealiePlan, type MealiePlanEntry } from '../mealie';
import { fetchWithTimeout } from '../api-utils';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const USER = { id: 'u', username: 'sam', fullName: 'Sam', group: 'Home', household: 'Family', groupSlug: 'home', householdSlug: 'family' };
const entry = (id: number, title: string): MealiePlanEntry => ({ id, date: '2026-11-02', entryType: 'dinner', title, text: '', recipeId: null, recipe: null });

/** Mealie's plan as it stands; a held answer gives what Mealie had when the call was made. */
let plan: MealiePlanEntry[];
const planCalls = () => vi.mocked(fetchWithTimeout).mock.calls.filter(([url]) => String(url).includes('/mealplans')).length;

beforeEach(() => {
  vi.clearAllMocks();
  clearMealiePlanCache();
  secrets.values = { mealie_url: 'http://mealie.local', mealie_api_key: 'abc' };
  plan = [entry(1, 'Tacos')];
  vi.mocked(fetchWithTimeout).mockImplementation(async (url) => (String(url).endsWith('/api/users/self') ? json(USER) : json({ items: plan })));
});

describe('readMealiePlan', () => {
  it('reads Mealie once a minute for every wall, with where its recipe pages live', async () => {
    const [a, b] = await Promise.all([readMealiePlan('2026-11-01', '2026-11-07'), readMealiePlan('2026-11-01', '2026-11-07')]);
    await readMealiePlan('2026-11-01', '2026-11-07');
    expect(planCalls()).toBe(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'ok', read: { entries: [{ title: 'Tacos' }], baseUrl: 'http://mealie.local', groupSlug: 'home' } });
  });

  it("never answers a save with a wall's read that started before it, nor keeps that read for the next minute", async () => {
    // A wall's poll starts reading, and Mealie's answer to it is slow.
    let release!: () => void;
    let asked!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pollAsked = new Promise<void>((resolve) => { asked = resolve; });
    const before = [...plan];
    const answer = vi.mocked(fetchWithTimeout).getMockImplementation()!;
    let held = true;
    vi.mocked(fetchWithTimeout).mockImplementation(async (url, init) => {
      if (!held || !String(url).includes('/mealplans')) return answer(url, init);
      held = false;
      asked();
      await gate;
      return json({ items: before });
    });
    const polling = readMealiePlan('2026-11-01', '2026-11-07');
    await pollAsked;

    // The phone saves pizza beside the tacos, the save clears the cache, and
    // its answer reads the plan again. The poll lands a moment later with
    // what Mealie had before the save.
    plan = [entry(1, 'Tacos'), entry(2, 'Pizza')];
    clearMealiePlanCache();
    setTimeout(release, 20);
    const saved = await readMealiePlan('2026-11-01', '2026-11-07');
    expect(saved.status === 'ok' && saved.read.entries.map((e) => e.title)).toEqual(['Tacos', 'Pizza']);
    await polling;
    const next = await readMealiePlan('2026-11-01', '2026-11-07');
    expect(next.status === 'ok' && next.read.entries.map((e) => e.title)).toEqual(['Tacos', 'Pizza']);
  });

  it('keeps the last good copy while Mealie is down', async () => {
    await readMealiePlan('2026-11-01', '2026-11-07');
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await readMealiePlan('2026-11-01', '2026-11-07', { fresh: true })).toMatchObject({ status: 'stale', failure: 'unreachable', read: { entries: [{ title: 'Tacos' }] } });
  });
});

describe('mealieJson', () => {
  const page = (status: number, type: string) => new Response(type.includes('json') ? '{"detail":"Not Found"}' : '<html>Not found</html>', { status, headers: { 'Content-Type': type } });

  /* A Mealie address pointing at some other web server answered every read
   * with a plain 404 page, and the phone said to wait for Mealie. */
  it('takes a plain not-found page for something that is not Mealie', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(page(404, 'text/html'));
    await expect(mealieJson('/api/households/mealplans')).rejects.toMatchObject({ failure: 'not-mealie' });
  });

  it("keeps Mealie's own not-found, and a proxy's bad gateway, as Mealie having trouble", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(page(404, 'application/json'));
    await expect(mealieJson('/api/recipes/x')).rejects.toMatchObject({ failure: 'upstream', status: 404 });
    vi.mocked(fetchWithTimeout).mockResolvedValue(page(502, 'text/html'));
    await expect(mealieJson('/api/households/mealplans')).rejects.toMatchObject({ failure: 'upstream', status: 502 });
  });
});

describe('getMealieContext', () => {
  it("says where the household's recipe pages live", async () => {
    expect(await getMealieContext()).toEqual({ baseUrl: 'http://mealie.local', groupSlug: 'home' });
  });

  it('says Mealie is not connected when nothing is saved', async () => {
    secrets.values = {};
    await expect(getMealieContext()).rejects.toMatchObject({ failure: 'not-set-up' });
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe('Mealie favorites', () => {
  // Each test its own key, so the half-minute favorites cache of one never answers another.
  let n = 0;
  let favorites: string[];
  const R1 = '0f1e2d3c-4b5a-4968-8776-655443322110';
  const R2 = '1f1e2d3c-4b5a-4968-8776-655443322110';
  const favoriteCalls = () => vi.mocked(fetchWithTimeout).mock.calls.filter(([url]) => String(url).endsWith('/api/users/self/favorites'));
  const writes = () => vi.mocked(fetchWithTimeout).mock.calls
    .filter(([url]) => String(url).includes('/api/users/u/favorites/'))
    .map(([url, init]) => `${(init as RequestInit).method} ${String(url).replace('http://mealie.local', '')}`);

  beforeEach(() => {
    secrets.values = { mealie_url: 'http://mealie.local', mealie_api_key: `key-${n++}` };
    favorites = [R1];
    vi.mocked(fetchWithTimeout).mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith('/api/users/self')) return json(USER);
      if (u.endsWith('/api/users/self/favorites')) {
        return json({ ratings: [...favorites.map((recipeId) => ({ recipeId, isFavorite: true })), { recipeId: R2, rating: 4, isFavorite: false }] });
      }
      if (u.includes('/api/users/u/favorites/')) return new Response(null, { status: 200 });
      throw new Error(`unexpected ${(init as RequestInit | undefined)?.method ?? 'GET'} ${u}`);
    });
  });

  it("reads the key's person's hearts once per half minute, leaving out ratings that are not hearts", async () => {
    const { getMealieFavoriteIds } = await import('../mealie');
    expect([...await getMealieFavoriteIds()]).toEqual([R1]);
    await getMealieFavoriteIds();
    expect(favoriteCalls()).toHaveLength(1);
  });

  it('hearts and un-hearts by recipe id for the key\'s person, and the next read agrees without asking Mealie', async () => {
    const { getMealieFavoriteIds, setMealieFavorite } = await import('../mealie');
    await getMealieFavoriteIds();
    await setMealieFavorite(R2, true);
    await setMealieFavorite(R1, false);
    expect(writes()).toEqual([`POST /api/users/u/favorites/${R2}`, `DELETE /api/users/u/favorites/${R1}`]);
    expect([...await getMealieFavoriteIds()]).toEqual([R2]);
    expect(favoriteCalls()).toHaveLength(1);
  });

  it('says Mealie had a problem when it refuses a heart, and leaves the hearts as they were', async () => {
    const { getMealieFavoriteIds, setMealieFavorite } = await import('../mealie');
    await getMealieFavoriteIds();
    const answer = vi.mocked(fetchWithTimeout).getMockImplementation()!;
    vi.mocked(fetchWithTimeout).mockImplementation(async (url, init) => (
      String(url).includes('/api/users/u/favorites/') ? new Response('{"detail":"Not found"}', { status: 404 }) : answer(url, init)
    ));
    await expect(setMealieFavorite(R2, true)).rejects.toMatchObject({ failure: 'upstream', status: 404 });
    expect([...await getMealieFavoriteIds()]).toEqual([R1]);
  });
});

describe('the recipe book revision', () => {
  // Each test its own key, so the caches of one never answer another.
  let n = 0;
  let book: { total: number; updatedAt: string; favorites: string[]; categories: string[]; cookbooks: string[] };
  const revisionCalls = () => vi.mocked(fetchWithTimeout).mock.calls.filter(([url]) => String(url).includes('orderBy=updatedAt'));

  beforeEach(async () => {
    const { clearMealieRecipesRevision } = await import('../mealie');
    clearMealieRecipesRevision();
    vi.useRealTimers();
    secrets.values = { mealie_url: 'http://mealie.local', mealie_api_key: `rev-${n++}` };
    book = { total: 848, updatedAt: '2026-11-08T17:00:00Z', favorites: ['a'], categories: ['side'], cookbooks: ['weeknight'] };
    vi.mocked(fetchWithTimeout).mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('orderBy=updatedAt')) return json({ items: [{ id: 'x', slug: 'x', name: 'X', updatedAt: book.updatedAt }], total: book.total });
      if (u.endsWith('/api/users/self/favorites')) return json({ ratings: book.favorites.map((recipeId) => ({ recipeId, isFavorite: true })) });
      if (u.includes('/api/organizers/categories')) return json({ items: book.categories.map((slug) => ({ name: slug, slug })) });
      if (u.includes('/api/households/cookbooks')) return json({ items: book.cookbooks.map((slug) => ({ name: slug, slug })) });
      throw new Error(`unexpected ${u}`);
    });
  });

  it('asks Mealie once for every wall, with the budget a wall can wait for', async () => {
    const { getMealieRecipesRevision, MEALIE_WALL_READ } = await import('../mealie');
    const [a, b] = await Promise.all([getMealieRecipesRevision(), getMealieRecipesRevision()]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(revisionCalls()).toHaveLength(1);
    expect(revisionCalls()[0][1]).toMatchObject(MEALIE_WALL_READ);
  });

  it('moves when a recipe is added, deleted or edited, a heart changes, or a chip would', async () => {
    const { clearMealieRecipesRevision, getMealieRecipesRevision } = await import('../mealie');
    const seen = new Set<string>();
    const read = async () => {
      clearMealieRecipesRevision();
      // The hearts are kept half a minute on their own; a new key reads them again.
      secrets.values = { ...secrets.values, mealie_api_key: `rev-${n++}` };
      return getMealieRecipesRevision();
    };
    seen.add(await read());
    expect(await read()).toBe([...seen][0]);
    const changes: Array<() => void> = [
      () => { book.total = 849; book.updatedAt = '2026-11-08T17:01:00Z'; },
      () => { book.total = 848; },
      () => { book.updatedAt = '2026-11-08T17:02:00Z'; },
      () => { book.favorites = ['a', 'b']; },
      () => { book.categories = ['side', 'soup']; },
      () => { book.cookbooks = []; },
    ];
    for (const change of changes) {
      change();
      const next = await read();
      expect(seen.has(next)).toBe(false);
      seen.add(next);
    }
  });
});

describe('a recipe for a wall', () => {
  const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';
  let n = 0;
  beforeEach(() => {
    secrets.values = { mealie_url: 'http://mealie.local', mealie_api_key: `recipe-${n++}` };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is kept half a minute, so an open card reading again each minute gets the fixed recipe', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T17:00:00Z'), toFake: ['Date'] });
    let name = 'Chili';
    vi.mocked(fetchWithTimeout).mockImplementation(async () => json({ id: ID, slug: 'chili', name }));
    const { getMealieRecipe, MEALIE_WALL_READ } = await import('../mealie');
    expect((await getMealieRecipe(ID)).name).toBe('Chili');
    expect(vi.mocked(fetchWithTimeout).mock.calls[0][1]).toMatchObject(MEALIE_WALL_READ);
    name = 'Chili, fixed';
    vi.setSystemTime(new Date('2026-11-08T17:00:25Z'));
    expect((await getMealieRecipe(ID)).name).toBe('Chili');
    vi.setSystemTime(new Date('2026-11-08T17:00:31Z'));
    expect((await getMealieRecipe(ID)).name).toBe('Chili, fixed');
  });

  it("says a recipe Mealie no longer has is gone, by Mealie's own 404", async () => {
    vi.mocked(fetchWithTimeout).mockImplementation(async () => new Response('{"detail":"Not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
    const { getMealieRecipe } = await import('../mealie');
    await expect(getMealieRecipe(ID)).rejects.toMatchObject({ failure: 'upstream', status: 404 });
  });
});
