import { createHash, randomUUID } from 'crypto';
import { getSecret } from './secrets';
import { createLastGoodCache, createTTLCache, fetchWithTimeout, type FetchRetryOptions } from './api-utils';
import type { MealieContext } from './mealie-map';
import { mealiePlanRevision } from './meals-hub-revision';

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
  /** How many times the recipe the meal makes: 2 is a double batch. Absent or 1 is once. */
  recipeScale?: number | null;
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
  /**
   * The batch size. Mealie's update replaces the whole entry and resets a
   * scale it is not sent to 1, so a write for a recipe always carries one.
   */
  recipeScale?: number;
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

export async function requireMealieConfig(): Promise<MealieConfig> {
  const cfg = await getMealieConfig();
  if (!cfg) throw new MealieError('not-set-up', 'Mealie is not connected');
  return cfg;
}

/** Keys caches by connection, so a new address or key never answers from the old one's copy. */
export function mealieConnectionKey(cfg: MealieConfig): string {
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
  const conn = cfg ?? await requireMealieConfig();
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
  if (!res.ok) {
    // Mealie answers even a missing page in JSON. A plain "not found" page
    // means the saved address is some other web server, which waiting will
    // not fix (a proxy's "bad gateway" while Mealie is down is still Mealie).
    if (res.status === 404 && !res.headers.get('content-type')?.includes('json')) {
      throw new MealieError('not-mealie', 'Something that is not Mealie answered at the address');
    }
    throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MealieError('not-mealie', 'Mealie answered with something that is not JSON');
  }
}

/**
 * The budget for a read a wall is waiting on (the recipe book's pages, its
 * chips, a recipe card, the hearts): two tries of 6 s with the half-second
 * pause between them, inside the 15 s a wall waits for the hub
 * (`DISPLAY_FETCH_TIMEOUT_MS`). The usual 10 s with two retries could run 30 s,
 * so a first try that stalled left the retry 5 s before the wall walked away
 * and the third try never started.
 */
export const MEALIE_WALL_READ = { timeout: 6_000, retries: 1 } as const satisfies FetchRetryOptions;

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
    userCache.set(mealieConnectionKey(cfg), user);
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

async function getMealieUser(cfg: MealieConfig): Promise<MealieUser> {
  const key = mealieConnectionKey(cfg);
  const cached = userCache.get(key);
  if (cached) return cached;
  const user = await mealieJson<MealieUser>('/api/users/self', undefined, cfg);
  userCache.set(key, user);
  return user;
}

/** Where a recipe's links point: Mealie's address and the group its pages live under. */
export async function getMealieContext(cfg?: MealieConfig): Promise<MealieContext> {
  const conn = cfg ?? await requireMealieConfig();
  const user = await getMealieUser(conn);
  return { baseUrl: conn.url, groupSlug: user.groupSlug };
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
const planCache = createLastGoodCache<MealiePlanRead>(PLAN_TTL_MS, PLAN_STALE_MS);

/** Entries in date order, and within a day in the order they were made, so "the first dinner" is stable. */
export function sortMealieEntries(entries: MealiePlanEntry[]): MealiePlanEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

async function loadPlan(cfg: MealieConfig, start: string, end: string): Promise<MealiePlanRead> {
  const [page, ctx] = await Promise.all([
    mealieJson<{ items?: MealiePlanEntry[] }>(
      `/api/households/mealplans?start_date=${start}&end_date=${end}&perPage=-1&orderBy=date&orderDirection=asc`,
      undefined,
      cfg,
    ),
    getMealieContext(cfg),
  ]);
  const entries = Array.isArray(page?.items) ? page.items : [];
  return { entries: sortMealieEntries(entries), fetchedAt: Date.now(), ...ctx };
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
    cfg = await requireMealieConfig();
  } catch (err) {
    return { status: 'failed', failure: err instanceof MealieError ? err.failure : 'upstream' };
  }
  const key = `${mealieConnectionKey(cfg)}|${start}|${end}`;
  try {
    return { status: 'ok', read: await planCache.read(key, () => loadPlan(cfg, start, end), { fresh }) };
  } catch (err) {
    const failure = err instanceof MealieError ? err.failure : 'upstream';
    const stale = planCache.getStale(key);
    return stale ? { status: 'stale', read: stale, failure } : { status: 'failed', failure };
  }
}

