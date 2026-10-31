import { createTTLCache } from './api-utils';
import {
  MealieError,
  getMealieRecipe,
  mealieConnectionKey,
  mealieFetch,
  mealieJson,
  requireMealieConfig,
  type MealieConfig,
  type MealieFailure,
} from './mealie';
import {
  mapMealieShoppingList,
  mealieListRecipeIds,
  mealieListRecipeNames,
  mealieListSummary,
  type MealieShoppingItem,
  type MealieShoppingListRaw,
} from './mealie-shopping-map';
import type { ShoppingList, ShoppingListSummary } from './shopping-list';

/**
 * The household's Mealie shopping lists, read and ticked by the hub for the
 * phone's and the editor's Grocery tab and the voice grocery answer. Nothing
 * is copied into Home Screens; which list the family shops from is the one
 * thing kept here (`MealData.mealieShoppingList`).
 */

/**
 * Short, so a tick made in Mealie's own app reaches a Grocery tab (which asks
 * every 30 s) quickly; long enough that a phone and the editor open together
 * share one read. The last good copy is kept a day for when Mealie is down.
 */
const SHOPPING_TTL_MS = 10_000;
const SHOPPING_STALE_MS = 24 * 60 * 60_000;
/** More lists than a household keeps; past it a read would turn into dozens of calls. */
const MAX_LISTS = 20;
/** Recipes looked up by id in one read, for names the lists no longer carry; the rest wait for the next read. */
const MAX_RECIPE_LOOKUPS = 12;

interface ShoppingRead {
  /** Every list with its items, A to Z. */
  lists: MealieShoppingListRaw[];
  /** Every recipe an item is on a list for, by id. */
  recipeNames: ReadonlyMap<string, string>;
  fetchedAt: number;
  baseUrl: string;
}

/**
 * Recipe names by connection and id, kept for as long as the hub runs. A
 * list's own references drop a recipe once all its items are ticked, so the
 * "for Yorkshire Puddings" line would vanish just as the shop goes well; a
 * name seen once is kept, and one never seen is asked of Mealie.
 */
const recipeNames = new Map<string, string>();

async function nameRecipes(cfg: MealieConfig, lists: MealieShoppingListRaw[]): Promise<Map<string, string>> {
  const conn = mealieConnectionKey(cfg);
  for (const list of lists) {
    for (const [id, name] of mealieListRecipeNames(list)) recipeNames.set(`${conn}|${id}`, name);
  }
  const ids = [...new Set(lists.flatMap(mealieListRecipeIds))];
  const missing = ids.filter((id) => !recipeNames.has(`${conn}|${id}`)).slice(0, MAX_RECIPE_LOOKUPS);
  await Promise.all(missing.map(async (id) => {
    const name = await getMealieRecipe(id).then((r) => r.name?.trim(), () => undefined);
    if (name) recipeNames.set(`${conn}|${id}`, name);
  }));
  const known = new Map<string, string>();
  for (const id of ids) {
    const name = recipeNames.get(`${conn}|${id}`);
    if (name) known.set(id, name);
  }
  return known;
}

/** Mealie's list and item ids are UUIDs; nothing else is put into a path to Mealie. */
export function isMealieShoppingId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f-]{1,64}$/i.test(id);
}

const shoppingCache = createTTLCache<ShoppingRead>(SHOPPING_TTL_MS, SHOPPING_STALE_MS);
const shoppingInflight = new Map<string, Promise<ShoppingRead>>();

/** Mealie's answer for one list, or null when it went between the two calls. */
async function readList(cfg: MealieConfig, id: string): Promise<MealieShoppingListRaw | null> {
  try {
    const raw = await mealieJson<MealieShoppingListRaw>(`/api/households/shopping/lists/${encodeURIComponent(id)}`, undefined, cfg);
    return raw && typeof raw.id === 'string' ? raw : null;
  } catch (err) {
    if (err instanceof MealieError && err.status === 404) return null;
    throw err;
  }
}

