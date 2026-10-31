import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { replaceWeekInPlan, copyWeekEntries } from './meal-constants';
import { generateRandomPlan } from './meal-shuffle';
import { planEntryHasContent } from './meal-courses';

/**
 * What the meal planner's actions do to the plan and the saved-meal library,
 * as pure transforms.
 *
 * Three surfaces drive these: /remote's Meals tab, which holds the plan in
 * React state and PUTs after each change, and the editor's meal-planner modal,
 * which is fully controlled and hands every change up through `onUpdate`. They
 * cannot share the stateful hooks - the modal has no state to put in them, and
 * the two deliberately differ on destructive actions (the editor acts and
 * offers an undo toast, the phone confirms first). What they had no business
 * writing twice is this: what "assign a meal to Tuesday dinner" actually does
 * to an array.
 *
 * It had already cost one double fix. Copying last week's plan has to build the
 * previous window with the household's `weekStartDay` or the seven days are
 * shifted by one for a Monday-start household; both copies carry that fix,
 * found and applied separately.
 *
 * Every transform returns the array it was given, unchanged and by identity,
 * when the action is a no-op. Callers use that to skip a save.
 */

/**
 * Put a meal in a slot, replacing whatever was there.
 *
 * The existing entry's own fields (`time`, `notes`, `customText`) are kept:
 * swapping Tuesday's dinner for a different meal should not silently drop the
 * serving time somebody set for it.
 */
export function assignPlanSlot(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  mealId: string,
): PlannedMeal[] {
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  const rest = plan.filter((p) => !(p.date === date && p.slot === slot));
  return [...rest, { ...(existing ?? {}), date, slot, mealId }];
}

/**
 * Put a typed-in meal in a slot: "Tacos" for tonight, without it first having
 * to become a library entry.
 *
 * `customText` has always been part of a plan entry and nothing could write
 * one. Typing over a saved meal replaces it rather than sitting alongside it,
 * so the slot shows one dinner, and blank text empties the slot, which is what
 * backspacing the last character plainly means.
 *
 * Every surface that draws a plan reads `plannedMealName` rather than
 * `meal.name`, because an entry holding only typed text has no library meal
 * behind it. The first version of this shipped without that: the phone showed
 * the dinner and the wall showed an empty slot.
 */
export function setPlanSlotText(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  text: string,
): PlannedMeal[] {
  const trimmed = text.trim();
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  const rest = plan.filter((p) => !(p.date === date && p.slot === slot));
  if (!trimmed) {
    if (!existing) return plan;
    // Emptying the main dish keeps the meal's courses: the sides and the
    // dessert are still planned, only the dish they went with is gone.
    if (!existing.courses?.length) return rest;
    const kept: PlannedMeal = { ...existing };
    delete kept.mealId;
    delete kept.customText;
    return [...rest, kept];
  }
  const next: PlannedMeal = { ...(existing ?? {}), date, slot, customText: trimmed };
  delete next.mealId;
  return [...rest, next];
}

/**
 * Whether putting `pick` (a meal by id, or typed text) in place of a slot's
 * main dish, or of its course at `courseIndex`, changes one dish for another:
 * the change a notice offers to take back, since one tap in the picker made
 * it. Filling an empty place, or picking the dish already there, replaces
 * nothing.
 */
export function replacesDish(
  entry: PlannedMeal | undefined,
  courseIndex: number | null,
  pick: { mealId?: string; customText?: string },
): boolean {
  const dish = courseIndex === null ? entry : entry?.courses?.[courseIndex];
  const typed = dish?.customText?.trim();
  if (!dish || (!dish.mealId && !typed)) return false;
  if (pick.mealId) return dish.mealId !== pick.mealId;
  return !!dish.mealId || typed !== pick.customText?.trim();
}

/** Empty one slot: its main dish and every course with it. */
export function clearPlanSlot(plan: PlannedMeal[], date: string, slot: MealSlotType): PlannedMeal[] {
  return plan.filter((p) => !(p.date === date && p.slot === slot));
}

/**
 * Set or clear one slot's serving time.
 *
 * An empty string counts as a clear and removes the field: `HH:MM` is the only
 * shape the readers accept, and a stored `""` fails `isValidTimeString` on the
 * next read. A slot with no meal in it has no time to set, so that is a no-op.
 */
export function setPlanSlotTime(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  time: string | undefined,
): PlannedMeal[] {
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  if (!existing) return plan;
  const updated: PlannedMeal = { ...existing };
  if (time) {
    updated.time = time;
  } else {
    delete updated.time;
  }
  return plan.map((p) => (p === existing ? updated : p));
}

/** Drop every entry in the given week, leaving the other weeks alone. */
export function clearPlanWeek(plan: PlannedMeal[], weekDates: readonly string[]): PlannedMeal[] {
  const inWeek = new Set(weekDates);
  return plan.filter((p) => !inWeek.has(p.date));
}

/**
 * Fill the given week with suggested meals from the library
 * (`generateRandomPlan`), replacing whatever that week held. Other weeks are
 * untouched, and tell it which slot each meal is usually planned in. A
 * household with no saved meals has nothing to pick from.
 */
