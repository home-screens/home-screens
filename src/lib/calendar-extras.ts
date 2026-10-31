import type { FamilyMember } from '@/types/family';
import type { ChoreCompletion, ChoreDefinition, MealSettings, MealSlotType, PlannedMeal, SavedMeal, TimeFormat } from '@/types/config';
import { buildCompletionSet, resolveAssignmentsFor, type ChoreGroup } from '@/lib/chore-assignments';
import { SLOT_ORDER, resolveMealWithEntry, resolvePlannedMealTime } from '@/lib/meal-constants';
import type { ResolvedCourse } from '@/lib/meal-courses';

/**
 * Household data the week list can draw next to calendar events: the day's
 * planned meals and one aggregate chore row per day. Built once per fetch
 * from the shared meals.json / chores.json payloads (the same endpoints the
 * meal planner and chore chart modules read), keyed by local ISO date so a
 * view looks up `byDate[toISODate(day)]` and renders.
 *
 * The chore row is deliberately aggregate: a done/total fraction plus the
 * members with anything assigned that day. A per-kid breakdown would not
 * hold at five kids in a cell that also lists the day's events.
 */
export interface DayMealExtra {
  slot: MealSlotType;
  name: string;
  emoji?: string;
  /** The library or Mealie meal behind the row, for its picture; null for typed text. */
  meal: SavedMeal | null;
  /** The meal's sides, dessert, drink and other mains, listed under it. */
  courses: ResolvedCourse[];
  /**
   * When it is served, "HH:MM": the meal's own time, else the slot's usual
   * one, as every meal view shows it. Unset when neither is set.
   */
  time?: string;
}

export interface DayChoreExtra {
  total: number;
  done: number;
  /** Members with at least one chore that day, in member order. */
  memberIds: string[];
}

export interface DayExtras {
  meals: DayMealExtra[];
  chores: DayChoreExtra | null;
}

export interface ExtrasIndex {
  byDate: Record<string, DayExtras>;
  members: Record<string, Pick<FamilyMember, 'name' | 'color' | 'emoji'>>;
  /** The meal settings' own serving-time format; unset follows the household's. */
  mealTimeFormat?: TimeFormat;
}

export const EMPTY_EXTRAS: ExtrasIndex = { byDate: {}, members: {} };

export interface MealsSource {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  settings: Pick<MealSettings, 'enabledSlots'> & Partial<Pick<MealSettings, 'defaultSlotTimes' | 'timeFormat'>>;
}

export interface ChoresSource {
  members: FamilyMember[];
  groups: ChoreGroup[];
  chores: ChoreDefinition[];
  completions: ChoreCompletion[];
}

export function buildExtrasIndex(opts: {
  dates: readonly string[];
  meals: MealsSource | null;
  chores: ChoresSource | null;
}): ExtrasIndex {
  const byDate: Record<string, DayExtras> = {};
  const members: ExtrasIndex['members'] = {};
  const completionSet = buildCompletionSet(opts.chores?.completions ?? []);
  if (opts.chores) {
    for (const m of opts.chores.members) members[m.id] = { name: m.name, color: m.color, emoji: m.emoji };
  }
  const enabledSlots = new Set(opts.meals?.settings.enabledSlots ?? []);

  for (const date of opts.dates) {
    const meals: DayMealExtra[] = [];
    if (opts.meals) {
      for (const slot of SLOT_ORDER) {
        if (!enabledSlots.has(slot)) continue;
        const { meal, planned, name, courses } = resolveMealWithEntry(date, slot, opts.meals.plan, opts.meals.savedMeals);
        if (!name) continue;
        const time = resolvePlannedMealTime(planned, slot, opts.meals.settings.defaultSlotTimes ?? {});
        meals.push({ slot, name, emoji: meal?.emoji, meal, courses, ...(time ? { time } : {}) });
      }
    }
    let chores: DayChoreExtra | null = null;
    if (opts.chores) {
      const assignments = resolveAssignmentsFor(opts.chores.chores, opts.chores.members, date, completionSet, opts.chores.groups)
        .filter((a) => !a.isSkipped);
      if (assignments.length > 0) {
        const seen = new Set(assignments.map((a) => a.memberId));
        chores = {
          total: assignments.length,
          done: assignments.filter((a) => a.isCompleted).length,
          memberIds: opts.chores.members.filter((m) => seen.has(m.id)).map((m) => m.id),
        };
      }
    }
    if (meals.length > 0 || chores) byDate[date] = { meals, chores };
  }
  const mealTimeFormat = opts.meals?.settings.timeFormat;
  return { byDate, members, ...(mealTimeFormat ? { mealTimeFormat } : {}) };
}

/** True when the index has anything to draw for at least one of `dates`. */
export function hasExtras(index: ExtrasIndex, dates: readonly string[]): boolean {
  return dates.some((d) => index.byDate[d] != null);
}

/**
 * Every slot and every serving time the meal rows of `dates` name, slots in
 * the day's order and times earliest first. A view sizes the rows' label
 * column to the widest of them, so "Abendessen" never runs into the dish and
 * the pictures and names line up down the week.
 */
export function weekMealLabels(index: ExtrasIndex, dates: readonly string[]): { slots: MealSlotType[]; times: string[] } {
  const slots = new Set<MealSlotType>();
  const times = new Set<string>();
  for (const date of dates) {
    for (const meal of index.byDate[date]?.meals ?? []) {
      slots.add(meal.slot);
      if (meal.time) times.add(meal.time);
    }
  }
  return { slots: SLOT_ORDER.filter((s) => slots.has(s)), times: [...times].sort() };
}
