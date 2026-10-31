import type { MealSettings, MealSlotType } from '@/types/config';
import { readMealData, updateMealData } from './meal-data';
import { householdToday } from './household-day';
import { mealieReadWindow, type MealieCellChange, type MealieWireBlock } from './meal-sources';
import {
  clearMealiePlanCache,
  createMealieEntry,
  createRandomMealieEntry,
  deleteMealieEntry,
  listMealieCategories,
  listMealieRules,
  MealieError,
  pickMealieRecipes,
  readMealiePlan,
  updateMealieEntry,
  type MealieFailure,
  type MealiePlanEntry,
} from './mealie';
import {
  cellToMealieOps,
  groupMealieEntries,
  isUnchanged,
  mealieEntriesToPlan,
  mealieRuleCovers,
  mealieSourceId,
  type MealieEntryExtra,
  type MealieExtras,
} from './mealie-map';
import { fromISODate, toISODate } from './meal-constants';
import { dinnerCategories } from './meal-dish-rules';
import { logger } from './logger';

const log = logger('mealie-plan');

/**
 * Mealie's plan on the hub: read for every surface, and written back when the
 * phone or the editor changes a meal. The mapping rules live in
 * `mealie-map.ts`; this file is the part that talks to Mealie and to
 * `meals.json`.
 */

/** Weeks of hub notes on past Mealie entries worth keeping, matching how long the local plan keeps its past. */
const EXTRAS_KEEP_WEEKS = 12;

/** Mealie's plan for `range`, ready for the wire. Never throws: a Mealie problem is a status. */
export async function buildMealieBlock(range: { start: string; end: string }, extras: MealieExtras | undefined): Promise<MealieWireBlock> {
  const result = await readMealiePlan(range.start, range.end);
  if (result.status === 'failed') {
    return { status: 'failed', failure: result.failure, plan: [], meals: [], range, fetchedAt: null };
  }
  const { read } = result;
  const { plan, meals } = mealieEntriesToPlan(read.entries, { baseUrl: read.baseUrl, groupSlug: read.groupSlug, extras: extras ?? {} });
  return {
    status: result.status,
    ...(result.status === 'stale' ? { failure: result.failure } : {}),
    plan,
    meals,
    range,
    fetchedAt: read.fetchedAt,
    baseUrl: read.baseUrl,
  };
}

/** The block every surface gets with `GET /api/meals/data`: the weeks around the household's today. */
export async function buildDefaultMealieBlock(settings: MealSettings, extras: MealieExtras | undefined): Promise<MealieWireBlock> {
  return buildMealieBlock(mealieReadWindow(await householdToday(), settings.weekStartDay), extras);
}

// ── Saving ──

export type { MealieCellChange };

export type MealieSaveResult =
  | { ok: true }
  /** Somebody changed one of these meals in Mealie since the copy the edit was made on. */
  | { ok: false; reason: 'conflict' }
  /** Mealie stopped part way; what it did take is in Mealie, the rest is not. */
  | { ok: false; reason: 'partial'; failure: MealieFailure }
  /** Nothing was written. */
  | { ok: false; reason: 'failed'; failure: MealieFailure };

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

function cutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - EXTRAS_KEEP_WEEKS * 7);
  return toISODate(d);
}

/**
 * Write changed meals to Mealie.
 *
 * The days are read fresh first, and a meal whose entries are no longer the
 * ones the edit was made on is a conflict: nothing is written and the caller
 * answers with Mealie's current plan for the surface to re-apply its edit to,
 * the same contract as a 409 from `PUT /api/meals/data`. Otherwise each meal
 * becomes its creates, updates and deletes (`cellToMealieOps`), and the hub's
 * notes (serving times, which meal a side belongs to) are updated beside them.
 */
export async function saveMealieCells(changes: MealieCellChange[]): Promise<MealieSaveResult> {
  if (changes.length === 0) return { ok: true };
  const dates = changes.map((c) => c.date).sort();
  const read = await readMealiePlan(dates[0], dates[dates.length - 1], { fresh: true });
  if (read.status !== 'ok') return { ok: false, reason: 'failed', failure: read.failure };

  const stored = await readMealData();
  const extras: MealieExtras = { ...(stored.mealieExtras ?? {}) };
  const cells = groupMealieEntries(read.read.entries, extras);

  for (const change of changes) {
    const current = (cells.get(`${change.date}|${change.slot}`) ?? []).map(mealieSourceId);
    if (!sameSet(current, change.before)) {
      // Mealie changed behind the hub's back (another hub, or Mealie itself):
      // the cached plan is out of date too. The answer the surface re-applies
      // its edit to must be read fresh, or it would conflict again on the
      // same old copy until it gave up.
      clearMealiePlanCache();
      return { ok: false, reason: 'conflict' };
    }
  }

  // Every meal is worked out before anything is written, so a meal Mealie
  // cannot hold (one from the Home Screens library) refuses the whole save
  // instead of leaving the meals before it written.
  const planned = changes.map((change) => ({
    change,
    ops: cellToMealieOps(cells.get(`${change.date}|${change.slot}`) ?? [], change.date, change.slot, change.after),
  }));

  const setExtras: Record<string, MealieEntryExtra> = {};
  const dropExtras = new Set<string>();
  let wrote = false;
  try {
    for (const { change, ops } of planned) {
      for (const desired of ops.entries) {
        let id: number;
        if (desired.existing && isUnchanged(desired)) {
          id = desired.existing.id;
        } else if (desired.existing) {
          id = (await updateMealieEntry(desired.existing, desired.write)).id;
          wrote = true;
        } else {
          id = (await createMealieEntry(desired.write)).id;
          wrote = true;
        }
        if (desired.extra) setExtras[String(id)] = { ...desired.extra, date: change.date, type: desired.write.entryType };
        else dropExtras.add(String(id));
      }
      for (const id of ops.deletes) {
        await deleteMealieEntry(id);
        dropExtras.add(String(id));
        wrote = true;
      }
    }
  } catch (err) {
    const failure: MealieFailure = err instanceof MealieError ? err.failure : 'upstream';
    log.warn('Mealie save stopped part way', failure);
    await storeExtras(setExtras, dropExtras);
    clearMealiePlanCache();
    return wrote ? { ok: false, reason: 'partial', failure } : { ok: false, reason: 'failed', failure };
  }

  await storeExtras(setExtras, dropExtras);
  clearMealiePlanCache();
  return { ok: true };
}

