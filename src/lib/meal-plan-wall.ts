import type {
  FullscreenMealPlannerConfig, MealCourseKind, MealPlannerConfig, MealSlotType, PlannedMeal, SavedMeal, ScreenConfiguration, WeekStartDay,
} from '@/types/config';
import { someConfigModule } from './config-modules';
import { fromISODate, getWeekDatesForRange, toISODate } from './meal-constants';
import { COURSE_KINDS, MAX_COURSES, addPlanCourse, planEntryHasContent, removePlanCourse } from './meal-courses';
import { assignPlanSlot, setPlanSlotText } from './meal-plan-actions';
import { courseKindFromTags, isMealieMeal } from './meal-dish-rules';
import { mealHasRecipe } from './meal-recipe';

/**
 * What the wall may do to the menu. A Pi kiosk holds the display token, and
 * so does any address on the sign-in bypass list, so the hub takes a change
 * to the plan from that token only where a meal card on some wall has
 * "Plan meals on the wall" on, only one meal at a time, only a recipe (never
 * typed words), and only for this week and next. Everything else about the
 * plan stays with the phone and the editor.
 *
 * The cards, the sheet and the hub all read these rules, so a wall never
 * offers what the hub would refuse, and what a tap does to a day is decided
 * once. Pure: no server imports.
 */

/** How many weeks the wall plans for, counting this one. */
export const WALL_PLAN_WEEKS = 2;

/** A meal card lets the wall plan: taps on (omitted means on, as everywhere in the meal planner) and planning on. */
export function mealCardPlans(config: Partial<MealPlannerConfig> | Partial<FullscreenMealPlannerConfig>): boolean {
  return config.interactive !== false && !!config.wallPlan;
}

/** Whether some meal card a wall draws lets the wall plan. A card switched off, or left in the old top-level screens, counts for nothing. */
export function wallMayPlanMeals(config: ScreenConfiguration): boolean {
  return someConfigModule(config, (mod, site) => {
    if (!site.live || mod.enabled === false) return false;
    if (mod.type !== 'meal-planner' && mod.type !== 'fullscreen-meal-planner') return false;
    return mealCardPlans(mod.config as Partial<MealPlannerConfig>);
  });
}

/**
 * Whether the wall can plan this recipe: it has to live where the plan does.
 * A plan kept in Mealie takes Mealie's recipes; a plan kept in Home Screens
 * takes the saved meals that have a recipe. (With Mealie connected but the
 * plan kept here, the recipe book shows Mealie's recipes, and those cannot
 * go on this plan.)
 */
export function wallCanPlanMeal(meal: SavedMeal | null | undefined, planInMealie: boolean): meal is SavedMeal {
  if (!meal) return false;
  return planInMealie ? isMealieMeal(meal) : !isMealieMeal(meal) && mealHasRecipe(meal);
}

/** The weeks the wall plans for, each as its seven days in the household's week: this week first. */
export function wallPlanWeeks(todayISO: string, weekStartDay: WeekStartDay): string[][] {
  const first = getWeekDatesForRange(todayISO, weekStartDay);
  const weeks = [first];
  for (let i = 1; i < WALL_PLAN_WEEKS; i++) {
    const start = fromISODate(first[0]);
    start.setDate(start.getDate() + 7 * i);
    weeks.push(getWeekDatesForRange(toISODate(start), weekStartDay));
  }
  return weeks;
}

/** Whether the wall may plan `date`: today or later, and inside the weeks it plans for. Days gone by are closed. */
export function wallPlanDayOpen(date: string, todayISO: string, weekStartDay: WeekStartDay): boolean {
  if (date < todayISO) return false;
  const weeks = wallPlanWeeks(todayISO, weekStartDay);
  return date <= weeks[weeks.length - 1][6];
}

/**
 * The kind a recipe is planned as: its own (a side, a dessert, a drink),
 * else a main dish. A saved meal says so itself; a Mealie recipe is told by
 * the categories the household filed it under (`courseKindFromTags`, with
 * the words for the kinds in the wall's language).
 */
export function wallPlanKind(meal: Pick<SavedMeal, 'id' | 'category' | 'tags'>, localWords?: Partial<Record<MealCourseKind, readonly string[]>>): MealCourseKind {
  if (meal.category && COURSE_KINDS.includes(meal.category)) return meal.category;
  return isMealieMeal(meal) ? courseKindFromTags(meal.tags, localWords) : 'main';
}

/**
 * A meal's main dish as one string, so the wall can say which dish it asked
 * about and the hub can tell whether that is still the one there: the saved
 * meal's id, the typed words, or empty for a meal with no main dish.
 */
export function mainDishMark(entry: PlannedMeal | undefined): string {
  if (!entry) return '';
  if (entry.mealId) return `m:${entry.mealId}`;
  const typed = entry.customText?.trim();
  return typed ? `t:${typed}` : '';
}

function entryAt(plan: readonly PlannedMeal[], date: string, slot: MealSlotType): PlannedMeal | undefined {
  return plan.find((p) => p.date === date && p.slot === slot);
}

/** Where `mealId` sits in a meal: its main dish, one of its courses (by index), or nowhere. */
function placeOf(entry: PlannedMeal | undefined, mealId: string): 'main' | number | null {
  if (!entry) return null;
  if (entry.mealId === mealId) return 'main';
  const index = (entry.courses ?? []).findIndex((c) => c.mealId === mealId);
  return index >= 0 ? index : null;
}

