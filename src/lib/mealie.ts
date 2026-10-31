import { createHash, randomUUID } from 'crypto';
import { getSecret } from './secrets';
import { createTTLCache, fetchWithTimeout, type FetchRetryOptions } from './api-utils';

/**
 * The hub's side of a connected Mealie (https://mealie.io): where it is, how
 * to ask it things, and what each failure means for the family.
 *
 * Mealie is self-hosted, usually on the home network, so the address is
 * whatever the family typed in Settings > Integrations, private addresses
 * included, the same as Immich. Every call goes from the hub: a display-only
 * Pi may not reach the address the hub uses (`localhost` when Mealie runs on
 * the hub, a name only the hub resolves).
 *
 * Mealie 2.0 split groups into households and moved the meal plan and the
 * shopping lists under `/api/households`; nothing older is supported.
 */

export const MEALIE_MIN_MAJOR_VERSION = 2;

// ── Mealie's shapes, only the fields Home Screens reads ──

/** Mealie's meal types. `side`, `dessert` and `drink` become courses here. */
export type MealieEntryType = 'breakfast' | 'lunch' | 'dinner' | 'side' | 'snack' | 'drink' | 'dessert';

export const MEALIE_ENTRY_TYPES: readonly MealieEntryType[] = ['breakfast', 'lunch', 'dinner', 'side', 'snack', 'drink', 'dessert'];

export interface MealieOrganizer {
  id?: string;
  name: string;
  slug?: string;
}

export interface MealieRecipeSummary {
  id: string;
  slug: string;
  name: string | null;
  /** A cache key for the photo; absent or null when the recipe has none. */
  image?: unknown;
  description?: string | null;
  recipeCategory?: MealieOrganizer[] | null;
  tags?: MealieOrganizer[] | null;
  rating?: number | null;
  recipeServings?: number | null;
  recipeYield?: string | null;
  totalTime?: string | null;
  prepTime?: string | null;
  cookTime?: string | null;
  performTime?: string | null;
  totalTimeSeconds?: number | null;
  prepTimeSeconds?: number | null;
  performTimeSeconds?: number | null;
  dateUpdated?: string | null;
  updatedAt?: string | null;
}

export interface MealiePlanEntry {
  id: number;
  date: string;
  entryType: MealieEntryType;
  title: string;
  text: string;
  recipeId: string | null;
  recipe: MealieRecipeSummary | null;
  groupId?: string;
  userId?: string;
  householdId?: string;
}

export interface MealieUser {
  id: string;
  username: string;
  fullName: string;
  group: string;
  household: string;
  groupSlug: string;
  householdSlug: string;
}

/** What a create or update of a plan entry sends. */
export interface MealiePlanEntryWrite {
  date: string;
  entryType: MealieEntryType;
  title: string;
  text: string;
  recipeId: string | null;
}

// ── Failures ──

/**
 * Why Mealie could not be used, in terms the family can act on.
 *
 * - `not-set-up`: no address or key saved yet.
 * - `bad-address`: what was saved is not a web address.
 * - `unreachable`: nothing answered at the address.
 * - `not-mealie`: something answered, but not Mealie.
 * - `too-old`: Mealie older than 2.0.
 * - `key-rejected`: Mealie refused the key.
 * - `upstream`: Mealie answered with an error of its own.
 */
export type MealieFailure = 'not-set-up' | 'bad-address' | 'unreachable' | 'not-mealie' | 'too-old' | 'key-rejected' | 'upstream';

export class MealieError extends Error {
  constructor(
    readonly failure: MealieFailure,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'MealieError';
  }
}

// ── Connection ──

export interface MealieConfig {
  url: string;
  apiKey: string;
}

/**
 * The address as a base to put `/api/...` after: trailing slashes go, and so
 * does a pasted `/api` or `/docs`, which is what people copy from Mealie's own
 * help pages. Null when it is not an http(s) address at all.
 */
export function normalizeMealieUrl(raw: string): string | null {
  const trimmed = raw.trim();
  // Another scheme (ftp://) is refused, not read as a host called "ftp".
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const path = parsed.pathname.replace(/\/+$/, '').replace(/\/(api|docs)$/i, '');
  return `${parsed.protocol}//${parsed.host}${path}`;
}