/**
 * Forget every cached plan read, after a save changed Mealie, and tell the
 * walls (the meals revision on their heartbeat) to read the plan again.
 */
export function clearMealiePlanCache(): void {
  planCache.clear();
  mealiePlanRevision.bump();
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

/** Which recipes a picker lists: all of them, the household's favorites, or what was made most recently. */
const MEALIE_RECIPE_FILTERS = ['all', 'favorites', 'recent'] as const;

export type MealieRecipeFilter = typeof MEALIE_RECIPE_FILTERS[number];

export function isMealieRecipeFilter(value: string): value is MealieRecipeFilter {
  return (MEALIE_RECIPE_FILTERS as readonly string[]).includes(value);
}

/**
 * With fewer letters than this, a search reads recipe names only, by the
 * start of a word. Mealie's own search also reads every ingredient line, and
 * one or two letters are in nearly all of them: on a Pi with a few thousand
 * recipes, "b" held Mealie's database for minutes, everything else queued
 * behind it, and it still failed (SQLite takes at most 32,766 values in one
 * query, and Mealie passed it every matching line).
 */
const MEALIE_SHORT_SEARCH_LETTERS = 3;

/**
 * How many searches one hub has at Mealie at a time. Mealie keeps running a
 * search the hub stopped waiting for, so a picker typed into slowly would
 * otherwise pile one search per pause onto a Mealie that is already slow.
 */
const MEALIE_SEARCHES_AT_ONCE = 2;

let searchesOut = 0;
const searchLine: Array<() => void> = [];

function droppedSearch(): MealieError {
  return new MealieError('unreachable', 'The search was dropped before it reached Mealie');
}

/**
 * Wait for a turn to search Mealie. Resolves with the function that hands the
 * turn on. A caller that gives up while waiting leaves the line, so its search
 * never goes out.
 */
function takeSearchTurn(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(droppedSearch());
  let handedOn = false;
  const handOn = () => {
    if (handedOn) return;
    handedOn = true;
    const next = searchLine.shift();
    // The turn passes straight to the next in line, so a newcomer cannot slip in between.
    if (next) next();
    else searchesOut--;
  };
  if (searchesOut < MEALIE_SEARCHES_AT_ONCE) {
    searchesOut++;
    return Promise.resolve(handOn);
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener('abort', leave);
      resolve(handOn);
    };
    const leave = () => {
      const at = searchLine.indexOf(start);
      if (at >= 0) searchLine.splice(at, 1);
      reject(droppedSearch());
    };
    searchLine.push(start);
    signal?.addEventListener('abort', leave, { once: true });
  });
}

/** One search call to Mealie, in turn, never retried: Mealie is still running the search a retry would send again. */
async function mealieSearchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const handOn = await takeSearchTurn(signal);
  try {
    return await mealieJson<T>(path, { retries: 0, signal });
  } finally {
    handOn();
  }
}

/** Recipe names with a word starting with `letters`, as a Mealie query filter. LIKE is case-blind in Mealie on every database it runs on. */
function nameWordStartFilter(letters: string): string {
  return `name LIKE ${JSON.stringify(`${letters}%`)} OR name LIKE ${JSON.stringify(`% ${letters}%`)}`;
}

/** How many words from another typed word a typed word may sit when the name holds it only as the start of a longer word. */
const PART_WORD_REACH = 3;

/**
 * Whether a recipe name holds every typed word closely enough to be what was
 * meant. A word the name holds whole ("rice") may be anywhere in it, in any
 * order. A word that only starts a longer one ("mac" in "Macaroni") must sit
 * within three words of another typed word: a word's start alone cannot tell
 * "Macaroni and Cheese" from "Cheese and Onion Bread (bread Machine)", but how
 * far it sits from "cheese" can. `words` are lower case.
 */
