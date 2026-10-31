/**
 * A shopping list as the Grocery tab draws it, and the rules the phone and
 * the editor share for it: what shows where, what a tick does, what Share
 * sends. Nothing here knows where the list came from; `mealie-shopping-map.ts`
 * builds one from Mealie's answer.
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
): { groups: ShoppingGroup[]; folded: ShoppingItem[] } {
  const groups: ShoppingGroup[] = [];
  const away: ShoppingItem[] = [];
  const leads = (i: ShoppingItem) => added.has(i.id) || folded.has(i.id);
  for (const group of list.groups) {
    const shown = group.items.filter((i) => !folded.has(i.id) || !i.checked);
    away.push(...group.items.filter((i) => folded.has(i.id) && i.checked));
    if (shown.length === 0) continue;
    const fresh = shown.filter(leads);
    groups.push({ label: group.label, items: fresh.length ? [...fresh, ...shown.filter((i) => !leads(i))] : shown });
  }
  return { groups, folded: away };
}

/** The folded items that are not ticked any more: they have left the fold for good this visit. */
export function shoppingPutBack(list: ShoppingList, folded: ReadonlySet<string>): string[] {
  return shoppingItems(list).filter((i) => folded.has(i.id) && !i.checked).map((i) => i.id);
}

/**
 * What adding `words` means for this list. Something already there to get is
 * not added twice ("Milk" when "milk" is on it); something there and ticked is
 * put back rather than added again. Anything else is new. Matched on the
 * whole line, ignoring capitals, so "milk" never stands in for a recipe's
 * "200 milliliters milk".
 */
export function shoppingAddPlan(
  list: ShoppingList,
  words: string,
): { kind: 'new' } | { kind: 'already' | 'putBack'; item: ShoppingItem } {
  const wanted = words.trim().toLowerCase();
  const same = shoppingItems(list).filter((i) => i.text.trim().toLowerCase() === wanted);
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

/**
 * What Share sends: what is still to get, under its label, the same shape as
 * the list Home Screens builds from the week's meals. `labelFor` names the
 * group with no label; `complete` is the line for a list with nothing left.
 */
export function shoppingShareText(
  list: ShoppingList,
  words: { heading: string; complete: string; labelFor: (label: string | null) => string },
): string {
  const sections: string[] = [];
  for (const group of list.groups) {
    const left = group.items.filter((i) => !i.checked);
    if (left.length === 0) continue;
    sections.push(`${words.labelFor(group.label)}\n${left.map((i) => `  ${i.text}${i.note ? ` (${i.note})` : ''}`).join('\n')}`);
  }
  return sections.length === 0 ? words.complete : `${words.heading}\n\n${sections.join('\n\n')}`;
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