export async function getMealieConfig(): Promise<MealieConfig | null> {
  const [rawUrl, apiKey] = await Promise.all([getSecret('mealie_url'), getSecret('mealie_api_key')]);
  if (!rawUrl || !apiKey) return null;
  const url = normalizeMealieUrl(rawUrl);
  if (!url) throw new MealieError('bad-address', 'The Mealie address is not a web address');
  return { url, apiKey: apiKey.trim() };
}

async function requireConfig(): Promise<MealieConfig> {
  const cfg = await getMealieConfig();
  if (!cfg) throw new MealieError('not-set-up', 'Mealie is not connected');
  return cfg;
}

/** Keys caches by connection, so a new address or key never answers from the old one's copy. */
function connectionKey(cfg: MealieConfig): string {
  return `${cfg.url}#${createHash('sha256').update(cfg.apiKey).digest('hex').slice(0, 12)}`;
}

/**
 * One call to Mealie with the saved key. Only reads are retried: a create
 * that timed out may still have landed, and a retry would plan it twice.
 */
export async function mealieFetch(
  path: string,
  init: FetchRetryOptions & { json?: unknown } = {},
  cfg?: MealieConfig,
): Promise<Response> {
  const conn = cfg ?? await requireConfig();
  const { json, headers, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();
  let res: Response;
  try {
    res = await fetchWithTimeout(`${conn.url}${path}`, {
      timeout: 10_000,
      retries: method === 'GET' ? 2 : 0,
      ...rest,
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${conn.apiKey}`,
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch {
    // Never echo the error: some carry the address with the key's header.
    throw new MealieError('unreachable', 'Mealie did not answer');
  }
  if (res.status === 401 || res.status === 403) {
    throw new MealieError('key-rejected', 'Mealie did not accept the key', res.status);
  }
  return res;
}

export async function mealieJson<T>(
  path: string,
  init?: FetchRetryOptions & { json?: unknown },
  cfg?: MealieConfig,
): Promise<T> {
  const res = await mealieFetch(path, init, cfg);
  if (!res.ok) throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MealieError('not-mealie', 'Mealie answered with something that is not JSON');
  }
}

/** Parse Mealie's own version string. `nightly` and other named builds count as current. */
export function mealieMajorVersion(version: string): number | null {
  const m = /^v?(\d+)\./.exec(version.trim());
  return m ? Number(m[1]) : null;
}

export type MealieValidation =
  /**
   * `url`: the saved address, as the hub uses it when it is a web address and
   * as typed when it is not, so the family can check it for a typo. Absent
   * only when no address is saved.
   */
  | { ok: true; version: string; household: string; user: string; url: string }
  | { ok: false; failure: Exclude<MealieFailure, 'upstream'>; version?: string; url?: string };

/**
 * The Test button: is there a Mealie at the address, is it new enough, and
 * does it take the key. Says which household the plan will come from, since
 * that is decided by whoever made the key.
 */
export async function validateMealieConnection(): Promise<MealieValidation> {
  let cfg: MealieConfig | null;
  try {
    cfg = await getMealieConfig();
  } catch (err) {
    if (err instanceof MealieError && err.failure === 'bad-address') return { ok: false, failure: 'bad-address', ...(await savedAddress()) };
    throw err;
  }
  if (!cfg) return { ok: false, failure: 'not-set-up', ...(await savedAddress()) };
  const url = cfg.url;

  let version: string;
  try {
    const res = await fetchWithTimeout(`${url}/api/app/about`, { timeout: 5_000, retries: 0, headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, failure: res.status === 404 ? 'not-mealie' : 'unreachable', url };
    const about = await res.json().catch(() => null) as { version?: unknown } | null;
    if (!about || typeof about.version !== 'string') return { ok: false, failure: 'not-mealie', url };
    version = about.version.replace(/^v/, '');
  } catch {
    return { ok: false, failure: 'unreachable', url };
  }
  const major = mealieMajorVersion(version);
  if (major !== null && major < MEALIE_MIN_MAJOR_VERSION) return { ok: false, failure: 'too-old', version, url };

  try {
    const user = await mealieJson<MealieUser>('/api/users/self', { timeout: 5_000, retries: 0 }, cfg);
    userCache.set(connectionKey(cfg), user);
    return { ok: true, version, household: user.household, user: user.fullName || user.username, url };
  } catch (err) {
    if (err instanceof MealieError && err.failure === 'key-rejected') return { ok: false, failure: 'key-rejected', version, url };
    if (err instanceof MealieError && err.failure === 'unreachable') return { ok: false, failure: 'unreachable', version, url };
    return { ok: false, failure: 'not-mealie', version, url };
  }
}

/** The address saved for Mealie with no working connection to go with it: as the hub would use it, or as typed. */
async function savedAddress(): Promise<{ url?: string }> {
  const raw = (await getSecret('mealie_url'))?.trim();
  return raw ? { url: normalizeMealieUrl(raw) ?? raw } : {};
}

// ── Who the key belongs to (for recipe page links) ──

const userCache = createTTLCache<MealieUser>(10 * 60_000);

export async function getMealieUser(): Promise<MealieUser> {
  const cfg = await requireConfig();
  const key = connectionKey(cfg);
  const cached = userCache.get(key);
  if (cached) return cached;
  const user = await mealieJson<MealieUser>('/api/users/self', undefined, cfg);
  userCache.set(key, user);
  return user;
}

// ── The meal plan ──

export interface MealiePlanRead {
  entries: MealiePlanEntry[];
  /** When Mealie gave this answer (ms since epoch). */
  fetchedAt: number;
  /** Mealie's address, for links back to it. */
  baseUrl: string;
  groupSlug: string;
}

/**
 * About as fresh as a wall's own one-minute poll, and the calendar feed cache
 * keeps the same minute. A last good copy is kept a day for when Mealie is
 * down: a wall that reloads during an outage still has the week.
 */
const PLAN_TTL_MS = 60_000;
const PLAN_STALE_MS = 24 * 60 * 60_000;
const planCache = createTTLCache<MealiePlanRead>(PLAN_TTL_MS, PLAN_STALE_MS);
const planInflight = new Map<string, Promise<MealiePlanRead>>();

/** Entries in date order, and within a day in the order they were made, so "the first dinner" is stable. */
export function sortMealieEntries(entries: MealiePlanEntry[]): MealiePlanEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

async function loadPlan(cfg: MealieConfig, start: string, end: string): Promise<MealiePlanRead> {
  const [page, user] = await Promise.all([
    mealieJson<{ items?: MealiePlanEntry[] }>(
      `/api/households/mealplans?start_date=${start}&end_date=${end}&perPage=-1&orderBy=date&orderDirection=asc`,
      undefined,
      cfg,
    ),
    getMealieUser(),
  ]);
  const entries = Array.isArray(page?.items) ? page.items : [];
  return { entries: sortMealieEntries(entries), fetchedAt: Date.now(), baseUrl: cfg.url, groupSlug: user.groupSlug };
}

export type MealiePlanResult =
  | { status: 'ok'; read: MealiePlanRead }
  | { status: 'stale'; read: MealiePlanRead; failure: MealieFailure }
  | { status: 'failed'; failure: MealieFailure };

/**
 * Mealie's plan for `start` to `end` (inclusive ISO dates), from the minute
 * cache when it can. Simultaneous misses share one call. `fresh` skips the
 * cache, for re-reading the days a save is about to change.
 */
export async function readMealiePlan(start: string, end: string, { fresh = false } = {}): Promise<MealiePlanResult> {
  let cfg: MealieConfig;
  try {
    cfg = await requireConfig();
  } catch (err) {
    return { status: 'failed', failure: err instanceof MealieError ? err.failure : 'upstream' };
  }
  const key = `${connectionKey(cfg)}|${start}|${end}`;
  if (!fresh) {
    const cached = planCache.get(key);
    if (cached) return { status: 'ok', read: cached };
  }
  let pending = fresh ? undefined : planInflight.get(key);
  if (!pending) {
    pending = loadPlan(cfg, start, end);
    if (!fresh) {
      planInflight.set(key, pending);
      pending.finally(() => {
        if (planInflight.get(key) === pending) planInflight.delete(key);
      }).catch(() => {});
    }
  }
  try {
    const read = await pending;
    planCache.set(key, read);
    return { status: 'ok', read };
  } catch (err) {
    const failure = err instanceof MealieError ? err.failure : 'upstream';
    const stale = planCache.getStale(key);
    return stale ? { status: 'stale', read: stale, failure } : { status: 'failed', failure };
  }
}

/** Forget every cached plan read, after a save changed Mealie. */
export function clearMealiePlanCache(): void {
  planCache.clear();
}

export function createMealieEntry(entry: MealiePlanEntryWrite): Promise<MealiePlanEntry> {
  return mealieJson<MealiePlanEntry>('/api/households/mealplans', { method: 'POST', json: entry });
}

/** Mealie's update needs the whole entry back, including who it belongs to. */
export function updateMealieEntry(current: MealiePlanEntry, change: MealiePlanEntryWrite): Promise<MealiePlanEntry> {
  return mealieJson<MealiePlanEntry>(`/api/households/mealplans/${current.id}`, {
    method: 'PUT',
    json: { ...change, id: current.id, groupId: current.groupId, userId: current.userId },
  });
}

/** Mealie's own pick for one meal, following the household's meal plan rules in Mealie. */
export function createRandomMealieEntry(date: string, entryType: MealieEntryType): Promise<MealiePlanEntry> {
  return mealieJson<MealiePlanEntry>('/api/households/mealplans/random', { method: 'POST', json: { date, entryType } });
}

/** One of the household's meal plan rules: which days and meals it covers, and its recipe filter. */
export interface MealieMealPlanRule {
  /** A weekday (`monday`), or `unset` for every day. */
  day: string;
  /** A kind of entry (`dinner`), or `unset` for every kind. */
  entryType: string;
  /** Mealie's filter for the recipes the rule picks from; empty when it picks from all of them. */
  queryFilterString?: string | null;
}

/** The household's meal plan rules in Mealie. */
export async function listMealieRules(): Promise<MealieMealPlanRule[]> {
  const page = await mealieJson<{ items?: MealieMealPlanRule[] }>('/api/households/mealplans/rules?perPage=-1');
  return (page?.items ?? []).filter((r) => typeof r.day === 'string' && typeof r.entryType === 'string');
}

/**
 * Up to `count` different recipes in random order, from the categories
 * `filter` allows (by slug), for Suggest when no meal plan rule decides.
 */
export async function pickMealieRecipes(count: number, filter: { only: string[] } | { without: string[] } | null): Promise<MealieRecipeSummary[]> {
  const params = new URLSearchParams({ perPage: String(count), page: '1', orderBy: 'random', paginationSeed: randomUUID() });
  if (filter) {
    const slugs = ('only' in filter ? filter.only : filter.without).map((s) => JSON.stringify(s)).join(',');
    params.set('queryFilter', `recipeCategory.slug ${'only' in filter ? 'IN' : 'NOT IN'} [${slugs}]`);
  }
  const page = await mealieJson<{ items?: MealieRecipeSummary[] }>(`/api/recipes?${params}`);
  return (page?.items ?? []).filter((r) => typeof r.id === 'string' && !!r.id);
}

export async function deleteMealieEntry(id: number): Promise<void> {
  const res = await mealieFetch(`/api/households/mealplans/${id}`, { method: 'DELETE' });
  // Already gone counts as done: somebody removed it in Mealie first.
  if (!res.ok && res.status !== 404) throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
}

// ── Recipes ──

export interface MealieRecipePage {
  items: MealieRecipeSummary[];
  page: number;
  totalPages: number;
  total: number;
}

export type MealieRecipeFilter = 'all' | 'favorites' | 'recent';

/**
 * One page of Mealie's recipes for a picker: by name, the household's
 * favorites, or what was made most recently. Searched in Mealie on every
 * call; nothing is copied into Home Screens.
 */
export async function searchMealieRecipes(opts: {
  search?: string;
  filter?: MealieRecipeFilter;
  /** One of the household's Mealie categories, by slug. */
  category?: string;
  page?: number;
  perPage?: number;
}): Promise<MealieRecipePage> {
  const params = new URLSearchParams({
    page: String(Math.max(1, opts.page ?? 1)),
    perPage: String(Math.min(100, Math.max(1, opts.perPage ?? 30))),
  });
  const search = opts.search?.trim();
  if (search) params.set('search', search);
  if (opts.category) params.set('categories', opts.category);
  if (opts.filter === 'recent') {
    params.set('orderBy', 'lastMade');
    params.set('orderDirection', 'desc');
    // Mealie 3.29 ignores `IS NOT NULL` on lastMade and answers every recipe;
    // a date comparison is honoured and leaves only what was ever made.
    params.set('queryFilter', 'lastMade > 1970-01-01');
  } else if (!search) {
    params.set('orderBy', 'name');
    params.set('orderDirection', 'asc');
  }
  if (opts.filter === 'favorites') {
    const favorites = await mealieJson<{ ratings?: { recipeId: string; isFavorite?: boolean }[] }>('/api/users/self/favorites');
    const ids = (favorites?.ratings ?? []).filter((r) => r.isFavorite !== false).map((r) => r.recipeId);
    if (ids.length === 0) return { items: [], page: 1, totalPages: 0, total: 0 };
    params.set('queryFilter', `id IN [${ids.map((id) => JSON.stringify(id)).join(',')}]`);
  }
  const words = search ? searchWords(search) : [];
  const [page, allWords] = await Promise.all([
    mealieJson<{ items?: MealieRecipeSummary[]; page?: number; total_pages?: number; total?: number }>(`/api/recipes?${params.toString()}`),
    // Mealie's search matches any one word ("mac and cheese" finds 288
    // recipes, most of them only cheesy), so the first page leads with the
    // recipes whose name has every word in it.
    words.length > 1 && (opts.page ?? 1) === 1 && opts.filter !== 'favorites'
      ? mealieJson<{ items?: MealieRecipeSummary[] }>(`/api/recipes?${new URLSearchParams({
        page: '1',
        perPage: params.get('perPage')!,
        orderBy: 'name',
        orderDirection: 'asc',
        // LIKE is case-blind in Mealie on every database it runs on.
        queryFilter: words.map((w) => `name LIKE ${JSON.stringify(`%${w}%`)}`).join(' AND '),
      }).toString()}`).catch(() => null)
      : Promise.resolve(null),
  ]);
  const items = Array.isArray(page?.items) ? page.items : [];
  const first = Array.isArray(allWords?.items) ? allWords.items : [];
  // Recipes holding every word are the answer; the any-word list behind them
  // read as "288 recipes" for "mac and cheese". Only with none of those does
  // Mealie's own wider match stand in.
  if (first.length > 0) return { items: first, page: 1, totalPages: 1, total: first.length };
  return {
    items,
    page: page?.page ?? 1,
    totalPages: page?.total_pages ?? 0,
    total: page?.total ?? 0,
  };
}

/** Words worth requiring in a recipe name: three letters or more, without quotes or wildcards. */
export function searchWords(search: string): string[] {
  return [...new Set(search.toLowerCase().split(/\s+/).map((w) => w.replace(/["%_\\]/g, '')).filter((w) => w.length >= 3))].slice(0, 6);
}

export interface MealieCategory {
  name: string;
  slug: string;
}

/** The household's Mealie recipe categories, A to Z, for the Library's filters. */
export async function listMealieCategories(): Promise<MealieCategory[]> {
  const page = await mealieJson<{ items?: { name?: string; slug?: string }[] }>('/api/organizers/categories?perPage=-1&orderBy=name&orderDirection=asc');
  return (page?.items ?? [])
    .filter((c): c is MealieCategory => typeof c.name === 'string' && typeof c.slug === 'string' && !!c.slug)
    .map((c) => ({ name: c.name, slug: c.slug }));
}

/** A full recipe, as much of it as Home Screens reads. */
export interface MealieRecipe extends MealieRecipeSummary {
  recipeIngredient?: { title?: string | null; display?: string | null; note?: string | null; originalText?: string | null }[];
  recipeInstructions?: { title?: string | null; text?: string | null }[];
}

const recipeCache = createTTLCache<MealieRecipe>(10 * 60_000);

/** One recipe by its id, from a ten-minute cache: recipes change far less often than the plan. */
export async function getMealieRecipe(recipeId: string): Promise<MealieRecipe> {
  const cfg = await requireConfig();
  const key = `${connectionKey(cfg)}|${recipeId}`;
  const cached = recipeCache.get(key);
  if (cached) return cached;
  const recipe = await mealieJson<MealieRecipe>(`/api/recipes/${encodeURIComponent(recipeId)}`, undefined, cfg);
  recipeCache.set(key, recipe);
  return recipe;
}

/** The sizes Mealie keeps of every recipe photo. */
export type MealieImageSize = 'original' | 'min-original' | 'tiny-original';

export function fetchMealieImage(recipeId: string, size: MealieImageSize): Promise<Response> {
  return mealieFetch(`/api/media/recipes/${encodeURIComponent(recipeId)}/images/${size}.webp`, {
    headers: { Accept: 'image/webp,image/*' },
    timeout: 20_000,
  });
}
