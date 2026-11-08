import type { SavedMeal, PlannedMeal, MealPlanSource, MealSettings, MealSlotType, TimeFormat } from '@/types/config';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { setMealPlanSource } from '@/lib/meal-settings';
import { mealWriteBody, type MealDataWrite } from '@/lib/meal-write';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { displayCache } from '@/lib/display-cache';
import { HubUnreachableError, readJson, refusalMessage } from '@/lib/hub-request';
import { mealieProblem, mergeMealSources, planCellChanges, rangeCovers, unionRange, type MealieProblem, type MealieWireBlock } from '@/lib/meal-sources';
import type { MealieCategory, MealieCookbook, MealieFailure, MealieRecipeFilter } from '@/lib/mealie';
import { mealieRecipeUrl, type MealieRecipeDetail } from '@/lib/mealie-map';
import type { MealieShoppingAnswer } from '@/lib/mealie-shopping';
import { normalizeGroceryChecked, withGroceryWeek, type GroceryChecked, type GroceryCheckDirection } from '@/lib/grocery-checks';

/**
 * The transport contract of `/api/meals/data`, shared by the phone's Meals
 * tab and the editor's meal-planner modal. The two surfaces keep their own
 * state and markup; what they must agree on is what a loaded copy is, how a
 * save quotes the revision it was built from, and what happens when the hub
 * says somebody else saved first.
 */

/** Where a save goes while the plan lives in Mealie. */
const MEALIE_PLAN_URL = '/api/mealie/plan';

/**
 * `editorFetch` on the editor and phone; the wall never writes meals. It bounds
 * every request and rejects with `HubUnreachableError` when the hub cannot be
 * reached, which the calls here pass on untouched.
 */
export type MealFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What one GET (or one accepted save) answered with. */
export interface MealSnapshot {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  /** Each week's grocery ticks (see `grocery-checks.ts`). */
  groceryChecked: GroceryChecked;
  settings: MealSettings;
  globalTimeFormat: TimeFormat;
  /** Quoted back on every save of `savedMeals` or `plan`. */
  revision: string;
  /**
   * Where `plan` and `savedMeals` came from. In Mealie mode they are Mealie's
   * plan and the recipes it uses (see `mergeMealSources`), and saves go to
   * Mealie; the plan kept in `meals.json` is not on this copy at all.
   */
  source: 'local' | 'mealie';
  /** Mealie's block as the hub sent it, in Mealie mode: status, range, address. */
  mealie: MealieWireBlock | null;
  /** Mealie's address and key are saved, so the plan can be switched to it. */
  mealieConnected: boolean;
}

/**
 * One edit, as a function of the copy it is applied to.
 *
 * A save may have to run this twice: once against the copy the surface has,
 * and again against the hub's newer copy when the first attempt comes back as
 * a conflict. Written this way, a slot assignment made from an hours-old plan
 * lands on top of the other phone's additions instead of replacing them. Hand
 * back the array it was given (identity) for a half that did not change.
 */
export type MealEdit = (current: Pick<MealSnapshot, 'savedMeals' | 'plan'>) => MealDataWrite;

export type MealClientFailure = 'load' | 'save' | 'conflict';

export class MealClientError extends Error {
  constructor(
    readonly kind: MealClientFailure,
    message: string,
    /** For a Mealie refusal: why, in the words a surface shows (not connected, token refused, unreachable). */
    readonly problem?: MealieProblem,
  ) {
    super(message);
    this.name = 'MealClientError';
  }
}

/** How many times a save re-applies its edit to the hub's newer copy before giving up. */
export const MAX_CONFLICT_RETRIES = 3;

const TTL_MS = FETCH_KEY_REGISTRY['meal-planner'].ttlMs;

/** An answer of `/api/meals/data` as a surface that never saves draws it: a snapshot without the revision. */
export type MealAnswer = Omit<MealSnapshot, 'revision'>;

