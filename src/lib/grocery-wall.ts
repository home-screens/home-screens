import type { ShoppingList } from './shopping-list';
import { groceryListNeedsHeadings } from './grocery-utils';

/**
 * The grocery list as the wall draws it, from either list the family keeps:
 * this week's list built from planned meals (`generateGroceryList`, the same
 * one the phone shows), or the Mealie list the family shops from. Pure, so
 * the small and the full-screen Grocery views agree.
 */

export interface WallGroceryItem {
  /** What a tick names: a Mealie item's id, or the local list's lowercase item name. */
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

export interface WallGroceryRows {
  groups: WallGroceryGroup[];
  /** Items still to get. */
  left: number;
  /** Items ticked. */
  got: number;
}

/** The local list, aisle by aisle; headings only when there is more than one aisle, as on the phone. */
export function wallGroceryFromLocal(
  list: Map<string, { items: Array<{ name: string; amount: string; checked: boolean }> }>,
): WallGroceryGroup[] {
  const headed = groceryListNeedsHeadings(list);
  return [...list.entries()].map(([aisle, { items }]) => ({
    key: aisle,
    label: null,
    ...(headed ? { aisle } : {}),
    items: items.map((i) => ({
      id: i.name.toLowerCase(),
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
 * of the whole list.
 */
export function wallGroceryRows(
  groups: readonly WallGroceryGroup[],
  ticks: ReadonlyMap<string, boolean>,
  keep: ReadonlySet<string>,
): WallGroceryRows {
  let left = 0;
  let got = 0;
  const shown: WallGroceryGroup[] = [];
  for (const group of groups) {
    const items: WallGroceryItem[] = [];
    for (const item of group.items) {
      const checked = ticks.get(item.id) ?? item.checked;
      if (checked) got++;
      else left++;
      if (!checked || keep.has(item.id)) items.push(checked === item.checked ? item : { ...item, checked });
    }
    if (items.length > 0) shown.push({ ...group, items });
  }
  return { groups: shown, left, got };
}
