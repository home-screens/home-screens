import type { ShoppingList } from './shopping-list';
import { GROCERY_CATEGORY_ICONS, groceryListNeedsHeadings, type GroceryList } from './grocery-utils';
import { groceryItemKey } from './grocery-checks';

/**
 * The grocery list as the wall draws it, from either list the family keeps:
 * this week's list built from planned meals (`generateGroceryList`, the same
 * one the phone shows), or the Mealie list the family shops from. Pure, so
 * the small and the full-screen Grocery views agree.
 */

export interface WallGroceryItem {
  /** What a tick names: a Mealie item's id, or the local list's item as ticks are stored (`groceryItemKey`). */
  id: string;
  /** The line as the phone shows it: Mealie's whole line, or the item's name. */
  text: string;
  /** Mealie's note ("chopped"), drawn after the line. */
  note?: string;
  /** The local list's summed amount ("2 lb"), drawn at the right. */
  amount?: string;
  checked: boolean;
}

export interface WallGroceryGroup {
  key: string;
  /** A Mealie label's name; null for Mealie's unlabelled items and for every local aisle (see `aisle`). */
  label: string | null;
  /** The local list's aisle (`produce`, ...), named and drawn with its icon by the view. */
  aisle?: string;
  items: WallGroceryItem[];
}

/** A group as the wall draws it, with how many of its items are still to get (its heading's count). */
export interface WallGroceryShownGroup extends WallGroceryGroup {
  left: number;
}

export interface WallGroceryRows {
  groups: WallGroceryShownGroup[];
  /** Items still to get. */
  left: number;
  /** Items ticked. */
  got: number;
}

/** The local list, aisle by aisle; headings only when there is more than one aisle, as on the phone. */
export function wallGroceryFromLocal(list: GroceryList): WallGroceryGroup[] {
  const headed = groceryListNeedsHeadings(list);
  return [...list.entries()].map(([aisle, { items }]) => ({
    key: aisle,
    label: null,
    ...(headed ? { aisle } : {}),
    items: items.map((i) => ({
      id: groceryItemKey(i.name),
      text: i.name,
      ...(i.amount ? { amount: i.amount } : {}),
      checked: i.checked,
    })),
  }));
}

/** A Mealie list in its own label order, unlabelled items first with no heading, as Mealie lists them. */
export function wallGroceryFromMealie(list: ShoppingList): WallGroceryGroup[] {
  return list.groups.map((g, i) => ({
    key: g.label ?? `unlabelled-${i}`,
    label: g.label,
    items: g.items.map((item) => ({
      id: item.id,
      text: item.text,
      ...(item.note ? { note: item.note } : {}),
      checked: item.checked,
    })),
  }));
}

/**
 * What the wall draws: only what is still to get, after this wall's own taps
 * (`ticks`, by item id) are laid over the list it last read. An item ticked
 * here stays drawn, crossed out, while it is in `keep`, so a wrong tap is
 * undone by tapping it again. Groups left empty are dropped. The counts are
 * of the whole list; each group's `left` is of that group, so a heading over
 * a crossed-out item already counts it as got.
 */
export function wallGroceryRows(
  groups: readonly WallGroceryGroup[],
  ticks: ReadonlyMap<string, boolean>,
  keep: ReadonlySet<string>,
): WallGroceryRows {
  let left = 0;
  let got = 0;
  const shown: WallGroceryShownGroup[] = [];
  for (const group of groups) {
    const items: WallGroceryItem[] = [];
    let groupLeft = 0;
    for (const item of group.items) {
      const checked = ticks.get(item.id) ?? item.checked;
      if (checked) got++;
      else groupLeft++;
      if (!checked || keep.has(item.id)) items.push(checked === item.checked ? item : { ...item, checked });
    }
    left += groupLeft;
    if (items.length > 0) shown.push({ ...group, items, left: groupLeft });
  }
  return { groups: shown, left, got };
}

/** One item as the wall's Grocery views lay it out, a row at a time. */
export interface WallGroceryFlatRow {
  item: WallGroceryItem;
  /** The group's heading, carried by its first item, so a heading never ends a page or a column without its items. */
  heading: string | null;
  /** The local aisle's icon, on its first item. */
  icon?: string;
  /** What is still to get in the item's group. */
  left: number;
}

/** The groups as one run of rows, for views that cut the list into pages or columns. */
export function wallGroceryFlatRows(
  groups: readonly WallGroceryShownGroup[],
  heading: (group: WallGroceryGroup) => string | null,
): WallGroceryFlatRow[] {
  return groups.flatMap((group) => {
    const h = heading(group);
    const icon = group.aisle ? GROCERY_CATEGORY_ICONS[group.aisle] : undefined;
    return group.items.map((item, i) => ({
      item,
      heading: i === 0 ? h : null,
      ...(i === 0 && icon ? { icon } : {}),
      left: group.left,
    }));
  });
}
