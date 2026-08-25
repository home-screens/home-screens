import type { ChoreCompletion, ChoreDefinition, ChoreMember, MealSettings, MealSlotType, PlannedMeal, SavedMeal } from '@/types/config';
import { completionKey, resolveAssignmentsFor } from '@/components/modules/chore-chart/types';
import { SLOT_ORDER, resolveMealWithEntry } from '@/lib/meal-constants';

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
  members: Record<string, Pick<ChoreMember, 'name' | 'color' | 'emoji'>>;
}

export const EMPTY_EXTRAS: ExtrasIndex = { byDate: {}, members: {} };

export interface MealsSource {
  plan: PlannedMeal[];
  savedMeals: SavedMeal[];
  settings: Pick<MealSettings, 'enabledSlots'>;
}

export interface ChoresSource {
  members: ChoreMember[];
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
  const completionSet = new Set<string>();
  if (opts.chores) {
    for (const c of opts.chores.completions) completionSet.add(completionKey(c.choreId, c.memberId, c.date));
    for (const m of opts.chores.members) members[m.id] = { name: m.name, color: m.color, emoji: m.emoji };
  }
  const enabledSlots = new Set(opts.meals?.settings.enabledSlots ?? []);

  for (const date of opts.dates) {
    const meals: DayMealExtra[] = [];
    if (opts.meals) {
      for (const slot of SLOT_ORDER) {
        if (!enabledSlots.has(slot)) continue;
        const { meal, planned } = resolveMealWithEntry(date, slot, opts.meals.plan, opts.meals.savedMeals);
        const name = meal?.name ?? planned?.customText?.trim();
        if (!name) continue;
        meals.push({ slot, name, emoji: meal?.emoji });
      }
    }
    let chores: DayChoreExtra | null = null;
    if (opts.chores) {
      const assignments = resolveAssignmentsFor(opts.chores.chores, opts.chores.members, date, completionSet);
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
  return { byDate, members };
}

/** True when the index has anything to draw for at least one of `dates`. */
export function hasExtras(index: ExtrasIndex, dates: readonly string[]): boolean {
  return dates.some((d) => index.byDate[d] != null);
}
