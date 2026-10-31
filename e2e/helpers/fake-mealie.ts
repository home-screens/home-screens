import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { APIRequestContext } from '@playwright/test';

/**
 * A small Mealie for E2E: the hub calls Mealie from the server, so the
 * browser-boundary stubs in stubs.ts cannot stand in for it. Answers in the
 * shapes a real Mealie 3.29 gives (recorded from the plan 233 rig), from an
 * in-memory household: a handful of made-up recipes and a plan built around
 * today, so a spec can read the plan, write it back and look at what landed.
 */

export const FAKE_MEALIE_TOKEN = 'e2e-mealie-token';

export interface FakeRecipe {
  id: string;
  slug: string;
  name: string;
  /** Has a photo (served as a tiny WebP). */
  photo: boolean;
  prepMinutes?: number;
  tags?: string[];
  favorite?: boolean;
  /** Category slugs (`dinner`, `dessert`), as Mealie's category filter matches them. */
  categories?: string[];
}

export interface FakeEntry {
  id: number;
  date: string;
  entryType: 'breakfast' | 'lunch' | 'dinner' | 'side' | 'snack' | 'drink' | 'dessert';
  title: string;
  text: string;
  recipeId: string | null;
}

export interface FakeMealie {
  url: string;
  recipes: FakeRecipe[];
  entries: FakeEntry[];
  /** Every request the hub made, method and path. */
  requests: string[];
  close(): Promise<void>;
}

/** A 1x1 WebP. */
const TINY_WEBP = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');

