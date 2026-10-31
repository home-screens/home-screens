import type { MealSettings, MealSlotType, PlannedMeal, SavedMeal, WeekStartDay } from '@/types/config';
import type { MealieFailure } from './mealie';
import { fromISODate, getWeekRange, toISODate } from './meal-constants';

/**
 * Where the plan a surface draws comes from, decided once for everyone.
 *
 * The plan lives either in `meals.json` or, once the family switches it, in
 * Mealie. `GET /api/meals/data` answers with both: the stored data as always,
 * plus a `mealie` block holding Mealie's plan for the weeks around today. The
 * wall modules, the full-screen calendar, the phone and the editor each turn
 * that answer into the plan they draw through `mergeMealSources`, so no
 * surface can show the local plan while another shows Mealie's.
 */

/** Mealie's plan as `GET /api/meals/data` hands it over. */
export interface MealieWireBlock {
  /** `ok`: fresh from Mealie. `stale`: Mealie is not answering, this is the last good copy. `failed`: no copy at all. */
  status: 'ok' | 'stale' | 'failed';
  failure?: MealieFailure;
  plan: PlannedMeal[];
  /** The Mealie recipes the plan uses, as saved meals. */
  meals: SavedMeal[];
  /** The days this block covers, inclusive. */
  range: { start: string; end: string };
  /** When Mealie gave this answer (ms since epoch); null when it never has. */
  fetchedAt: number | null;
  /** Mealie's address, for Open Mealie links. */
  baseUrl?: string;
}

export interface MealSourceSnapshot {
  plan?: PlannedMeal[];
  savedMeals?: SavedMeal[];
  mealie?: MealieWireBlock | null;
}

export interface MergedMeals {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  source: 'local' | 'mealie';
  /** Present in Mealie mode, for status lines and Open Mealie links. */
  mealie: MealieWireBlock | null;
}

/**
 * The plan and meals to draw.
 *
 * In Mealie mode Mealie's plan replaces the local one outright, even when
 * the block is missing or Mealie never answered: showing the old local plan
 * there would put meals on the wall that the family moved to Mealie and may
 * have changed since. The local plan is untouched in `meals.json` and is
 * what every surface shows again once the family switches back.
 */
export function mergeMealSources(data: MealSourceSnapshot, settings: Pick<MealSettings, 'planSource'>): MergedMeals {
  if (settings.planSource === 'mealie') {
    const mealie = data.mealie ?? null;
    return { plan: mealie?.plan ?? [], savedMeals: mealie?.meals ?? [], source: 'mealie', mealie };
  }
  return { plan: data.plan ?? [], savedMeals: data.savedMeals ?? [], source: 'local', mealie: null };
}

/** Whether a surface may change the plan right now: Mealie's only while Mealie is answering. */
export function canEditMergedPlan(merged: MergedMeals): boolean {
  return merged.source === 'local' || merged.mealie?.status === 'ok';
}

/** Weeks before the current one the hub reads from Mealie for every surface. */
export const MEALIE_WINDOW_WEEKS_BEFORE = 1;
/** Weeks after the current one. */
export const MEALIE_WINDOW_WEEKS_AFTER = 3;

/**
 * The days the hub reads from Mealie for every surface: the week before this
 * one, this one, and the three after it, aligned to the household's week. That
 * covers every wall view and the phone's usual paging; the phone asks for
 * other weeks on their own.
 */
export function mealieReadWindow(todayISO: string, weekStartDay: WeekStartDay): { start: string; end: string } {
  const { start } = getWeekRange(fromISODate(todayISO), weekStartDay);
  const from = fromISODate(start);
  from.setDate(from.getDate() - 7 * MEALIE_WINDOW_WEEKS_BEFORE);
  const to = fromISODate(start);
  to.setDate(to.getDate() + 7 * (MEALIE_WINDOW_WEEKS_AFTER + 1) - 1);
  return { start: toISODate(from), end: toISODate(to) };
}