export function nameHoldsWords(name: string, words: readonly string[]): boolean {
  const tokens = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const found = words.map((w) => tokens.flatMap((t, at) => (t.startsWith(w) ? [{ at, whole: t === w }] : [])));
  return found.every((hits, i) => hits.some((hit) => hit.whole || found.some((others, j) => (
    j !== i && others.some((other) => other.at !== hit.at && Math.abs(other.at - hit.at) <= PART_WORD_REACH)
  ))));
}

type MealieRecipeListing = { items?: MealieRecipeSummary[]; page?: number; total_pages?: number; total?: number };

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
  /** One of the household's Mealie cookbooks, by slug. */
  cookbook?: string;
  page?: number;
  perPage?: number;
  /** The caller giving up: a search still waiting for its turn never goes out, and one at Mealie is no longer waited for. */
  signal?: AbortSignal;
}): Promise<MealieRecipePage> {
  const pageNumber = Math.max(1, opts.page ?? 1);
  const params = new URLSearchParams({
    page: String(pageNumber),
    perPage: String(Math.min(100, Math.max(1, opts.perPage ?? 30))),
  });
  const typed = opts.search?.trim() ?? '';
  const short = Array.from(typed).length < MEALIE_SHORT_SEARCH_LETTERS;
  // Mealie's own search, for three letters or more.
  const search = short ? '' : typed;
  // Names only, for one or two letters.
  const nameStart = short ? typed.replace(/["%_\\]/g, '') : '';
  const filters: string[] = [];
  if (search) params.set('search', search);
  if (opts.category) params.set('categories', opts.category);
  if (opts.cookbook) params.set('cookbook', opts.cookbook);
  if (opts.filter === 'recent') {
    params.set('orderBy', 'lastMade');
    params.set('orderDirection', 'desc');
    // Mealie 3.29 ignores `IS NOT NULL` on lastMade and answers every recipe;
    // a date comparison is honoured and leaves only what was ever made.
    filters.push('lastMade > 1970-01-01');
  } else if (!search) {
    params.set('orderBy', 'name');
    params.set('orderDirection', 'asc');
  }
  if (opts.filter === 'favorites') {
    const ids = [...await getMealieFavoriteIds()];
    if (ids.length === 0) return { items: [], page: 1, totalPages: 0, total: 0 };
    filters.push(`id IN [${ids.map((id) => JSON.stringify(id)).join(',')}]`);
  }
  if (nameStart) filters.push(nameWordStartFilter(nameStart));
  if (filters.length > 0) params.set('queryFilter', filters.length === 1 ? filters[0] : filters.map((f) => `(${f})`).join(' AND '));

  const words = search ? searchWords(search) : [];
  if (words.length > 1 && pageNumber === 1 && opts.filter !== 'favorites') {
    // Mealie's search matches any one word ("mac and cheese" finds 288
    // recipes, most of them only cheesy), so the recipes whose name holds
    // every word are the answer when there are any. Asked first, on its own:
    // the wider search costs Mealie far more and was thrown away whenever
    // this found something. Mealie narrows to names where each word starts a
    // word, and `nameHoldsWords` drops the ones a part word only lands in by
    // chance ("Machine" for "mac").
    const allWords = await mealieSearchJson<MealieRecipeListing>(`/api/recipes?${new URLSearchParams({
      page: '1',
      perPage: '100',
      orderBy: 'name',
      orderDirection: 'asc',
      queryFilter: words.map((w) => `(${nameWordStartFilter(w)})`).join(' AND '),
    }).toString()}`, opts.signal).catch((err: unknown) => {
      // A dropped search stops here; a failed name lookup leaves it to the wider search.
      if (opts.signal?.aborted) throw err;
      return null;
    });
    const first = (Array.isArray(allWords?.items) ? allWords.items : [])
      .filter((r) => typeof r.name === 'string' && nameHoldsWords(r.name, words))
      .slice(0, Number(params.get('perPage')));
    if (first.length > 0) return { items: first, page: 1, totalPages: 1, total: first.length };
  }
  const path = `/api/recipes?${params.toString()}`;
  // Plain listings (by name, favorites, recently made) are cheap for Mealie and keep a retry.
  const page = search || nameStart
    ? await mealieSearchJson<MealieRecipeListing>(path, opts.signal)
    : await mealieJson<MealieRecipeListing>(path, { ...MEALIE_WALL_READ, signal: opts.signal });
  return {
    items: Array.isArray(page?.items) ? page.items : [],
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
  const page = await mealieJson<{ items?: { name?: string; slug?: string }[] }>('/api/organizers/categories?perPage=-1&orderBy=name&orderDirection=asc', MEALIE_WALL_READ);
  return (page?.items ?? [])
    .filter((c): c is MealieCategory => typeof c.name === 'string' && typeof c.slug === 'string' && !!c.slug)
    .map((c) => ({ name: c.name, slug: c.slug }));
}

/** A cookbook: a saved set of the household's recipes ("Weeknight dinners"). */
export interface MealieCookbook {
  name: string;
  slug: string;
}

/** The household's Mealie cookbooks, in the household's own order, for the Library's and the pickers' filters. */
export async function listMealieCookbooks(): Promise<MealieCookbook[]> {
  const page = await mealieJson<{ items?: { name?: string; slug?: string; position?: number }[] }>('/api/households/cookbooks?perPage=-1', MEALIE_WALL_READ);
  return (page?.items ?? [])
    .filter((c): c is MealieCookbook & { position?: number } => typeof c.name === 'string' && typeof c.slug === 'string' && !!c.slug)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ name: c.name, slug: c.slug }));
}