/**
 * Read an answer of `/api/meals/data` the way every surface reads it: the
 * settings normalised, the plan from wherever it lives (`mergeMealSources`),
 * the grocery ticks cleaned up. The wall and the calendar read through this
 * too, so they never draw settings the phone and the editor would have
 * corrected. Null for a body that is not one.
 */
export function readMealAnswer(json: unknown, fallbackTimeFormat: TimeFormat): MealAnswer | null {
  const d = json as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.savedMeals) || !Array.isArray(d.plan)) return null;
  const settings = normalizeMealSettings(d.settings);
  const merged = mergeMealSources(
    { savedMeals: d.savedMeals as SavedMeal[], plan: d.plan as PlannedMeal[], mealie: (d.mealie ?? null) as MealieWireBlock | null },
    settings,
  );
  return {
    savedMeals: merged.savedMeals,
    plan: merged.plan,
    groceryChecked: normalizeGroceryChecked(d.groceryChecked),
    settings,
    globalTimeFormat: d.globalTimeFormat === '24h' || d.globalTimeFormat === '12h' ? d.globalTimeFormat : fallbackTimeFormat,
    source: merged.source,
    mealie: merged.mealie,
    mealieConnected: d.mealieConnected === true,
  };
}

function asSnapshot(json: unknown, fallbackTimeFormat: TimeFormat): MealSnapshot | null {
  const answer = readMealAnswer(json, fallbackTimeFormat);
  const revision = (json as { revision?: unknown } | null)?.revision;
  if (!answer || typeof revision !== 'string' || !revision) return null;
  return { ...answer, revision };
}

/**
 * A refusal from one of the routes that talk to Mealie. When Mealie was the
 * problem the route says how (`failure`), and the error carries it in the
 * words a surface shows: a refused token is not Mealie being down.
 */
function mealieRefusal(kind: MealClientFailure, json: unknown, fallback: string): MealClientError {
  const failure = (json as { failure?: MealieFailure } | null)?.failure;
  return new MealClientError(kind, refusalMessage(json, fallback), failure ? mealieProblem(failure) : undefined);
}

/** Why a call about Mealie failed, as a surface says it: Mealie's reasons, or this device not reaching the hub. */
export type MealieClientProblem = MealieProblem | 'connection';

export function mealieClientProblem(err: unknown): MealieClientProblem {
  if (err instanceof HubUnreachableError) return 'connection';
  return err instanceof MealClientError && err.problem ? err.problem : mealieProblem(undefined);
}

/**
 * Load the stored meals. Rejects on any non-success status or an unusable
 * body: a surface that treated an error body as an empty library went on to
 * replace the real one with the first meal it added.
 */
export async function loadMeals(fetcher: MealFetch): Promise<MealSnapshot> {
  const res = await fetcher(mealsDataUrl());
  const json = await readJson(res);
  const snapshot = res.ok ? asSnapshot(json, '12h') : null;
  if (!snapshot) throw new MealClientError('load', refusalMessage(json, 'The meals could not be loaded.'));
  return snapshot;
}

/** The stored meal settings, read fresh, and whether Mealie's address and key are saved. */
export async function loadMealSettings(fetcher: MealFetch): Promise<{ settings: MealSettings; mealieConnected: boolean }> {
  const res = await fetcher(mealsDataUrl());
  const json = await readJson(res);
  if (!res.ok || !json || typeof json !== 'object') throw new MealClientError('load', refusalMessage(json, 'The meals could not be loaded.'));
  const d = json as { settings?: unknown; mealieConnected?: unknown };
  return { settings: normalizeMealSettings(d.settings), mealieConnected: d.mealieConnected === true };
}

/**
 * Save the shared meal settings and nothing else. The meals and the plan are
 * left out of the request, so a meal another surface saved meanwhile is kept.
 * Answers with the settings as the hub now keeps them.
 */