async function loadShopping(cfg: MealieConfig): Promise<ShoppingRead> {
  // The list of lists carries no items, and the counts on the list chooser
  // need them, so each list is read too.
  const page = await mealieJson<{ items?: { id?: unknown; name?: unknown }[] }>(
    '/api/households/shopping/lists?perPage=-1&orderBy=name&orderDirection=asc',
    undefined,
    cfg,
  );
  const ids = (page?.items ?? [])
    .filter((l): l is { id: string; name: string } => typeof l?.id === 'string' && typeof l.name === 'string')
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_LISTS)
    .map((l) => l.id);
  const lists = (await Promise.all(ids.map((id) => readList(cfg, id)))).filter((l): l is MealieShoppingListRaw => l !== null);
  return { lists, recipeNames: await nameRecipes(cfg, lists), fetchedAt: Date.now(), baseUrl: cfg.url };
}

/** Moves on every write, so a read that started before it never refills the cache with what Mealie had then. */
let generation = 0;

async function readShopping(cfg: MealieConfig, fresh: boolean): Promise<ShoppingRead> {
  const key = mealieConnectionKey(cfg);
  if (!fresh) {
    const cached = shoppingCache.get(key);
    if (cached) return cached;
  }
  const started = generation;
  let pending = fresh ? undefined : shoppingInflight.get(key);
  if (!pending) {
    pending = loadShopping(cfg);
    if (!fresh) {
      shoppingInflight.set(key, pending);
      pending.finally(() => {
        if (shoppingInflight.get(key) === pending) shoppingInflight.delete(key);
      }).catch(() => {});
    }
  }
  const read = await pending;
  if (started === generation) shoppingCache.set(key, read);
  return read;
}

/** Forget every cached read, after a write changed Mealie. */
export function clearMealieShoppingCache(): void {
  generation++;
  shoppingCache.clear();
  shoppingInflight.clear();
}

export interface MealieShoppingAnswer {
  status: 'ok' | 'stale';
  /** Why Mealie gave no fresh answer, on a stale copy. */
  failure?: MealieFailure;
  lists: ShoppingListSummary[];
  /** The list shown: the one asked for, else the one made first; null when the household has none. */
  list: ShoppingList | null;
  /** When Mealie gave this answer (ms since epoch). */
  fetchedAt: number;
  /** Mealie's address, for Open Mealie. */
  baseUrl: string;
}

/** No copy at all; `baseUrl` (the saved address, when there is one) still lets a surface offer Open Mealie. */
export type MealieShoppingResult = MealieShoppingAnswer | { status: 'failed'; failure: MealieFailure; baseUrl?: string };

/**
 * The list a household with no choice saved shops from: the one made first,
 * which is nearly always its everyday list (a "Costco run" comes later), and
 * which never changes under the voice answer the way a count would.
 */
function firstMade(lists: MealieShoppingListRaw[]): MealieShoppingListRaw | undefined {
  return lists.reduce<MealieShoppingListRaw | undefined>(
    (first, l) => (!first || (l.createdAt ?? '\uffff') < (first.createdAt ?? '\uffff') ? l : first),
    undefined,
  );
}

function answer(read: ShoppingRead, listId: string | undefined, stale?: MealieFailure): MealieShoppingAnswer {
  const shown = read.lists.find((l) => l.id === listId) ?? firstMade(read.lists);
  return {
    status: stale ? 'stale' : 'ok',
    ...(stale ? { failure: stale } : {}),
    lists: read.lists.map(mealieListSummary),
    list: shown ? mapMealieShoppingList(shown, read.recipeNames) : null,
    fetchedAt: read.fetchedAt,
    baseUrl: read.baseUrl,
  };
}

/**
 * The household's lists, A to Z, and the one to show (`listId`, falling back
 * to the one made first when it is unset or Mealie no longer has it). From the cache
 * when it can; `fresh` asks Mealie whatever the cache holds.
 */
export async function readMealieShopping(listId: string | undefined, { fresh = false } = {}): Promise<MealieShoppingResult> {
  let cfg: MealieConfig;
  try {
    cfg = await requireMealieConfig();
  } catch (err) {
    return { status: 'failed', failure: err instanceof MealieError ? err.failure : 'upstream' };
  }
  try {
    return answer(await readShopping(cfg, fresh), listId);
  } catch (err) {
    const failure = err instanceof MealieError ? err.failure : 'upstream';
    const stale = shoppingCache.getStale(mealieConnectionKey(cfg));
    return stale ? answer(stale, listId, failure) : { status: 'failed', failure, baseUrl: cfg.url };
  }
}