export const FAKE_RECIPES: FakeRecipe[] = [
  { id: '0f1e2d3c-4b5a-4968-8776-655443322110', slug: 'harvest-chili', name: 'Harvest Chili', photo: true, prepMinutes: 20, tags: ['Dinner'], favorite: true, categories: ['dinner'] },
  { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', slug: 'skillet-cornbread', name: 'Skillet Cornbread', photo: true, prepMinutes: 10 },
  { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', slug: 'apple-crumble', name: 'Apple Crumble', photo: false, prepMinutes: 15, favorite: true, categories: ['dessert'] },
  { id: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f', slug: 'blueberry-pancakes', name: 'Blueberry Pancakes', photo: true, prepMinutes: 15 },
  { id: '4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80', slug: 'mac-and-cheese', name: 'Mac and Cheese', photo: true, prepMinutes: 25, categories: ['dinner'] },
  { id: '5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091', slug: 'cheese-board', name: 'Cheese Board', photo: true, prepMinutes: 5 },
];

/** Local `YYYY-MM-DD`, `offset` days from today: the household zone is the hub's, the same machine. */
export function fakeMealieDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today: pancakes for breakfast, a school-lunch note, chili for dinner with cornbread, crumble and lemonade. */
export function defaultFakeEntries(): FakeEntry[] {
  const today = fakeMealieDay(0);
  const r = (slug: string) => FAKE_RECIPES.find((x) => x.slug === slug)!.id;
  return [
    { id: 11, date: today, entryType: 'breakfast', title: '', text: '', recipeId: r('blueberry-pancakes') },
    { id: 12, date: today, entryType: 'lunch', title: 'School lunch', text: 'Pizza day', recipeId: null },
    { id: 13, date: today, entryType: 'dinner', title: '', text: '', recipeId: r('harvest-chili') },
    { id: 14, date: today, entryType: 'side', title: '', text: '', recipeId: r('skillet-cornbread') },
    { id: 15, date: today, entryType: 'dessert', title: '', text: '', recipeId: r('apple-crumble') },
    { id: 16, date: today, entryType: 'drink', title: 'Lemonade', text: '', recipeId: null },
    { id: 17, date: fakeMealieDay(1), entryType: 'dinner', title: '', text: '', recipeId: r('mac-and-cheese') },
  ];
}

function recipeSummary(r: FakeRecipe) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    image: r.photo ? 'aB3x' : null,
    recipeCategory: (r.categories ?? []).map((slug) => ({ name: slug[0].toUpperCase() + slug.slice(1), slug })),
    tags: (r.tags ?? []).map((name) => ({ name })),
    rating: null,
    recipeServings: 4,
    prepTime: r.prepMinutes ? `${r.prepMinutes} minutes` : null,
    performTime: null,
    totalTime: null,
    prepTimeSeconds: null,
    performTimeSeconds: null,
    totalTimeSeconds: null,
    dateUpdated: '2026-10-30T00:00:00Z',
  };
}

export async function startFakeMealie(entries: FakeEntry[] = defaultFakeEntries()): Promise<FakeMealie> {
  const state: FakeMealie = { url: '', recipes: FAKE_RECIPES, entries: [...entries], requests: [], close: async () => {} };
  // Numbers the way Mealie on SQLite gives them: one past the highest left,
  // so deleting the newest entry hands its number to the next one made.
  const nextId = () => Math.max(999, ...state.entries.map((e) => e.id)) + 1;
  const withRecipe = (e: FakeEntry) => {
    const recipe = state.recipes.find((r) => r.id === e.recipeId);
    return { ...e, groupId: 'g1', userId: 'u1', householdId: 'h1', recipe: recipe ? recipeSummary(recipe) : null };
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = url.pathname;
    state.requests.push(`${req.method} ${path}`);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (path === '/api/app/about') return send(200, { version: 'v3.29.0', production: true });
      if (path.startsWith('/api/media/recipes/')) {
        res.writeHead(200, { 'Content-Type': 'image/webp' });
        return res.end(TINY_WEBP);
      }
      if (req.headers.authorization !== `Bearer ${FAKE_MEALIE_TOKEN}`) return send(401, { detail: 'Could not validate credentials' });
      const body = raw ? JSON.parse(raw) : null;

      if (path === '/api/users/self') {
        return send(200, { id: 'u1', username: 'taylor', fullName: 'Taylor', group: 'Home', household: 'Family', groupSlug: 'home', householdSlug: 'family' });
      }
      if (path === '/api/users/self/favorites') {
        return send(200, { ratings: state.recipes.filter((r) => r.favorite).map((r) => ({ recipeId: r.id, rating: 5, isFavorite: true })) });
      }
      if (path === '/api/households/mealplans' && req.method === 'GET') {
        const start = url.searchParams.get('start_date') ?? '0000-00-00';
        const end = url.searchParams.get('end_date') ?? '9999-99-99';
        const items = state.entries.filter((e) => e.date >= start && e.date <= end).map(withRecipe);
        return send(200, { page: 1, per_page: -1, total: items.length, total_pages: 1, items, next: null, previous: null });
      }
      if (path === '/api/households/mealplans' && req.method === 'POST') {
        const entry: FakeEntry = { id: nextId(), date: body.date, entryType: body.entryType, title: body.title ?? '', text: body.text ?? '', recipeId: body.recipeId ?? null };
        state.entries.push(entry);
        return send(201, withRecipe(entry));
      }
      const one = /^\/api\/households\/mealplans\/(\d+)$/.exec(path);
      if (one) {
        const id = Number(one[1]);
        const i = state.entries.findIndex((e) => e.id === id);
        if (i < 0) return send(404, { detail: 'Not found' });
        if (req.method === 'DELETE') {
          const [gone] = state.entries.splice(i, 1);
          return send(200, withRecipe(gone));
        }
        if (req.method === 'PUT') {
          state.entries[i] = { id, date: body.date, entryType: body.entryType, title: body.title ?? '', text: body.text ?? '', recipeId: body.recipeId ?? null };
          return send(200, withRecipe(state.entries[i]));
        }
      }
      if (path === '/api/households/mealplans/rules') {
        // No rules: Suggest picks dinners itself, from the dinner category.
        return send(200, { page: 1, per_page: -1, total: 0, total_pages: 1, items: [] });
      }
      if (path === '/api/organizers/categories') {
        const items = [{ name: 'Dessert', slug: 'dessert' }, { name: 'Dinner', slug: 'dinner' }];
        return send(200, { page: 1, per_page: -1, total: items.length, total_pages: 1, items });
      }
      if (path === '/api/households/mealplans/random' && req.method === 'POST') {
        // The household's rules always pick the chili here.
        const entry: FakeEntry = { id: nextId(), date: body.date, entryType: body.entryType, title: '', text: '', recipeId: state.recipes[0].id };
        state.entries.push(entry);
        return send(200, withRecipe(entry));
      }
      const recipeOne = /^\/api\/recipes\/([0-9a-f-]{36})$/.exec(path);
      if (recipeOne) {
        const recipe = state.recipes.find((r) => r.id === recipeOne[1]);
        if (!recipe) return send(404, { detail: 'Not found' });
        return send(200, {
          ...recipeSummary(recipe),
          recipeIngredient: [{ display: '1 lb ground beef' }, { display: '2 cans kidney beans' }],
          recipeInstructions: [{ text: 'Brown the beef.' }, { text: 'Simmer with the beans.' }],
        });
      }
      if (path === '/api/recipes') {
        const search = (url.searchParams.get('search') ?? '').toLowerCase();
        const filter = url.searchParams.get('queryFilter') ?? '';
        const like = [...filter.matchAll(/name LIKE "%([^%]+)%"/g)].map((m) => m[1].toLowerCase());
        const ids = /id IN \[(.*)\]/.exec(filter)?.[1]?.match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, ''));
        const category = /recipeCategory\.slug (NOT IN|IN) \[(.*)\]/.exec(filter);
        const slugs = category?.[2].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, '')) ?? [];
        let items = state.recipes.filter((r) => {
          const name = r.name.toLowerCase();
          if (like.length && !like.every((w) => name.includes(w))) return false;
          if (ids && !ids.includes(r.id)) return false;
          if (category) {
            const inOne = (r.categories ?? []).some((c) => slugs.includes(c));
            if (category[1] === 'IN' ? !inOne : inOne) return false;
          }
          if (search && !search.split(/\s+/).some((w) => name.includes(w))) return false;
          return true;
        });
        if (filter.includes('lastMade')) items = items.slice(0, 2);
        const perPage = Number(url.searchParams.get('perPage'));
        if (perPage > 0) items = items.slice(0, perPage);
        return send(200, { page: 1, per_page: 30, total: items.length, total_pages: 1, items: items.map(recipeSummary) });
      }
      return send(404, { detail: 'Not found' });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return state;
}

