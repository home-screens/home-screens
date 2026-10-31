import type { SavedMeal, PlannedMeal, MealSettings, MealSlotType, TimeFormat } from '@/types/config';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { mealWriteBody, type MealDataWrite } from '@/lib/meal-write';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { displayCache } from '@/lib/display-cache';
import { mealieProblem, mergeMealSources, planCellChanges, rangeCovers, unionRange, type MealieProblem, type MealieWireBlock } from '@/lib/meal-sources';
import type { MealieFailure } from '@/lib/mealie';

/** Where a save goes while the plan lives in Mealie. */
const MEALIE_PLAN_URL = '/api/mealie/plan';
import { normalizeGroceryChecked, withGroceryWeek, type GroceryChecked, type GroceryCheckDirection } from '@/lib/grocery-checks';

/**
 * The transport contract of `/api/meals/data`, shared by the phone's Meals
 * tab and the editor's meal-planner modal. The two surfaces keep their own
 * state and markup; what they must agree on is what a loaded copy is, how a
 * save quotes the revision it was built from, and what happens when the hub
 * says somebody else saved first.
 */

/** `editorFetch` on the editor and phone; the wall never writes meals. */
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

function asSnapshot(json: unknown, fallbackTimeFormat: TimeFormat): MealSnapshot | null {
  const d = json as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.savedMeals) || !Array.isArray(d.plan) || typeof d.revision !== 'string' || !d.revision) return null;
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
    revision: d.revision,
    source: merged.source,
    mealie: merged.mealie,
    mealieConnected: d.mealieConnected === true,
  };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

/** The route's own plain sentence when it wrote one, the caller's fallback otherwise. */
function refusalMessage(json: unknown, fallback: string): string {
  const error = (json as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error ? error : fallback;
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
 * keep the other's. Rejects on any refusal; transport failures (including an
 * expired session) propagate untouched.
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
 * canvas preview showing the same URL adopts it without a fetch. Transport
 * failures (including an expired session) propagate untouched.
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
 */
export async function loadMealieRange(fetcher: MealFetch, base: MealSnapshot, range: MealieRange): Promise<MealSnapshot> {
  const res = await fetcher(`${MEALIE_PLAN_URL}?start=${range.start}&end=${range.end}`);
  const json = await readJson(res);
  const block = (json as { mealie?: MealieWireBlock } | null)?.mealie;
  if (!res.ok || !block || !Array.isArray(block.plan)) {
    throw new MealClientError('load', refusalMessage(json, 'Those weeks could not be loaded from Mealie.'));
  }
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
      throw new MealClientError('conflict', refusalMessage(json, 'Somebody changed these meals in Mealie. Try again.'));
    }
    const saved = res.ok ? asSnapshot(json, current.globalTimeFormat) : null;
    if (!saved) throw new MealClientError('save', refusalMessage(json, 'The meals could not be saved to Mealie.'));
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

  constructor(private readonly fetcher: MealFetch) {}

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
      // A surface that paged further than the shared weeks keeps them.
      loaded.source === 'mealie' && range && !rangeCovers(loaded.mealie?.range, range)
        ? loadMealieRange(this.fetcher, loaded, unionRange(loaded.mealie?.range ?? range, range)).catch(() => loaded)
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
      if (!saved) throw new MealClientError('save', refusalMessage(json, "We couldn't reach Mealie."));
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
      const next = await work(this.snapshot);
      this.snapshot = next;
      this.answered += 1;
      return next;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run.finally(() => { this.pending -= 1; });
  }
}

/** One page of Mealie recipes, as the pickers show them. */
export interface MealieRecipePage {
  items: SavedMeal[];
  page: number;
  totalPages: number;
  total: number;
}

export type MealieRecipeFilter = 'all' | 'favorites' | 'recent';

/**
 * Search the family's Mealie recipes through the hub, for the phone's and the
 * editor's pickers. Each answer is a page of saved meals (ids `mealie:<id>`),
 * searched live in Mealie; nothing is kept in Home Screens.
 */
export async function searchMealieRecipes(
  fetcher: MealFetch,
  opts: { search?: string; filter?: MealieRecipeFilter; category?: string; page?: number },
  signal?: AbortSignal,
): Promise<MealieRecipePage> {
  const params = new URLSearchParams();
  if (opts.search?.trim()) params.set('search', opts.search.trim());
  if (opts.filter && opts.filter !== 'all') params.set('filter', opts.filter);
  if (opts.category) params.set('category', opts.category);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const res = await fetcher(`/api/mealie/recipes${params.size ? `?${params}` : ''}`, { signal });
  const json = await readJson(res);
  const d = json as Partial<MealieRecipePage> | null;
  if (!res.ok || !d || !Array.isArray(d.items)) {
    const failure = (json as { failure?: MealieFailure } | null)?.failure;
    throw new MealClientError('load', refusalMessage(json, "We couldn't reach Mealie."), mealieProblem(failure));
  }
  return { items: d.items, page: d.page ?? 1, totalPages: d.totalPages ?? 0, total: d.total ?? d.items.length };
}

/** One of the household's Mealie recipe categories. */
export interface MealieCategory {
  name: string;
  slug: string;
}

/** The household's Mealie categories, for the Library's filters. */
export async function fetchMealieCategories(fetcher: MealFetch, signal?: AbortSignal): Promise<MealieCategory[]> {
  const res = await fetcher('/api/mealie/categories', { signal });
  const json = await readJson(res);
  const list = (json as { categories?: unknown } | null)?.categories;
  if (!res.ok || !Array.isArray(list)) throw new MealClientError('load', refusalMessage(json, "We couldn't reach Mealie."));
  return list.filter((c): c is MealieCategory => !!c && typeof c.name === 'string' && typeof c.slug === 'string');
}

/** A Mealie recipe's ingredients and steps (see `mealieRecipeDetail`). */
export interface MealieRecipeDetailWire {
  meal: SavedMeal;
  description?: string;
  ingredients: { heading?: string; text: string }[];
  steps: { heading?: string; text: string }[];
}

/** One Mealie recipe in full, by the id its saved meal carries (`mealie:<id>`). */
export async function fetchMealieRecipeDetail(fetcher: MealFetch, recipeId: string, signal?: AbortSignal): Promise<MealieRecipeDetailWire> {
  const res = await fetcher(`/api/mealie/recipe/${encodeURIComponent(recipeId)}`, { signal });
  const json = await readJson(res);
  const d = json as Partial<MealieRecipeDetailWire> | null;
  if (!res.ok || !d || !Array.isArray(d.ingredients) || !Array.isArray(d.steps) || !d.meal) {
    throw new MealClientError('load', refusalMessage(json, "We couldn't reach Mealie."));
  }
  return d as MealieRecipeDetailWire;
}