export function shufflePlanWeek(
  plan: PlannedMeal[],
  savedMeals: SavedMeal[],
  slots: MealSlotType[],
  weekDates: string[],
  random?: () => number,
): PlannedMeal[] {
  if (savedMeals.length === 0) return plan;
  const inWeek = new Set(weekDates);
  const history = plan.filter((p) => !inWeek.has(p.date));
  return replaceWeekInPlan(plan, weekDates, generateRandomPlan(savedMeals, slots, weekDates, { history, random }));
}

/**
 * Suggest's picks for the week, made once: the week's new entries, for an
 * edit that only places them (`placePlanWeek`). Both surfaces run an edit
 * twice, once for the screen and again for the save (and again on a newer
 * copy after a conflict); a pick made inside the edit showed one week and
 * saved another.
 */
export function suggestPlanWeek(
  plan: PlannedMeal[],
  savedMeals: SavedMeal[],
  slots: MealSlotType[],
  weekDates: string[],
  random?: () => number,
): PlannedMeal[] {
  const inWeek = new Set(weekDates);
  return shufflePlanWeek(plan, savedMeals, slots, weekDates, random).filter((p) => inWeek.has(p.date));
}

/**
 * Put `entries` in place of whatever the given week holds, leaving the other
 * weeks alone: a suggested week going in, or the week as it was coming back
 * on Undo.
 */
export function placePlanWeek(plan: PlannedMeal[], weekDates: readonly string[], entries: PlannedMeal[]): PlannedMeal[] {
  return [...clearPlanWeek(plan, weekDates), ...entries];
}

/**
 * Restamp one week's entries onto another. `fromDates` and `toDates` must both
 * be built with the household's `weekStartDay`, or the windows are shifted by a
 * day for a Monday-start household. An empty source week is a no-op.
 */
export function copyPlanWeek(
  plan: PlannedMeal[],
  fromDates: string[],
  toDates: string[],
): PlannedMeal[] {
  const restamped = copyWeekEntries(plan, fromDates, toDates);
  if (restamped.length === 0) return plan;
  return replaceWeekInPlan(plan, toDates, restamped);
}

/** Add a meal to the library, or replace the one that already has its id. */
export function upsertSavedMeal(savedMeals: SavedMeal[], meal: SavedMeal): SavedMeal[] {
  const known = savedMeals.some((m) => m.id === meal.id);
  return known ? savedMeals.map((m) => (m.id === meal.id ? meal : m)) : [...savedMeals, meal];
}

/**
 * Remove a meal from the library and every plan entry pointing at it.
 *
 * Both halves move together: a plan entry whose meal no longer exists renders
 * as an empty slot the user cannot clear. The meal goes from wherever it was
 * planned, as the main dish or as a course; the rest of each meal stays, and
 * an entry left with nothing in it goes too.
 */
export function removeSavedMeal(
  savedMeals: SavedMeal[],
  plan: PlannedMeal[],
  mealId: string,
): { savedMeals: SavedMeal[]; plan: PlannedMeal[] } {
  const nextPlan: PlannedMeal[] = [];
  for (const p of plan) {
    const mainGoes = p.mealId === mealId;
    const coursesGo = p.courses?.some((c) => c.mealId === mealId) ?? false;
    if (!mainGoes && !coursesGo) {
      nextPlan.push(p);
      continue;
    }
    const next: PlannedMeal = { ...p };
    if (mainGoes) delete next.mealId;
    if (coursesGo) {
      const courses = p.courses!.filter((c) => c.mealId !== mealId);
      if (courses.length > 0) next.courses = courses;
      else delete next.courses;
    }
    if (planEntryHasContent(next)) nextPlan.push(next);
  }
  return { savedMeals: savedMeals.filter((m) => m.id !== mealId), plan: nextPlan };
}

/**
 * The plan entries `removeSavedMeal` would change: every meal the dish is
 * planned in, as the main dish or as a course. What a delete asks about
 * (the days) and what its Undo puts back.
 */
export function plannedEntriesOfMeal(plan: PlannedMeal[], mealId: string): PlannedMeal[] {
  return plan.filter((p) => p.mealId === mealId || (p.courses?.some((c) => c.mealId === mealId) ?? false));
}

/**
 * Undo a delete: the meal goes back in the library and `entries` (from
 * `plannedEntriesOfMeal`, taken before the delete) back on the plan as they
 * were, over whatever has been planned in those slots since.
 */
export function restoreSavedMeal(
  savedMeals: SavedMeal[],
  plan: PlannedMeal[],
  meal: SavedMeal,
  entries: PlannedMeal[],
): { savedMeals: SavedMeal[]; plan: PlannedMeal[] } {
  return { savedMeals: upsertSavedMeal(savedMeals, meal), plan: restorePlanEntries(plan, entries) };
}

/** Star or unstar a saved meal. */
export function toggleSavedMealFavorite(savedMeals: SavedMeal[], mealId: string): SavedMeal[] {
  return savedMeals.map((m) => (m.id === mealId ? { ...m, isFavorite: !m.isFavorite } : m));
}

/**
 * Put entries back into the plan exactly as they were, replacing whatever has
 * been planned into their slots since. For undoing a deletion or a cleared
 * week: `assignPlanSlot` would rebuild them from date, slot and meal alone and
 * lose the serving time and notes the entries carried.
 */
export function restorePlanEntries(plan: PlannedMeal[], entries: PlannedMeal[]): PlannedMeal[] {
  return entries.reduce((next, entry) => [...clearPlanSlot(next, entry.date, entry.slot), entry], plan);
}