export async function saveMealSettings(fetcher: MealFetch, settings: MealSettings): Promise<MealSettings> {
  const res = await fetcher(mealsDataUrl(), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  const json = await readJson(res);
  if (!res.ok) throw new MealClientError('save', refusalMessage(json, 'The meals could not be saved.'));
  // Every meal view on the canvas reads the new settings.
  displayCache.invalidate(mealsDataUrl());
  return normalizeMealSettings((json as { settings?: unknown } | null)?.settings ?? settings);
}

/** Where the meal plan lives as the hub has it now: Mealie, or unset for Home Screens. */
export async function loadMealPlanSource(fetcher: MealFetch): Promise<MealPlanSource | undefined> {
  return (await loadMealSettings(fetcher)).settings.planSource;
}

/**
 * Move the meal plan to `source` (unset for Home Screens) from outside the
 * Meals settings pages, which hold a copy of the settings of their own. The
 * settings are read fresh and changed by the rule those pages use, so the
 * plan's home is all that changes.
 */
export async function saveMealPlanSource(fetcher: MealFetch, source: MealPlanSource | undefined): Promise<void> {
  const { settings: current } = await loadMealSettings(fetcher);
  const next = setMealPlanSource(current, source);
  if (next === current) return;
  await saveMealSettings(fetcher, next);
}

/** One week's grocery ticks as the hub has them after a tick was saved. */
export interface GroceryWeekChecks {
  /** The week's key: the date it starts on. */
  week: string;
  checked: string[];
}

/**
 * Tick or untick one item on one week's grocery list (`week` is that week's
 * key). Ticks have their own route rather than a `PUT` of the whole set, so a
 * tick never races a plan edit, and two phones ticking the same list each
 * keep the other's. Rejects on any refusal; not reaching the hub rejects
 * with `HubUnreachableError`, and an expired session comes through as it is.
 */
export async function saveGroceryCheck(
  fetcher: MealFetch,
  week: string,
  item: string,
  direction: GroceryCheckDirection,
): Promise<GroceryWeekChecks> {
  const res = await fetcher('/api/meals/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item, direction, week }),
  });
  const json = await readJson(res);
  const d = json as { week?: unknown; groceryChecked?: unknown } | null;
  if (!res.ok || typeof d?.week !== 'string' || !Array.isArray(d.groceryChecked)) {
    throw new MealClientError('save', refusalMessage(json, 'The grocery list could not be saved.'));
  }
  return { week: d.week, checked: d.groceryChecked.filter((name): name is string => typeof name === 'string') };
}

/** Only the halves the edit actually changed, or null when it changed nothing. */
function changedHalves(changes: MealDataWrite, current: Pick<MealSnapshot, 'savedMeals' | 'plan'>): MealDataWrite | null {
  const out: MealDataWrite = {};
  if (changes.savedMeals !== undefined && changes.savedMeals !== current.savedMeals) out.savedMeals = changes.savedMeals;
  if (changes.plan !== undefined && changes.plan !== current.plan) out.plan = changes.plan;
  return out.savedMeals || out.plan ? out : null;
}

/**
 * Apply one edit to `base` and save it, quoting `base.revision`.
 *
 * A conflict answer carries the hub's current copy; the edit is re-applied to
 * that and sent again, up to `MAX_CONFLICT_RETRIES` times. The accepted
 * response is the next snapshot, and it is handed to the display cache so a
 * canvas preview showing the same URL adopts it without a fetch. Not reaching
 * the hub rejects with `HubUnreachableError`, and an expired session comes
 * through as it is.
 */
