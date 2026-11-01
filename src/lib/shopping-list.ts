import type { MealieClientProblem } from './meal-client';
import type { MealieProblem } from './meal-sources';

/**
 * A shopping list as the Grocery tab draws it, and the rules the phone and
 * the editor share for it: what shows where, what a tick does, what Share
 * sends, and which words the lines around the list say. Nothing here knows
 * where the list came from; `mealie-shopping-map.ts` builds one from Mealie's
 * answer.
 */

export interface ShoppingItem {
  id: string;
  /** The line as the family wrote it, amount first ("140 grams flour"). */
  text: string;
  /** Mealie's note under the line ("chopped", "To taste"). */
  note?: string;
  /** What it is, without the amount, as the line says it ("eggs", "bay leaves"): what voice reads out. */
  name: string;
  /** The food's own name when it reads differently ("egg"), so voice finds "egg" too. */
  alsoCalled?: string;
  checked: boolean;
  /** The recipes it is on the list for. */
  recipes: string[];
}

export interface ShoppingGroup {
  /** The family's own label (works like an aisle); null for items with none. */
  label: string | null;
  items: ShoppingItem[];
}

/** A group as the tab draws it, with how many of its items are still to get (its heading's count). */
export interface ShoppingViewGroup extends ShoppingGroup {
  left: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  /** In the list's own label order, items with no label first, as Mealie shows them. */
  groups: ShoppingGroup[];
}

/** One of the household's lists, for choosing between them. */
export interface ShoppingListSummary {
  id: string;
  name: string;
  /** Items still to get. */
  left: number;
}

export function shoppingItems(list: ShoppingList): ShoppingItem[] {
  return list.groups.flatMap((g) => g.items);
}

export function shoppingCounts(list: ShoppingList): { total: number; got: number } {
  const items = shoppingItems(list);
  return { total: items.length, got: items.filter((i) => i.checked).length };
}

/**
 * What is ticked when the tab opens: those items wait folded away at the
 * bottom. A Mealie list keeps every ticked item until somebody clears it, so
 * a real one can hold hundreds.
 */
export function foldedOnOpen(list: ShoppingList): Set<string> {
  return new Set(shoppingItems(list).filter((i) => i.checked).map((i) => i.id));
}

/**
 * The list as the tab draws it this visit. Items in `folded` (ticked when the
 * tab opened) go to the bottom in Mealie's order while they stay ticked;
 * everything else stays in its group, ticked or not, so an item never jumps
 * away under the finger that ticked it and a wrong tap is one tap to undo.
 *
 * A folded item that is no longer ticked (put back here, or by somebody in
 * Mealie) is to get again: it leads its group, as do items in `added` (typed
 * in this visit), so it is in view rather than lost in the fold. Groups left
 * empty are dropped.
 */
export function shoppingListView(
  list: ShoppingList,
  { folded, added }: { folded: ReadonlySet<string>; added: ReadonlySet<string> },
): { groups: ShoppingViewGroup[]; folded: ShoppingItem[] } {
  const groups: ShoppingViewGroup[] = [];
  const away: ShoppingItem[] = [];
  const leads = (i: ShoppingItem) => added.has(i.id) || folded.has(i.id);
  for (const group of list.groups) {
    const shown = group.items.filter((i) => !folded.has(i.id) || !i.checked);
    away.push(...group.items.filter((i) => folded.has(i.id) && i.checked));
    if (shown.length === 0) continue;
    const fresh = shown.filter(leads);
    const items = fresh.length ? [...fresh, ...shown.filter((i) => !leads(i))] : shown;
    groups.push({ label: group.label, items, left: items.filter((i) => !i.checked).length });
  }
  return { groups, folded: away };
}

/** The folded items that are not ticked any more: they have left the fold for good this visit. */
export function shoppingPutBack(list: ShoppingList, folded: ReadonlySet<string>): string[] {
  return shoppingItems(list).filter((i) => folded.has(i.id) && !i.checked).map((i) => i.id);
}

/** Typed words as a list line keeps them: no spaces at the ends, one space between words. */
export function tidyShoppingText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/** What two lines are compared by: their tidied words, ignoring capitals ("Paper  towels" is "paper towels"). */
export function shoppingTextKey(text: string): string {
  return tidyShoppingText(text).toLowerCase();
}