/**
 * What a tap on a day does for a recipe, before anything is sent:
 * - `put`: the day is free (or has only sides), so the recipe is planned at once.
 * - `join`: the recipe is a side, dessert or drink and the day has a meal; it joins that meal.
 * - `ask`: the day has a different main dish; the wall asks whether to swap or have both.
 * - `off`: the recipe is already on that day; the wall offers to take it off.
 */
export type WallDayTap = 'put' | 'join' | 'ask' | 'off';

export function wallDayTap(plan: readonly PlannedMeal[], date: string, slot: MealSlotType, mealId: string, kind: MealCourseKind): WallDayTap {
  const entry = entryAt(plan, date, slot);
  if (placeOf(entry, mealId) !== null) return 'off';
  if (!entry || !planEntryHasContent(entry)) return 'put';
  if (kind !== 'main') return 'join';
  return mainDishMark(entry) ? 'ask' : 'put';
}

/** One change a wall asks for. `expect` is the main dish the wall saw there (`mainDishMark`), for the answers to a question. */
export interface WallPlanChange {
  action: 'put' | 'swap' | 'both' | 'off';
  date: string;
  slot: MealSlotType;
  mealId: string;
  kind: MealCourseKind;
  expect?: string;
}

/** What happened, in the words the wall says back. */
export type WallPlanOutcome = 'planned' | 'joined' | 'swapped' | 'both' | 'off';

export type WallPlanResult =
  | { ok: true; plan: PlannedMeal[]; outcome: WallPlanOutcome; changed: boolean }
  /**
   * `taken`: the day got a main dish since the wall drew it. `changed`: the
   * dish the wall asked about is no longer the one there. `full`: the meal
   * has as many dishes as it holds.
   */
  | { ok: false; reason: 'taken' | 'changed' | 'full' };

/**
 * Apply one wall change to the plan as it is now. Nothing is ever replaced
 * that the wall did not name: a plain `put` refuses a day that has a main
 * dish, and `swap`, `both` and a main dish's `off` go ahead only while the
 * dish the wall saw is still there. A change already in place (the same
 * recipe put twice, a recipe taken off twice) answers as done, with
 * `changed: false`, so a second tap or a retry is never an error.
 */
export function applyWallPlanChange(plan: PlannedMeal[], change: WallPlanChange): WallPlanResult {
  const { action, date, slot, mealId, kind } = change;
  const entry = entryAt(plan, date, slot);
  const place = placeOf(entry, mealId);
  const done = (next: PlannedMeal[], outcome: WallPlanOutcome): WallPlanResult => ({ ok: true, plan: next, outcome, changed: next !== plan });
  const asCourse = (as: MealCourseKind, outcome: WallPlanOutcome): WallPlanResult => {
    if ((entry?.courses?.length ?? 0) >= MAX_COURSES) return { ok: false, reason: 'full' };
    return done(addPlanCourse(plan, date, slot, { kind: as, mealId }), outcome);
  };

  if (action === 'off') {
    if (place === null) return done(plan, 'off');
    // Taking the main dish off keeps the sides and the serving time, as emptying it on the phone does.
    if (place === 'main') return done(setPlanSlotText(plan, date, slot, ''), 'off');
    return done(removePlanCourse(plan, date, slot, place), 'off');
  }

  if (place !== null) return done(plan, 'planned');
  const mark = mainDishMark(entry);

  if (action === 'put') {
    // A side, a dessert or a drink goes on as what it is, even alone: a main
    // dish planned later then leads the meal instead of being asked to swap.
    if (kind !== 'main') return asCourse(kind, entry && planEntryHasContent(entry) ? 'joined' : 'planned');
    if (!entry || !planEntryHasContent(entry)) return done(assignPlanSlot(plan, date, slot, mealId), 'planned');
    if (!mark) return done(assignPlanSlot(plan, date, slot, mealId), 'planned');
    return { ok: false, reason: 'taken' };
  }

  // The answers to "Wednesday dinner is Veggie stir fry": only while it still is.
  if (!mark) return done(assignPlanSlot(plan, date, slot, mealId), 'planned');
  if (change.expect !== mark) return { ok: false, reason: 'changed' };
  if (action === 'swap') return done(assignPlanSlot(plan, date, slot, mealId), 'swapped');
  return asCourse('main', 'both');
}

/**
 * Put one meal back as it was before a wall change (its Undo), but only
 * while the meal still reads as that change left it: somebody who changed
 * the day since has the last word. Null when it has moved on.
 */
export function undoWallPlanChange(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  before: PlannedMeal | null,
  after: PlannedMeal | null,
): PlannedMeal[] | null {
  const now = entryAt(plan, date, slot) ?? null;
  if (!sameMeal(now, after)) return null;
  const rest = plan.filter((p) => !(p.date === date && p.slot === slot));
  return before ? [...rest, before] : rest;
}

/**
 * Whether two copies of one meal read the same: the same dishes in the same
 * order, the same serving time and note. Mealie's own ids (`sourceId`) are
 * left out: a meal written to Mealie comes back with new ones.
 */
export function sameMeal(a: PlannedMeal | null, b: PlannedMeal | null): boolean {
  const reads = (entry: PlannedMeal | null) => (entry
    ? JSON.stringify([
      mainDishMark(entry), entry.time ?? '', entry.notes?.trim() ?? '',
      ...(entry.courses ?? []).map((c) => [c.kind, c.mealId ?? '', c.customText?.trim() ?? '']),
    ])
    : '');
  return reads(a) === reads(b);
}