/** Point the worker's hub at `mealie` and switch the meal plan to it. */
export async function connectFakeMealie(request: APIRequestContext, mealie: Pick<FakeMealie, 'url'>, token = FAKE_MEALIE_TOKEN): Promise<void> {
  for (const [key, value] of [['mealie_url', mealie.url], ['mealie_api_key', token]]) {
    const res = await request.put('/api/secrets', { data: { key, value } });
    if (!res.ok()) throw new Error(`Saving ${key} failed: ${res.status()}`);
  }
  const res = await request.put('/api/meals/data', {
    data: { settings: { enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'sunday', defaultSlotTimes: { dinner: '18:00' }, planSource: 'mealie' } },
  });
  if (!res.ok()) throw new Error(`Switching the plan to Mealie failed: ${res.status()}`);
}

/** Put the worker's hub back on its own plan with no Mealie saved, so later specs never see Mealie. */
export async function disconnectFakeMealie(request: APIRequestContext): Promise<void> {
  for (const key of ['mealie_url', 'mealie_api_key']) await request.delete('/api/secrets', { data: { key } });
  await request.put('/api/meals/data', { data: { settings: { enabledSlots: ['breakfast', 'lunch', 'dinner'], weekStartDay: 'sunday', defaultSlotTimes: {} } } });
}