/** An ingredient's unit, the parts of it a line is written with. */
export interface MealieIngredientUnit {
  name?: string | null;
  pluralName?: string | null;
  abbreviation?: string | null;
  pluralAbbreviation?: string | null;
  useAbbreviation?: boolean | null;
  /** Amounts in this unit read as fractions ("1 ¹/₂ cups"), otherwise as decimals. */
  fraction?: boolean | null;
}

/** One ingredient line of a recipe. */
export interface MealieRecipeIngredient {
  title?: string | null;
  display?: string | null;
  note?: string | null;
  originalText?: string | null;
  quantity?: number | null;
  unit?: MealieIngredientUnit | null;
  food?: { name?: string | null; pluralName?: string | null } | null;
}

/** A full recipe, as much of it as Home Screens reads. */
export interface MealieRecipe extends MealieRecipeSummary {
  recipeIngredient?: MealieRecipeIngredient[];
  recipeInstructions?: { title?: string | null; text?: string | null }[];
}

/**
 * Half a minute: a recipe fixed in Mealie (a typo, an amount) and then sent
 * to the wall to cook from has to be the fixed one. Ten minutes here, on top
 * of the wall's own copy, showed the old lines for up to twenty. Shorter than
 * the wall's minute (`MEALIE_RECIPE_TTL_MS`), so each time an open card reads
 * again it gets Mealie's recipe, not this copy from the last time: at a
 * minute each, a re-read landing just inside this copy's minute kept the old
 * lines for two. A read is one small call, made only while a recipe is open.
 */
const recipeCache = createTTLCache<MealieRecipe>(30_000);

/** One recipe by its id, from a half-minute cache shared by every wall. */
export async function getMealieRecipe(recipeId: string): Promise<MealieRecipe> {
  const cfg = await requireMealieConfig();
  const key = `${mealieConnectionKey(cfg)}|${recipeId}`;
  const cached = recipeCache.get(key);
  if (cached) return cached;
  const recipe = await mealieJson<MealieRecipe>(`/api/recipes/${encodeURIComponent(recipeId)}`, MEALIE_WALL_READ, cfg);
  recipeCache.set(key, recipe);
  return recipe;
}

// ── Favorites ──

const favoritesCache = createTTLCache<ReadonlySet<string>>(30_000);

/**
 * The recipes hearted by the person whose key the hub holds, by recipe id.
 * Mealie keeps favorites per person; this is the list every Favorites chip
 * reads and every heart on a Home Screens surface writes. Kept half a minute
 * on the hub, so one page of a list and the next agree; a heart made here
 * changes it at once, one made in Mealie's own pages shows within the half
 * minute.
 */