export async function saveMealEdit(fetcher: MealFetch, base: MealSnapshot, edit: MealEdit, mealieRange?: MealieRange): Promise<MealSnapshot> {
  if (base.source === 'mealie') return saveMealieEdit(fetcher, base, edit, mealieRange);
  let current = base;
  for (let attempt = 0; ; attempt++) {
    const changes = changedHalves(edit(current), current);
    if (!changes) return current;
    const res = await fetcher(mealsDataUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mealWriteBody(changes), revision: current.revision }),
    });
    const json = await readJson(res);
    if (res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision') {
      const theirs = asSnapshot(json, current.globalTimeFormat);
      if (theirs && attempt < MAX_CONFLICT_RETRIES) {
        current = theirs;
        continue;
      }
      throw new MealClientError('conflict', refusalMessage(json, 'Somebody else changed the meals. Try again.'));
    }
    const saved = res.ok ? asSnapshot(json, current.globalTimeFormat) : null;
    if (!saved) throw new MealClientError('save', refusalMessage(json, 'The meals could not be saved.'));
    displayCache.replace(mealsDataUrl(), saved, TTL_MS);
    return saved;
  }
}

/** A meal Mealie filled for Suggest, and the entry it became. */
export interface MealieSuggestedEntry {
  date: string;
  slot: MealSlotType;
  sourceId: string;
}

/**
 * Take back what Suggest added: each meal it filled is cleared, as long as
 * it still holds only the dish Mealie picked (one changed since is left be).
 */
export function withoutSuggested(plan: PlannedMeal[], entries: readonly MealieSuggestedEntry[]): PlannedMeal[] {
  const added = new Set(entries.map((e) => `${e.date}|${e.slot}|${e.sourceId}`));
  const next = plan.filter((p) => !(p.sourceId && !p.courses?.length && added.has(`${p.date}|${p.slot}|${p.sourceId}`)));
  return next.length === plan.length ? plan : next;
}

export interface MealieRange {
  start: string;
  end: string;
}

/**
 * Mealie's plan for `range` from the hub, put in place of the copy's plan: the
 * days a surface pages to beyond the weeks every answer carries.
 *
 * Only a fresh answer from Mealie takes the copy's place. While Mealie is not
 * answering, the hub sends an empty plan for days it has no copy of, or an
 * older copy, and either would replace every week the surface already shows.
 */
export async function loadMealieRange(fetcher: MealFetch, base: MealSnapshot, range: MealieRange): Promise<MealSnapshot> {
  const res = await fetcher(`${MEALIE_PLAN_URL}?start=${range.start}&end=${range.end}`);
  const json = await readJson(res);
  const block = (json as { mealie?: MealieWireBlock } | null)?.mealie;
  if (!res.ok || !block || !Array.isArray(block.plan)) {
    throw mealieRefusal('load', json, 'Those weeks could not be loaded from Mealie.');
  }
  if (block.status !== 'ok') throw new MealClientError('load', 'Mealie is not answering.', mealieProblem(block.failure));
  return { ...base, plan: block.plan, savedMeals: block.meals, mealie: block };
}

/**
 * The Mealie-mode half of `saveMealEdit`: the same edit, written to Mealie.
 *
 * Only the meals the edit changed are sent, each with the Mealie entries it
 * held in this copy. Somebody changing one of them in Mealie meanwhile comes
 * back as the same 409 a local save gets, carrying Mealie's current plan, and
 * the edit is re-applied to that. Recipes cannot be changed from here: they
 * live in Mealie.
 */
async function saveMealieEdit(fetcher: MealFetch, base: MealSnapshot, edit: MealEdit, range?: MealieRange): Promise<MealSnapshot> {
  let current = base;
  for (let attempt = 0; ; attempt++) {
    const changes = changedHalves(edit(current), current);
    if (!changes) return current;
    if (changes.savedMeals) throw new MealClientError('save', 'Recipes live in Mealie. Change them there.');
    const cells = planCellChanges(current.plan, changes.plan!);
    if (cells.length === 0) return current;
    const res = await fetcher(MEALIE_PLAN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(range ? { cells, range } : { cells }),
    });
    const json = await readJson(res);
    if (res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision') {
      const theirs = asSnapshot(json, current.globalTimeFormat);
      if (theirs && attempt < MAX_CONFLICT_RETRIES) {
        current = theirs;
        continue;
      }
      throw mealieRefusal('conflict', json, 'Somebody changed these meals in Mealie. Try again.');
    }
    const saved = res.ok ? asSnapshot(json, current.globalTimeFormat) : null;
    if (!saved) throw mealieRefusal('save', json, 'The meals could not be saved to Mealie.');
    displayCache.replace(mealsDataUrl(), saved, TTL_MS);
    return saved;
  }
}