/**
 * What adding `words` means for this list. Something already there to get is
 * not added twice ("Milk" when "milk" is on it); something there and ticked is
 * put back rather than added again. Anything else is new. Matched on the
 * whole line (`shoppingTextKey`), so "milk" never stands in for a recipe's
 * "200 milliliters milk".
 */
export function shoppingAddPlan(
  list: ShoppingList,
  words: string,
): { kind: 'new' } | { kind: 'already' | 'putBack'; item: ShoppingItem } {
  const wanted = shoppingTextKey(words);
  const same = shoppingItems(list).filter((i) => shoppingTextKey(i.text) === wanted);
  const left = same.find((i) => !i.checked);
  if (left) return { kind: 'already', item: left };
  if (same[0]) return { kind: 'putBack', item: same[0] };
  return { kind: 'new' };
}

/** The list with one item ticked or put back; the same list when nothing changes. */
export function setShoppingItemChecked(list: ShoppingList, id: string, checked: boolean): ShoppingList {
  let changed = false;
  const groups = list.groups.map((g) => {
    if (!g.items.some((i) => i.id === id && i.checked !== checked)) return g;
    changed = true;
    return { ...g, items: g.items.map((i) => (i.id === id ? { ...i, checked } : i)) };
  });
  return changed ? { ...list, groups } : list;
}

/**
 * Every item called `name` (as the line says it, or by its food's own name),
 * ignoring case and spaces at the ends: "check off salt" means each salt on the
 * list (a recipe's teaspoon and another's pinch are separate items), and
 * "eggs" and "egg" both find "4 eggs".
 */
export function shoppingItemsNamed(list: ShoppingList, name: string): ShoppingItem[] {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  return shoppingItems(list).filter((i) => [i.name, i.alsoCalled].some((n) => n?.trim().toLowerCase() === wanted));
}

/** One heading's worth of a shared list: its name and what is still to get under it. */
export interface GroceryShareSection {
  label: string;
  /** Each line, with what goes in brackets after it (an amount, Mealie's note). */
  items: readonly { text: string; detail?: string }[];
}

/**
 * What Share sends, for either list the family keeps: `heading`, then each
 * section with something in it, a line per item ("  Ground beef (2 lb)").
 * `complete` is the whole text when nothing is left to get.
 */
export function groceryShareText(
  sections: readonly GroceryShareSection[],
  words: { heading: string; complete: string },
): string {
  const parts = sections
    .filter((section) => section.items.length > 0)
    .map((section) => `${section.label}\n${section.items.map((i) => `  ${i.text}${i.detail ? ` (${i.detail})` : ''}`).join('\n')}`);
  return parts.length === 0 ? words.complete : `${words.heading}\n\n${parts.join('\n\n')}`;
}

/**
 * What Share sends for a Mealie list: what is still to get, under its label.
 * `labelFor` names the group with no label.
 */
export function shoppingShareText(
  list: ShoppingList,
  words: { heading: string; complete: string; labelFor: (label: string | null) => string },
): string {
  return groceryShareText(
    list.groups.map((group) => ({
      label: words.labelFor(group.label),
      items: group.items.filter((i) => !i.checked).map((i) => ({ text: i.text, detail: i.note })),
    })),
    words,
  );
}

/** One thing as voice reads it: its name, the food's own name when that differs, and whether all of it is ticked. */
export interface SpokenShoppingItem {
  name: string;
  alsoCalled?: string;
  checked: boolean;
}

/**
 * The list as voice reads it: one entry per thing, so "salt" is said once
 * though two recipes put it on the list, ticked only when every salt is.
 * Lines are the same thing when their food is ("4 eggs" and "1 egg"). Each
 * stays under the first label it appears in.
 */
export function shoppingListByName(list: ShoppingList): { label: string | null; items: SpokenShoppingItem[] }[] {
  const seen = new Map<string, SpokenShoppingItem>();
  const groups: { label: string | null; items: SpokenShoppingItem[] }[] = [];
  for (const group of list.groups) {
    const items: SpokenShoppingItem[] = [];
    for (const item of group.items) {
      const key = (item.alsoCalled ?? item.name).trim().toLowerCase();
      const known = seen.get(key);
      if (known) {
        known.checked &&= item.checked;
        continue;
      }
      const entry: SpokenShoppingItem = { name: item.name, ...(item.alsoCalled ? { alsoCalled: item.alsoCalled } : {}), checked: item.checked };
      seen.set(key, entry);
      items.push(entry);
    }
    if (items.length) groups.push({ label: group.label, items });
  }
  return groups;
}