/** Put the hub's notes on the entries a save touched, and forget notes on entries long past. */
async function storeExtras(set: Record<string, MealieEntryExtra>, drop: Set<string>): Promise<void> {
  if (Object.keys(set).length === 0 && drop.size === 0) return;
  const cutoff = cutoffDate();
  await updateMealData((data) => {
    const next: MealieExtras = {};
    for (const [id, extra] of Object.entries(data.mealieExtras ?? {})) {
      if (drop.has(id) || extra.date < cutoff) continue;
      next[id] = extra;
    }
    Object.assign(next, set);
    const result = { ...data };
    if (Object.keys(next).length > 0) result.mealieExtras = next;
    else delete result.mealieExtras;
    return result;
  });
}

/** True when `date` is a real `YYYY-MM-DD` day. */
export function isPlanDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return toISODate(fromISODate(date)) === date;
}

export type MealieSuggestResult =
  /** `entries`: the meals Mealie filled, with the entry each became, so a surface can take them back. */
  | { ok: true; created: number; skipped: number; entries: { date: string; slot: MealSlotType; sourceId: string }[] }
  | { ok: false; failure: MealieFailure };

/**
 * Fill the empty meals among `cells` with Mealie's own picks, which follow the
 * household's meal plan rules in Mealie (Friday is pizza night, desserts from
 * the Dessert category). Meals that already hold anything are left alone, so
 * nothing the family planned is replaced. A meal Mealie has no recipe for
 * under its rules is skipped and counted.
 */
export async function suggestMealieMeals(cells: { date: string; slot: MealSlotType }[]): Promise<MealieSuggestResult> {
  if (cells.length === 0) return { ok: true, created: 0, skipped: 0, entries: [] };
  const dates = cells.map((c) => c.date).sort();
  const read = await readMealiePlan(dates[0], dates[dates.length - 1], { fresh: true });
  if (read.status !== 'ok') return { ok: false, failure: read.failure };
  const stored = await readMealData();
  const filled = groupMealieEntries(read.read.entries, stored.mealieExtras ?? {});
  let created = 0;
  let skipped = 0;
  const entries: { date: string; slot: MealSlotType; sourceId: string }[] = [];
  try {
    const empty = cells.filter((cell) => !filled.get(`${cell.date}|${cell.slot}`)?.length);
    // Mealie's own pick follows the household's rules there, but without one
    // it takes any recipe at all, cake for dinner included. A dinner no rule
    // covers is picked here instead, from the household's dinner categories.
    const rules = empty.length > 0 ? await listMealieRules() : [];
    const ours = empty.filter((cell) => cell.slot === 'dinner' && !mealieRuleCovers(rules, cell.date, cell.slot));
    const picks = ours.length > 0 ? await pickMealieRecipes(ours.length, dinnerCategories(await listMealieCategories())) : [];
    for (const cell of empty) {
      try {
        let entry: MealiePlanEntry;
        if (ours.includes(cell)) {
          const recipe = picks.shift();
          if (!recipe) {
            skipped += 1;
            continue;
          }
          entry = await createMealieEntry({ date: cell.date, entryType: cell.slot, recipeId: recipe.id, title: '', text: '' });
        } else {
          entry = await createRandomMealieEntry(cell.date, cell.slot);
        }
        entries.push({ date: cell.date, slot: cell.slot, sourceId: mealieSourceId(entry) });
        created += 1;
      } catch (err) {
        // No recipe fits the rules for this meal: Mealie refuses that one.
        if (err instanceof MealieError && err.failure === 'upstream') skipped += 1;
        else throw err;
      }
    }
  } catch (err) {
    clearMealiePlanCache();
    if (created > 0) log.warn('Mealie suggestions stopped part way');
    return { ok: false, failure: err instanceof MealieError ? err.failure : 'upstream' };
  }
  clearMealiePlanCache();
  return { ok: true, created, skipped, entries };
}