/** The household's list with this id, from a fresh read when the cached one does not know it. */
async function findList(cfg: MealieConfig, listId: string): Promise<MealieShoppingListRaw | undefined> {
  return (await readShopping(cfg, false)).lists.find((l) => l.id === listId)
    ?? (await readShopping(cfg, true)).lists.find((l) => l.id === listId);
}

/** Whether the household has a list with this id. */
export async function mealieShoppingListExists(listId: string): Promise<boolean> {
  return !!(await findList(await requireMealieConfig(), listId));
}

/** Thrown when the item or list a write names is not in Mealie any more. */
export class MealieShoppingGoneError extends Error {
  constructor() {
    super('That is not on the list any more');
    this.name = 'MealieShoppingGoneError';
  }
}

/**
 * Tick an item or put it back. One-way: an item already that way is left
 * alone and `false` comes back, so a repeated "check off milk" never unticks.
 *
 * Mealie's update replaces the whole item. One carrying only the tick blanks
 * the note, so a typed "Paper towels" would read "1" afterwards (checked on
 * Mealie 3.29); the item is read and sent back whole.
 */
export async function setMealieShoppingItemChecked(itemId: string, checked: boolean): Promise<boolean> {
  const cfg = await requireMealieConfig();
  const path = `/api/households/shopping/items/${encodeURIComponent(itemId)}`;
  let item: MealieShoppingItem & Record<string, unknown>;
  // Whatever the answer, the next read asks Mealie: an item somebody already
  // ticked or deleted in Mealie's app means the hub's copy is out of date, and
  // the read right after a tick would otherwise put the old state back.
  try {
    try {
      item = await mealieJson<MealieShoppingItem & Record<string, unknown>>(path, undefined, cfg);
    } catch (err) {
      if (err instanceof MealieError && err.status === 404) throw new MealieShoppingGoneError();
      throw err;
    }
    if (!item || typeof item.id !== 'string') throw new MealieShoppingGoneError();
    if (!!item.checked === checked) return false;
    await mealieJson(path, { method: 'PUT', json: { ...item, checked } }, cfg);
    return true;
  } finally {
    clearMealieShoppingCache();
  }
}

/**
 * Put a typed item on a list, the way Mealie's own box does: the words as
 * the note with quantity 0, which Mealie shows as just the words. It goes at
 * the end of the list. Answers the new item's id, or null when Mealie merged
 * the words into an item already on the list.
 */
export async function addMealieShoppingItem(listId: string, text: string): Promise<string | null> {
  const cfg = await requireMealieConfig();
  // Asked first: Mealie answers an item for a list it no longer has with a
  // bare 500, which reads as Mealie being broken.
  const list = await findList(cfg, listId);
  if (!list) throw new MealieShoppingGoneError();
  const position = Math.max(-1, ...(list.listItems ?? []).map((i) => i.position ?? 0)) + 1;
  let answer: { createdItems?: { id?: unknown }[] } | undefined;
  try {
    answer = await mealieJson<{ createdItems?: { id?: unknown }[] }>('/api/households/shopping/items', {
      method: 'POST',
      json: { shoppingListId: listId, note: text, quantity: 0, checked: false, position },
    }, cfg);
  } catch (err) {
    // The copy said the list was there; it may be seconds old.
    if (!(await readShopping(cfg, true).then((r) => r.lists.some((l) => l.id === listId), () => true))) {
      clearMealieShoppingCache();
      throw new MealieShoppingGoneError();
    }
    throw err;
  } finally {
    clearMealieShoppingCache();
  }
  // Mealie merges words already on the list into that item instead of making one.
  const made = answer?.createdItems?.[0]?.id;
  return typeof made === 'string' ? made : null;
}

/** Take an item off its list, for Undo right after adding it. Already gone counts as done. */
export async function deleteMealieShoppingItem(itemId: string): Promise<void> {
  const res = await mealieFetch(`/api/households/shopping/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  clearMealieShoppingCache();
  if (!res.ok && res.status !== 404) throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
}