/**
 * The ticks a spoken "check off salt" (or "put salt back") means: every item
 * of that name not already that way. With no direction it is a flip: ticks
 * them while any is left to get, puts them all back once every one is ticked.
 */
export function shoppingTicksForName(
  list: ShoppingList,
  name: string,
  direction?: 'check' | 'uncheck',
): { ids: string[]; checked: boolean; matched: number } {
  const items = shoppingItemsNamed(list, name);
  const checked = direction ? direction === 'check' : items.some((i) => !i.checked);
  return { ids: items.filter((i) => i.checked !== checked).map((i) => i.id), checked, matched: items.length };
}

// ── The lines around a Mealie list ──
//
// The phone and the editor say these in their own dictionaries and styles;
// which words fit is decided here, as a key under each one's Mealie grocery
// words, so the two never drift apart.

export type MealieShoppingAction = 'tick' | 'add' | 'choose' | 'undo';

/** A write to the Mealie list that did not go through. */
export interface MealieShoppingFailure {
  action: MealieShoppingAction;
  /** What a failed tick or add was about, as the list says it. */
  items?: string[];
  /** Why; null when the hub refused it without naming a reason. */
  problem: MealieClientProblem | null;
  /** The list or the item is not in Mealie any more. */
  gone: boolean;
}

/** What just happened to the list on screen, said under the list chooser. */
export type MealieShoppingNotice =
  /** This device picked `list` for the whole family; Undo picks the old one again. */
  | { kind: 'picked'; list: string; undo: () => void }
  /** Somebody picked `list` on another device. */
  | { kind: 'moved'; list: string }
  /** `from` was deleted in Mealie, so the tab shows `list` now. */
  | { kind: 'gone'; from: string; list: string };

/** What the last add did, said under the box. */
export interface MealieShoppingAdded {
  /** `already`: it was on the list to get; `putBack`: it was ticked and is to get again. */
  kind: 'added' | 'already' | 'putBack';
  text: string;
  list: string;
  /** The label Mealie filed it under. */
  label: string | null;
  /** Takes a new item back off the list; absent when nothing new was made. */
  undo?: () => void;
}

/** The key ending for the "not saved" and "out of date" lines, by why. */
const REASON: Record<MealieClientProblem, string> = {
  unreachable: 'Unreachable',
  token: 'Token',
  setup: 'Setup',
  'not-connected': 'NotConnected',
  connection: 'Connection',
};

/**
 * What a surface says about a write that failed: the list gone from Mealie
 * (`listGone`), this device not reaching the hub (`noConnection`), or the
 * items named with why they were not saved (`notSaved...`). A failed pick or
 * Undo names no items: that is `saveFailed`, which each surface says with its
 * own "that change didn't save" words for `reason`. Null when there is
 * nothing to say: a tick on something gone from Mealie just reads the list
 * again.
 *
 * A refusal that names no reason is a plain "not saved", never "Mealie isn't
 * answering", which would send somebody to check on a Mealie that is fine.
 */
export function mealieShoppingErrorWords(failure: MealieShoppingFailure): { key: string; reason?: MealieProblem } | null {
  if (failure.gone) return failure.action === 'tick' ? null : { key: 'listGone' };
  if (failure.items?.length) return { key: `notSaved${failure.problem ? REASON[failure.problem] : ''}` };
  if (failure.problem === 'connection') return { key: 'noConnection' };
  return failure.problem ? { key: 'saveFailed', reason: failure.problem } : { key: 'saveFailed' };
}

/** The line saying the list on screen is the copy from {time}, by why it is old. */
export function mealieShoppingStaleKey(problem: MealieClientProblem | null): string {
  return `stale${REASON[problem ?? 'unreachable']}`;
}

/** The line under the add box after an add, and what fills it in. */
export function mealieShoppingAddedWords(added: MealieShoppingAdded): { key: string; vars: Record<string, string> } {
  const vars = { item: added.text, list: added.list };
  if (added.kind !== 'added') return { key: added.kind, vars };
  return added.label ? { key: 'addedUnder', vars: { ...vars, label: added.label } } : { key: 'added', vars };
}

/** The line under the list chooser, and what fills it in. */
export function mealieShoppingNoticeWords(notice: MealieShoppingNotice): { key: string; vars: Record<string, string> } {
  return notice.kind === 'gone'
    ? { key: 'gone', vars: { from: notice.from, list: notice.list } }
    : { key: notice.kind, vars: { list: notice.list } };
}