export async function getMealieFavoriteIds(cfg?: MealieConfig): Promise<ReadonlySet<string>> {
  const conn = cfg ?? await requireMealieConfig();
  const key = mealieConnectionKey(conn);
  const cached = favoritesCache.get(key);
  if (cached) return cached;
  const answer = await mealieJson<{ ratings?: { recipeId?: unknown; isFavorite?: boolean }[] }>('/api/users/self/favorites', MEALIE_WALL_READ, conn);
  const ids = new Set<string>();
  for (const r of answer?.ratings ?? []) {
    if (typeof r.recipeId === 'string' && r.isFavorite !== false) ids.add(r.recipeId);
  }
  favoritesCache.set(key, ids);
  return ids;
}

/**
 * Heart a recipe in Mealie, or take the heart off, for the person whose key
 * the hub holds. Mealie (2.0 on) takes the recipe's id where its path says
 * slug, and answers the same however many times it is asked, so a heart
 * sent twice is still one heart.
 */
export async function setMealieFavorite(recipeId: string, favorite: boolean): Promise<void> {
  const cfg = await requireMealieConfig();
  const user = await getMealieUser(cfg);
  const res = await mealieFetch(
    `/api/users/${encodeURIComponent(user.id)}/favorites/${encodeURIComponent(recipeId)}`,
    { method: favorite ? 'POST' : 'DELETE' },
    cfg,
  );
  if (!res.ok) throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
  const key = mealieConnectionKey(cfg);
  const cached = favoritesCache.get(key);
  if (cached) {
    const next = new Set(cached);
    if (favorite) next.add(recipeId);
    else next.delete(recipeId);
    favoritesCache.set(key, next);
  }
}

// ── Has the book changed ──

/**
 * Half a minute, shared by every wall: a wall showing the recipe book asks
 * once a minute, so a change in Mealie reaches it within about a minute and a
 * half, and Mealie answers this a couple of times a minute however many walls
 * there are.
 */
const REVISION_TTL_MS = 30_000;
const revisionCache = createLastGoodCache<string>(REVISION_TTL_MS, REVISION_TTL_MS);

/**
 * A short string that changes whenever what a recipe book shows could have:
 * a recipe added, deleted, renamed, edited or filed under another category
 * (how many there are and when the newest change was), a heart (the
 * favorites), or a category or cookbook added, renamed or removed (the
 * chips). A wall re-reads its book only when this moves, so an idle book costs
 * Mealie one small listing, not a page of recipes. Mealie answers the newest
 * change by itself in about 0.2 s with 7,700 recipes on a Pi.
 */
export async function getMealieRecipesRevision(): Promise<string> {
  const cfg = await requireMealieConfig();
  return revisionCache.read(mealieConnectionKey(cfg), async () => {
    const [newest, favorites, categories, cookbooks] = await Promise.all([
      mealieJson<MealieRecipeListing>('/api/recipes?page=1&perPage=1&orderBy=updatedAt&orderDirection=desc', MEALIE_WALL_READ, cfg),
      getMealieFavoriteIds(cfg),
      listMealieCategories(),
      listMealieCookbooks(),
    ]);
    const latest = newest?.items?.[0];
    const parts = [
      String(newest?.total ?? 0),
      latest?.updatedAt ?? latest?.dateUpdated ?? '',
      [...favorites].sort().join(','),
      categories.map((c) => `${c.slug}=${c.name}`).join(','),
      cookbooks.map((c) => `${c.slug}=${c.name}`).join(','),
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  });
}

/** Forget the revisions read; for tests. */
export function clearMealieRecipesRevision(): void {
  revisionCache.clear();
}

/** The sizes Mealie keeps of every recipe photo. */
export type MealieImageSize = 'original' | 'min-original' | 'tiny-original';

export function fetchMealieImage(recipeId: string, size: MealieImageSize): Promise<Response> {
  return mealieFetch(`/api/media/recipes/${encodeURIComponent(recipeId)}/images/${size}.webp`, {
    headers: { Accept: 'image/webp,image/*' },
    timeout: 20_000,
  });
}