/**
 * One surface's copy of the meals and the saves made from it, in order.
 *
 * Two taps in a row must not race each other: sent together they would quote
 * the same revision and the second would always conflict. Saves queue, each
 * starting from the snapshot the previous one was answered with. `idle` tells
 * a surface whether the snapshot it just received is the last word or an
 * older save's, so it can keep its optimistic state until the queue drains.
 *
 * Grocery ticks go through the same queue. Sent around it, two quick ticks
 * could be answered out of order and leave the older answer on screen, a
 * reload started before a tick could put the old ticks back, and a save that
 * changed nothing handed back a copy without them.
 *
 * A save made before the first load has answered waits for it: a tap on a
 * slow hub must not be refused for having beaten the first GET, and the copy
 * that GET delivers is the right base for it. A later reload is not waited
 * for, and one answered after a save is not adopted over the save's answer.
 *
 * When Mealie refuses a save, a Suggest or a page of its plan, the session
 * asks the hub for the meals again on its own and hands the copy to
 * `onRecheck`. A refusal is often Mealie going away, and the copy that says
 * so pauses planning, where without it the next tap would fail too.
 */
export class MealSession {
  private snapshot: MealSnapshot | null = null;
  private loading: Promise<MealSnapshot> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  /** Saves and ticks answered so far; a load that started before one is older than it. */
  private answered = 0;

  /**
   * The days of Mealie's plan this surface has in view, once it paged past
   * the weeks every answer carries; saves and reloads keep them.
   */
  private mealieRange: MealieRange | undefined;

  constructor(
    private readonly fetcher: MealFetch,
    /** A copy the session asked for on its own, once nothing sent from here is still out. */
    private readonly onRecheck?: (snapshot: MealSnapshot) => void,
  ) {}

  /** The last copy the hub answered with, or null before the first load. */
  get current(): MealSnapshot | null {
    return this.snapshot;
  }

  get idle(): boolean {
    return this.pending === 0;
  }

  async load(): Promise<MealSnapshot> {
    const range = this.mealieRange;
    const attempt = loadMeals(this.fetcher).then((loaded) =>
      // A surface that paged further than the shared weeks keeps them, while
      // Mealie is answering (see `loadMealieRange`).
      loaded.source === 'mealie' && loaded.mealie?.status === 'ok' && range && !rangeCovers(loaded.mealie.range, range)
        ? loadMealieRange(this.fetcher, loaded, unionRange(loaded.mealie.range, range)).catch(() => loaded)
        : loaded);
    this.loading = attempt;
    const answeredBefore = this.answered;
    try {
      const loaded = await attempt;
      // A save or tick answered since this load started is newer than what it
      // delivers, whether or not that save is still counted as pending.
      if (this.answered === answeredBefore) this.snapshot = loaded;
      return this.snapshot ?? loaded;
    } finally {
      if (this.loading === attempt) this.loading = null;
    }
  }

  save(edit: MealEdit): Promise<MealSnapshot> {
    return this.enqueue((base) => saveMealEdit(this.fetcher, base, edit, this.mealieRange));
  }

