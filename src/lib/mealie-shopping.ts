import { createLastGoodCache } from './api-utils';
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
import { shoppingAddPlan, type ShoppingList, type ShoppingListSummary } from './shopping-list';

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

const shoppingCache = createLastGoodCache<ShoppingRead>(SHOPPING_TTL_MS, SHOPPING_STALE_MS);

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

function readShopping(cfg: MealieConfig, fresh: boolean): Promise<ShoppingRead> {
  return shoppingCache.read(mealieConnectionKey(cfg), () => loadShopping(cfg), { fresh });
}

/** Forget every cached read, after a write changed Mealie. */
export function clearMealieShoppingCache(): void {
  shoppingCache.clear();
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

/** Thrown when the item or list a write names is not in Mealie any more. */
export class MealieShoppingGoneError extends Error {
  constructor(readonly what: 'item' | 'list' = 'item') {
    super(what === 'list' ? "Mealie doesn't have that list any more." : "That isn't on the list any more.");
    this.name = 'MealieShoppingGoneError';
  }
}

/**
 * Refuses a list the household no longer has in Mealie
 * (`MealieShoppingGoneError`). Asked of Mealie itself, not the hub's copy:
 * a list deleted there a moment ago would be saved as the family's list. The
 * copy still holds it then, so it is dropped, or the surface reading the
 * lists again right after would offer the deleted list for another half
 * minute.
 */
export async function requireMealieShoppingList(listId: string): Promise<void> {
  if (await readList(await requireMealieConfig(), listId)) return;
  clearMealieShoppingCache();
  throw new MealieShoppingGoneError('list');
}

/**
 * Tick an item or put it back. One-way: an item already that way is left
 * alone and `false` comes back, so a repeated "check off milk" never unticks.
 *
 * Mealie's update replaces the whole item. One carrying only the tick blanks
 * the note, so a typed "Paper towels" would read "1" afterwards (checked on
 * Mealie 3.29); the item is read and sent back whole.
 *
 * `onList` holds the tick to one list, for a caller that may only touch the
 * list the family shops from (a wall): an item Mealie places on another list,
 * or on none it names, is left alone and reads as gone, the same answer as an
 * item that is not there.
 */
export async function setMealieShoppingItemChecked(itemId: string, checked: boolean, { onList }: { onList?: string } = {}): Promise<boolean> {
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
    if (onList !== undefined && item.shoppingListId !== onList) throw new MealieShoppingGoneError();
    if (!!item.checked === checked) return false;
    await mealieJson(path, { method: 'PUT', json: { ...item, checked } }, cfg);
    return true;
  } finally {
    clearMealieShoppingCache();
  }
}

/**
 * What a typed add did. `added`: `item` is the new line, for Undo. `merged`:
 * Mealie folded the words into a line it counts as the same one, so `item`
 * is null. `already` and `putBack`, decided before Mealie is asked
 * by the rule every list keeps (`shoppingAddPlan`): the words name a line
 * still to get, so nothing changed, or one ticked off, now back on the list.
 */
export interface MealieShoppingAdd {
  outcome: 'added' | 'merged' | 'already' | 'putBack';
  item: string | null;
}

/**
 * Put a typed item on a list, the way Mealie's own box does: the words as
 * the note with quantity 0, which Mealie shows as just the words. It goes at
 * the end of the list. Words already on the list, whatever their capitals and
 * accents, are not added twice: a line still to get is left as it is, and a
 * ticked one is put back, keeping its own spelling.
 */
export async function addMealieShoppingItem(listId: string, text: string): Promise<MealieShoppingAdd> {
  const cfg = await requireMealieConfig();
  // Asked of Mealie, not the hub's copy: what is on the list right now
  // decides whether the words are new, and Mealie answers an item for a list
  // it no longer has with a bare 500, which reads as Mealie being broken.
  const list = await readList(cfg, listId);
  if (!list) {
    clearMealieShoppingCache();
    throw new MealieShoppingGoneError('list');
  }
  const plan = shoppingAddPlan(mapMealieShoppingList(list), text);
  if (plan.kind === 'already') return { outcome: 'already', item: plan.item.id };
  if (plan.kind === 'putBack') {
    try {
      const changed = await setMealieShoppingItemChecked(plan.item.id, false, { onList: listId });
      return { outcome: changed ? 'putBack' : 'already', item: plan.item.id };
    } catch (err) {
      // Cleared in Mealie a moment ago: the words go on as new.
      if (!(err instanceof MealieShoppingGoneError)) throw err;
    }
  }
  const position = Math.max(-1, ...(list.listItems ?? []).map((i) => i.position ?? 0)) + 1;
  let answer: { createdItems?: { id?: unknown }[] } | undefined;
  try {
    answer = await mealieJson<{ createdItems?: { id?: unknown }[] }>('/api/households/shopping/items', {
      method: 'POST',
      json: { shoppingListId: listId, note: text, quantity: 0, checked: false, position },
    }, cfg);
  } catch (err) {
    // The list was there a moment ago; it may have gone since.
    if (!(await readShopping(cfg, true).then((r) => r.lists.some((l) => l.id === listId), () => true))) {
      clearMealieShoppingCache();
      throw new MealieShoppingGoneError('list');
    }
    throw err;
  } finally {
    clearMealieShoppingCache();
  }
  // Mealie folds words it counts as a line already there into that line instead of making one.
  const made = answer?.createdItems?.[0]?.id;
  return typeof made === 'string' ? { outcome: 'added', item: made } : { outcome: 'merged', item: null };
}

/**
 * Put a recipe's ingredients on a list, as Mealie's own "Add to list" does:
 * one batch, every ingredient, merged into lines already there. Mealie keeps
 * which recipe each line is for, so the list still says so.
 */
export async function addMealieRecipeToShopping(listId: string, recipeId: string): Promise<void> {
  const cfg = await requireMealieConfig();
  // Asked first, as for a typed item: Mealie answers a list it no longer has with a bare 500.
  if (!(await findList(cfg, listId))) throw new MealieShoppingGoneError('list');
  try {
    await mealieJson(`/api/households/shopping/lists/${encodeURIComponent(listId)}/recipe/${encodeURIComponent(recipeId)}`, {
      method: 'POST',
      json: { recipeIncrementQuantity: 1 },
    }, cfg);
  } finally {
    clearMealieShoppingCache();
  }
}

/** Take an item off its list, for Undo right after adding it. Already gone counts as done. */
export async function deleteMealieShoppingItem(itemId: string): Promise<void> {
  const res = await mealieFetch(`/api/households/shopping/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  clearMealieShoppingCache();
  if (!res.ok && res.status !== 404) throw new MealieError('upstream', `Mealie answered ${res.status}`, res.status);
}