/** One meal as a surface wants it after an edit, as `PUT /api/mealie/plan` takes it. */
export interface MealieCellChange {
  date: string;
  slot: MealSlotType;
  /** The `sourceId`s the meal held in the copy the edit was made on. */
  before: string[];
  /** The meal as it should read now; null clears it. */
  after: PlannedMeal | null;
}

/** Every Mealie entry a meal is made of: its main dish, then its courses. */
export function planEntrySourceIds(entry: PlannedMeal | undefined): string[] {
  if (!entry) return [];
  const ids = entry.sourceId ? [entry.sourceId] : [];
  for (const c of entry.courses ?? []) if (c.sourceId) ids.push(c.sourceId);
  return ids;
}

function sameEntry(a: PlannedMeal, b: PlannedMeal): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The meals an edit changed, for writing to Mealie. A surface edits Mealie's
 * plan with the same plan actions it uses on its own (`meal-plan-actions.ts`,
 * `meal-courses.ts`); this compares the plan before and after and keeps only
 * the meals that differ, each with the entries it held before.
 */
export function planCellChanges(before: PlannedMeal[], after: PlannedMeal[]): MealieCellChange[] {
  const key = (p: PlannedMeal) => `${p.date}|${p.slot}`;
  const was = new Map(before.map((p) => [key(p), p]));
  const now = new Map(after.map((p) => [key(p), p]));
  const changes: MealieCellChange[] = [];
  for (const k of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(k);
    const b = now.get(k);
    if (a === b || (a && b && sameEntry(a, b))) continue;
    const [date, slot] = k.split('|') as [string, MealSlotType];
    changes.push({ date, slot, before: planEntrySourceIds(a), after: b ?? null });
  }
  return changes.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.slot < y.slot ? -1 : 1));
}

/** Mealie's own meal planner page, for Open Mealie. */
export function mealiePlannerUrl(baseUrl: string): string {
  return `${baseUrl}/household/mealplan/planner/view`;
}

/** Mealie's shopping lists page. */
export function mealieShoppingListsUrl(baseUrl: string): string {
  return `${baseUrl}/shopping-lists`;
}

/**
 * What a surface says about where its plan came from. `local`: nothing (the
 * plan is Home Screens' own). `ok`: fresh from Mealie. `stale`: Mealie is not
 * answering, this is the copy from `updatedAt`; planning waits. `unreachable`:
 * Mealie never answered and there is no copy at all.
 */
/**
 * Why there is no plan from Mealie, in the words a family can act on: its
 * address or token is not saved, Mealie refused the token, or Mealie is not
 * answering. Only the last is fixed by waiting.
 */
export type MealieProblem = 'not-connected' | 'token' | 'unreachable';

export function mealieProblem(failure: MealieFailure | undefined): MealieProblem {
  if (failure === 'not-set-up') return 'not-connected';
  if (failure === 'key-rejected') return 'token';
  return 'unreachable';
}

export type MealieStatus =
  | { state: 'local' }
  | { state: 'ok'; updatedAt: number | null; baseUrl?: string }
  | { state: 'stale'; updatedAt: number | null; baseUrl?: string }
  | { state: 'unreachable'; baseUrl?: string; problem: MealieProblem };

export function mealieStatus(merged: Pick<MergedMeals, 'source' | 'mealie'>): MealieStatus {
  if (merged.source === 'local') return { state: 'local' };
  const block = merged.mealie;
  if (!block || block.status === 'failed') return { state: 'unreachable', baseUrl: block?.baseUrl, problem: mealieProblem(block?.failure) };
  return { state: block.status, updatedAt: block.fetchedAt, baseUrl: block.baseUrl };
}

/** True when `outer` holds every day of `inner`. */
export function rangeCovers(outer: { start: string; end: string } | undefined, inner: { start: string; end: string }): boolean {
  return !!outer && outer.start <= inner.start && outer.end >= inner.end;
}

/** The smallest range holding both. */
export function unionRange(a: { start: string; end: string }, b: { start: string; end: string }): { start: string; end: string } {
  return { start: a.start < b.start ? a.start : b.start, end: a.end > b.end ? a.end : b.end };
}
