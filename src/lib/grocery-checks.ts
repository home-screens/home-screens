import type { PlannedMeal, WeekStartDay } from '@/types/config';
import { fromISODate, getWeekRange, toISODate } from './meal-constants';
import { itemTextKey } from './todo-actions';

/**
 * Grocery ticks, one list per week.
 *
 * The grocery list is built from one week's planned meals, so what has been
 * bought belongs to that week's list. The ticks used to be one list of names
 * for every week: tortillas bought this week showed as bought on next week's
 * list and every week after, and nothing ever cleared them. Every surface that
 * reads or writes ticks (the phone, the editor's meal plan dialog, the hub's
 * routes) goes through these rules, so they all key a week the same way.
 */

/**
 * Item names (as `groceryItemKey` keeps them) ticked off each week's list,
 * keyed by the YYYY-MM-DD the week starts on (the household's week start day).
 */
export type GroceryChecked = Record<string, string[]>;

export type GroceryCheckDirection = 'check' | 'uncheck';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NONE: readonly string[] = Object.freeze([]);

/**
 * An item's stored form: what every writer saves and every reader compares.
 * The rule every list keeps (`itemTextKey`), so "Crème fraîche" from one meal
 * and "creme fraiche" from another are one item with one tick.
 */
export function groceryItemKey(name: string): string {
  return itemTextKey(name);
}

/** The key one week's ticks live under: the first day of the week holding `date` (YYYY-MM-DD). */
export function groceryWeekKey(date: string, weekStartDay: WeekStartDay): string {
  return getWeekRange(fromISODate(date), weekStartDay).start;
}

/** The ticks on one week's list (`week` is that week's key). */
export function groceryChecksForWeek(checked: GroceryChecked, week: string): readonly string[] {
  return Object.hasOwn(checked, week) ? checked[week] : NONE;
}

/**
 * What a tap on an item means, from what the surface shows: tick it, or
 * untick it. Sent as that, never as "flip it": a second phone still showing
 * the item unticked would otherwise untick what the first one just ticked.
 */
export function groceryTapDirection(checked: GroceryChecked, week: string, item: string): GroceryCheckDirection {
  return groceryChecksForWeek(checked, week).includes(groceryItemKey(item)) ? 'uncheck' : 'check';
}

/** `checked` with one week's list replaced; an empty list drops the week. */
export function withGroceryWeek(checked: GroceryChecked, week: string, items: readonly string[]): GroceryChecked {
  const rest = Object.fromEntries(Object.entries(checked).filter(([key]) => key !== week));
  return items.length > 0 ? { ...rest, [week]: [...items] } : rest;
}

/**
 * Tick (`check`), untick (`uncheck`) or flip (no direction) one item on one
 * week's list. Hands back `checked` itself when nothing moves, so a caller can
 * tell a repeat from a change and skip the write.
 */
export function setGroceryCheck(
  checked: GroceryChecked,
  week: string,
  item: string,
  direction?: GroceryCheckDirection,
): GroceryChecked {
  const name = groceryItemKey(item);
  const list = groceryChecksForWeek(checked, week);
  const ticked = list.includes(name);
  if (ticked && direction !== 'check') return withGroceryWeek(checked, week, list.filter((n) => n !== name));
  if (!ticked && direction !== 'uncheck') return withGroceryWeek(checked, week, [...list, name]);
  return checked;
}

/**
 * Drop the ticks of weeks the plan has no meals in any more. A week's list is
 * built from its planned meals, so once the plan forgets a week (it keeps 12,
 * see `prunePlan`) or the week is cleared, nothing can show its ticks again.
 * This keeps the stored ticks bounded by the plan rather than growing forever,
 * while every list the planner can still show keeps its ticks. Hands back
 * `checked` itself when nothing is dropped.
 */
export function pruneGroceryChecked(
  checked: GroceryChecked,
  plan: PlannedMeal[],
  weekStartDay: WeekStartDay,
): GroceryChecked {
  const planned = new Set(plan.map((entry) => groceryWeekKey(entry.date, weekStartDay)));
  const weeks = Object.keys(checked);
  if (weeks.every((week) => planned.has(week))) return checked;
  return Object.fromEntries(Object.entries(checked).filter(([week]) => planned.has(week)));
}

/**
 * Move each week's ticks to the matching week after the household changes its
 * week start day. The old week and the new one holding its middle day share
 * six days, so a list half-shopped on Sunday-start weeks stays half-shopped on
 * Monday-start ones instead of quietly starting over.
 */
export function rekeyGroceryChecked(checked: GroceryChecked, weekStartDay: WeekStartDay): GroceryChecked {
  const out: GroceryChecked = {};
  for (const [week, items] of Object.entries(checked)) {
    const middle = fromISODate(week);
    middle.setDate(middle.getDate() + 3);
    const key = groceryWeekKey(toISODate(middle), weekStartDay);
    out[key] = [...new Set([...(out[key] ?? []), ...items])];
  }
  return out;
}

/** Whether `raw` is a well-formed tick map, for writers that refuse rather than repair. */
export function isGroceryChecked(raw: unknown): raw is GroceryChecked {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && Object.entries(raw).every(([week, items]) =>
      ISO_DATE.test(week) && Array.isArray(items) && items.every((name) => typeof name === 'string'));
}

/**
 * Read stored or received ticks. Anything that is not a map of week to names
 * reads as nothing ticked, including the single list for every week that
 * older builds kept: it cannot be split back into weeks.
 */
export function normalizeGroceryChecked(raw: unknown): GroceryChecked {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: GroceryChecked = {};
  for (const [week, items] of Object.entries(raw)) {
    if (!ISO_DATE.test(week) || !Array.isArray(items)) continue;
    const names = items.filter((name): name is string => typeof name === 'string').map(groceryItemKey).filter(Boolean);
    if (names.length > 0) out[week] = [...new Set(names)];
  }
  return out;
}
