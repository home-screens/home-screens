import { beforeEach, describe, expect, it, vi } from 'vitest';

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