  /**
   * Fill the empty meals among `cells` with Mealie's own picks (its meal plan
   * rules decide). Meals already planned are left alone. Answered with the
   * new copy and how many Mealie filled or had nothing for.
   */
  suggestFromMealie(cells: { date: string; slot: MealSlotType }[]): Promise<{ snapshot: MealSnapshot; created: number; skipped: number; entries: MealieSuggestedEntry[] }> {
    let counts: { created: number; skipped: number; entries: MealieSuggestedEntry[] } = { created: 0, skipped: 0, entries: [] };
    return this.enqueue(async (base) => {
      const res = await this.fetcher(`${MEALIE_PLAN_URL}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.mealieRange ? { cells, range: this.mealieRange } : { cells }),
      });
      const json = await readJson(res);
      const saved = res.ok ? asSnapshot(json, base.globalTimeFormat) : null;
      if (!saved) throw mealieRefusal('save', json, "We couldn't reach Mealie.");
      const suggested = (json as { suggested?: { created?: number; skipped?: number; entries?: MealieSuggestedEntry[] } }).suggested;
      counts = { created: suggested?.created ?? 0, skipped: suggested?.skipped ?? 0, entries: Array.isArray(suggested?.entries) ? suggested.entries : [] };
      displayCache.replace(mealsDataUrl(), saved, TTL_MS);
      return saved;
    }).then((snapshot) => ({ snapshot, ...counts }));
  }

  /**
   * Bring Mealie's plan for `range` into this copy, for a surface paging to a
   * week beyond the ones every answer carries. A no-op outside Mealie mode or
   * when the copy already holds those days. Queued like a save, so it never
   * lands on top of a newer answer.
   */
  showMealieRange(range: MealieRange): Promise<MealSnapshot> {
    return this.enqueue(async (base) => {
      if (base.source !== 'mealie' || rangeCovers(base.mealie?.range, range)) return base;
      const wanted = unionRange(base.mealie?.range ?? range, range);
      const next = await loadMealieRange(this.fetcher, base, wanted);
      this.mealieRange = wanted;
      return next;
    });
  }

  /**
   * Tick or untick one item on one week's grocery list (`week` is that week's
   * key). Answered with this session's copy, that week's ticks replaced by
   * what the hub now has.
   */
  tick(week: string, item: string, direction: GroceryCheckDirection): Promise<MealSnapshot> {
    return this.enqueue(async (base) => {
      const answer = await saveGroceryCheck(this.fetcher, week, item, direction);
      // The copy as it is now, not the one the tick was sent from: a reload
      // adopted while the tick was out is newer than that.
      const latest = this.snapshot ?? base;
      return { ...latest, groceryChecked: withGroceryWeek(latest.groceryChecked, answer.week, answer.checked) };
    });
  }

  private enqueue(work: (base: MealSnapshot) => Promise<MealSnapshot>): Promise<MealSnapshot> {
    this.pending += 1;
    const run = this.tail.then(async () => {
      // Only the first load is worth waiting for: a later reload delivers
      // nothing newer than the save's own answer.
      if (!this.snapshot && this.loading) await this.loading.catch(() => undefined);
      if (!this.snapshot) throw new MealClientError('save', 'Reopen the meal planner and try again.');
      const base = this.snapshot;
      let next: MealSnapshot;
      try {
        next = await work(base);
      } catch (err) {
        // Mealie refused (the hub answered): ask again. Not when the hub
        // itself went unanswered, which asking again would only repeat.
        if (base.source === 'mealie' && err instanceof MealClientError) this.recheck();
        throw err;
      }
      this.snapshot = next;
      this.answered += 1;
      return next;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run.finally(() => { this.pending -= 1; });
  }

  private recheck(): void {
    this.load().then(
      (snapshot) => { if (this.idle) this.onRecheck?.(snapshot); },
      () => undefined,
    );
  }
}

/** One page of Mealie recipes, as the pickers show them. */
export interface MealieRecipePage {
  items: SavedMeal[];
  page: number;
  totalPages: number;
  total: number;
}

/**
 * Search the family's Mealie recipes through the hub, for the phone's and the
 * editor's pickers. Each answer is a page of saved meals (ids `mealie:<id>`),
 * searched live in Mealie; nothing is kept in Home Screens.
 */
export async function searchMealieRecipes(
  fetcher: MealFetch,
  opts: { search?: string; filter?: MealieRecipeFilter; category?: string; cookbook?: string; page?: number },
  signal?: AbortSignal,
): Promise<MealieRecipePage> {
  const params = new URLSearchParams();
  if (opts.search?.trim()) params.set('search', opts.search.trim());
  if (opts.filter && opts.filter !== 'all') params.set('filter', opts.filter);
  if (opts.category) params.set('category', opts.category);
  if (opts.cookbook) params.set('cookbook', opts.cookbook);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const res = await fetcher(`/api/mealie/recipes${params.size ? `?${params}` : ''}`, { signal });
  const json = await readJson(res);
  const d = json as Partial<MealieRecipePage> | null;
  if (!res.ok || !d || !Array.isArray(d.items)) throw mealieRefusal('load', json, "We couldn't reach Mealie.");
  return { items: d.items, page: d.page ?? 1, totalPages: d.totalPages ?? 0, total: d.total ?? d.items.length };
}

/** The household's Mealie categories, for the Library's filters. */
export async function fetchMealieCategories(fetcher: MealFetch, signal?: AbortSignal): Promise<MealieCategory[]> {
  const res = await fetcher('/api/mealie/categories', { signal });
  const json = await readJson(res);
  const list = (json as { categories?: unknown } | null)?.categories;
  if (!res.ok || !Array.isArray(list)) throw mealieRefusal('load', json, "We couldn't reach Mealie.");
  return list.filter((c): c is MealieCategory => !!c && typeof c.name === 'string' && typeof c.slug === 'string');
}

/** The household's Mealie cookbooks, in the household's order, for the Library's and the pickers' filters. */
export async function fetchMealieCookbooks(fetcher: MealFetch, signal?: AbortSignal): Promise<MealieCookbook[]> {
  const res = await fetcher('/api/mealie/cookbooks', { signal });
  const json = await readJson(res);
  const list = (json as { cookbooks?: unknown } | null)?.cookbooks;
  if (!res.ok || !Array.isArray(list)) throw mealieRefusal('load', json, "We couldn't reach Mealie.");
  return list.filter((c): c is MealieCookbook => !!c && typeof c.name === 'string' && typeof c.slug === 'string');
}

/**
 * Whether the household's Mealie recipes changed: a short string that moves
 * when they, the favorites, the categories or the cookbooks do. A recipe
 * book on screen compares it with the last one and reads again when it moved.
 */
export async function fetchMealieRecipesRevision(fetcher: MealFetch, signal?: AbortSignal): Promise<string> {
  const res = await fetcher('/api/mealie/recipes/revision', { signal });
  const json = await readJson(res);
  const revision = (json as { revision?: unknown } | null)?.revision;
  if (!res.ok || typeof revision !== 'string') throw mealieRefusal('load', json, "We couldn't reach Mealie.");
  return revision;
}

/** One Mealie recipe in full, by the id its saved meal carries (`mealie:<id>`). */
export async function fetchMealieRecipeDetail(fetcher: MealFetch, recipeId: string, signal?: AbortSignal): Promise<MealieRecipeDetail> {
  const res = await fetcher(mealieRecipeUrl(recipeId), { signal });
  const json = await readJson(res);
  const d = json as Partial<MealieRecipeDetail> | null;
  if (!res.ok || !d || !Array.isArray(d.ingredients) || !Array.isArray(d.steps) || !d.meal) {
    throw mealieRefusal('load', json, "We couldn't reach Mealie.");
  }
  return d as MealieRecipeDetail;
}

/**
 * Put the heart on a recipe or take it off: in Mealie for a Mealie recipe,
 * in meals.json for one of the family's own. A refusal carries why when
 * Mealie was the problem.
 */
export async function saveMealFavorite(fetcher: MealFetch, mealId: string, favorite: boolean): Promise<void> {
  const res = await fetcher('/api/meals/favorite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mealId, favorite }),
  });
  if (!res.ok) throw mealieRefusal('save', await readJson(res), 'The favorite could not be saved.');
}

// ── Mealie's shopping list ──

const SHOPPING_URL = '/api/mealie/shopping';

/** A shopping list route's refusal, with Mealie's saved address when the hub sent it (for Open Mealie). */
export class MealieShoppingRefusal extends MealClientError {
  constructor(kind: MealClientFailure, message: string, problem: MealieProblem | undefined, readonly baseUrl?: string) {
    super(kind, message, problem);
    this.name = 'MealieShoppingRefusal';
  }
}

function asShopping(json: unknown): MealieShoppingAnswer | null {
  const d = json as Partial<MealieShoppingAnswer> | null;
  if (!d || (d.status !== 'ok' && d.status !== 'stale') || !Array.isArray(d.lists) || typeof d.baseUrl !== 'string') return null;
  const list = d.list && typeof d.list === 'object' && Array.isArray(d.list.groups) ? d.list : null;
  return { status: d.status, ...(d.failure ? { failure: d.failure } : {}), lists: d.lists, list, fetchedAt: Number(d.fetchedAt) || Date.now(), baseUrl: d.baseUrl };
}

/**
 * A refusal from a shopping list route. Something gone from Mealie (a list
 * deleted there, an item somebody cleared) is a `conflict`: the surface
 * reads the list again rather than saying Mealie is down.
 */
function shoppingRefusal(json: unknown, kind: MealClientFailure): MealClientError {
  const d = json as { reason?: unknown; failure?: MealieFailure; baseUrl?: unknown } | null;
  if (d?.reason === 'gone') return new MealClientError('conflict', refusalMessage(json, ''));
  return new MealieShoppingRefusal(
    kind,
    refusalMessage(json, "We couldn't reach Mealie."),
    d?.failure ? mealieProblem(d.failure) : undefined,
    typeof d?.baseUrl === 'string' ? d.baseUrl : undefined,
  );
}

async function shoppingAnswer(res: Response, kind: MealClientFailure): Promise<MealieShoppingAnswer> {
  const json = await readJson(res);
  const answer = res.ok ? asShopping(json) : null;
  if (answer) return answer;
  throw shoppingRefusal(json, kind);
}

/** The household's Mealie lists and one in full: `listId`, else the one the family shops from. */
export async function loadMealieShopping(fetcher: MealFetch, listId?: string): Promise<MealieShoppingAnswer> {
  return shoppingAnswer(await fetcher(listId ? `${SHOPPING_URL}?list=${encodeURIComponent(listId)}` : SHOPPING_URL), 'load');
}

/** Make `listId` the list the family shops from, on every surface and for voice. */
export async function chooseMealieShoppingList(fetcher: MealFetch, listId: string): Promise<MealieShoppingAnswer> {
  return shoppingAnswer(await fetcher(SHOPPING_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list: listId }),
  }), 'save');
}

/**
 * Put a typed item ("Milk") on a Mealie list. Answers with the list read
 * fresh and the new item's id (null when Mealie merged the words into an item
 * already on the list), for Undo.
 */
export async function addToMealieShoppingList(fetcher: MealFetch, listId: string, text: string): Promise<{ wire: MealieShoppingAnswer; added: string | null }> {
  const res = await fetcher(`${SHOPPING_URL}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list: listId, text }),
  });
  const json = await readJson(res);
  const wire = res.ok ? asShopping(json) : null;
  if (!wire) throw shoppingRefusal(json, 'save');
  const added = (json as { added?: unknown }).added;
  return { wire, added: typeof added === 'string' ? added : null };
}

/** Tick an item on a Mealie list, or put it back. */
export async function tickMealieShoppingItem(fetcher: MealFetch, itemId: string, checked: boolean): Promise<void> {
  const res = await fetcher(`${SHOPPING_URL}/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checked }),
  });
  if (!res.ok) throw shoppingRefusal(await readJson(res), 'save');
}

/** Take an item just added back off its list. */
export async function removeMealieShoppingItem(fetcher: MealFetch, itemId: string): Promise<void> {
  const res = await fetcher(`${SHOPPING_URL}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  if (!res.ok) throw shoppingRefusal(await readJson(res), 'save');
}
