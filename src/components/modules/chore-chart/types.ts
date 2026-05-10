import type {
  ChoreMember,
  ChoreDefinition,
  ChoreTimeOfDay,
} from '@/types/config';
import { uuid } from '@/lib/uuid';

// ── Resolved assignment (chore + who's assigned today) ────────────

export interface ResolvedAssignment {
  chore: ChoreDefinition;
  memberId: string;
  isCompleted: boolean;
}

export interface MemberStats {
  total: number;
  completed: number;
  percentage: number;
  streak: number;
  weeklyPoints: number;
  weeklyPointsTotal: number;
  rewardBalance: number;
}

export interface WeekDayData {
  date: string;
  dayName: string;
  dayIndex: number;
  isToday: boolean;
  memberStars: Record<string, boolean>; // memberId → earned star
}

/** A single day in the chore history strip — date plus the day's earned/total fraction. */
export interface DayEntry {
  date: string;       // YYYY-MM-DD
  dayOfWeek: number;  // 0–6
  dayOfMonth: number;
  earned: number;
  total: number;
}

// ── Constants ──────────────────────────────────────────────────────

/** How many days of chore-completion history to surface (and retain server-side).
 *  Single source of truth — the `/api/chores` PURGE_DAYS and the history strip
 *  both reference this so they cannot drift. */
export const CHORE_HISTORY_DAYS = 90;

export { getOrderedDays } from '@/lib/meal-constants';

export const TIME_OF_DAY_META: Record<ChoreTimeOfDay, { icon: string; order: number }> = {
  morning:   { icon: '\u2600\ufe0f', order: 0 },
  afternoon: { icon: '\u26c5\ufe0f', order: 1 },
  evening:   { icon: '\ud83c\udf19',  order: 2 },
  anytime:   { icon: '\ud83d\udd50',  order: 3 },
};

/**
 * Returns the `modules.chore-chart.timeOfDay.<timeOfDay>` translation key for use
 * with `useTranslate('modules')`.
 */
export function getTimeOfDayLabelKey(timeOfDay: ChoreTimeOfDay): string {
  return `chore-chart.timeOfDay.${timeOfDay}`;
}

export const MEMBER_COLORS = [
  '#f472b6', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa',
  '#fb923c', '#22d3ee', '#f87171', '#34d399', '#e879f9',
];

// ── Utility functions ──────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in local time (avoids UTC drift from toISOString) */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse YYYY-MM-DD to UTC millis (DST-safe for day arithmetic) */
function dateToUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const EPOCH_UTC = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 86_400_000;

/** Get today's date as YYYY-MM-DD in local time */
export function todayStr(): string {
  return localDateStr(new Date());
}

/** Get date string for N days ago in local time */
export function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/** Add (or subtract) days from a YYYY-MM-DD string. Local-time calendar arithmetic. */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  // Parse as local midnight; setDate walks the local calendar correctly across month/year/DST.
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return localDateStr(date);
}

/** Return the 7 dates (YYYY-MM-DD) for the week containing `reference`,
 *  starting from the configured week start day. */
export function getWeekDatesFor(
  reference: Date | string,
  weekStartDay: 'sunday' | 'monday',
): string[] {
  const refDate =
    typeof reference === 'string'
      ? (() => {
          const [y, m, d] = reference.split('-').map(Number);
          return new Date(y, m - 1, d);
        })()
      : new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  const startDow = weekStartDay === 'monday' ? 1 : 0;
  const refDow = refDate.getDay();
  const daysBack = (refDow - startDow + 7) % 7;

  const weekStart = new Date(refDate);
  weekStart.setDate(weekStart.getDate() - daysBack);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(localDateStr(d));
  }
  return dates;
}

/** Resolve rotation — which member is assigned a chore on a given date */
export function resolveAssignee(
  chore: ChoreDefinition,
  date: string,
): string[] {
  if (chore.rotation === 'schedule') {
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    return Object.entries(chore.schedule ?? {})
      .filter(([, days]) => days.includes(dayOfWeek))
      .map(([memberId]) => memberId);
  }

  if (chore.rotation === 'fixed' || chore.assigneeIds.length <= 1) {
    return chore.assigneeIds;
  }

  const diffMs = dateToUTC(date) - EPOCH_UTC;

  if (chore.rotation === 'rotate-daily') {
    const daysSinceEpoch = Math.round(diffMs / MS_PER_DAY);
    const idx = daysSinceEpoch % chore.assigneeIds.length;
    return [chore.assigneeIds[idx]];
  }

  if (chore.rotation === 'rotate-weekly') {
    const weeksSinceEpoch = Math.round(diffMs / (MS_PER_DAY * 7));
    const idx = weeksSinceEpoch % chore.assigneeIds.length;
    return [chore.assigneeIds[idx]];
  }

  return chore.assigneeIds;
}

/** Check if a chore applies on a given day.
 *  For biweekly chores, `date` (YYYY-MM-DD) is needed to determine odd/even week.
 *  For once-frequency chores, `date` is matched against `specificDate`. */
export function choreAppliesToday(chore: ChoreDefinition, dayOfWeek: number, date?: string): boolean {
  if (chore.frequency === 'once') {
    return !!date && date === chore.specificDate;
  }
  if (chore.daysOfWeek.length > 0 && !chore.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  if (chore.frequency === 'biweekly' && date) {
    const weekNum = Math.round((dateToUTC(date) - EPOCH_UTC) / (7 * MS_PER_DAY));
    return weekNum % 2 === 0; // applies on even weeks from epoch
  }
  return true;
}

/** Sort chores by time of day order, then incomplete first */
export function sortChores(
  assignments: ResolvedAssignment[],
  showTimeOfDay: boolean,
): ResolvedAssignment[] {
  return [...assignments].sort((a, b) => {
    // Incomplete first
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    // By time of day
    if (showTimeOfDay) {
      const orderA = TIME_OF_DAY_META[a.chore.timeOfDay].order;
      const orderB = TIME_OF_DAY_META[b.chore.timeOfDay].order;
      if (orderA !== orderB) return orderA - orderB;
    }
    return 0;
  });
}

/** Get the current time-of-day section */
export function getCurrentTimeOfDay(hour: number): ChoreTimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Build a completion lookup key */
export function completionKey(choreId: string, memberId: string, date: string): string {
  return `${choreId}-${memberId}-${date}`;
}

/** Parse a YYYY-MM-DD string as a local-midnight Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Jump a YYYY-MM-DD date by ±N months, clamped to [earliest, latest].
 *  Handles JS month overflow (e.g. Jan 31 + 1 month → Feb 28/29 not Mar 3). */
export function addMonthsClamped(
  iso: string,
  delta: number,
  earliest: string,
  latest: string,
): string {
  const d = parseISO(iso);
  const targetMonth = d.getMonth() + delta;
  // Try to preserve day-of-month; JS overflow handles shorter months gracefully.
  const candidate = new Date(d.getFullYear(), targetMonth, d.getDate());
  // If JS overflowed (e.g. Jan 31 + 1mo → Mar 3), walk back to the last day of the intended month.
  if (candidate.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    candidate.setDate(0); // jumps to the last day of the previous (= intended) month
  }
  const iso2 = localDateStr(candidate);
  if (iso2 < earliest) return earliest;
  if (iso2 > latest) return latest;
  return iso2;
}

/** Build per-day earned/total entries for a date range.
 *  - `total` counts members who had any chores assigned that day (vacation days skipped).
 *  - `earned` counts members who completed all their assigned chores that day. */
export function computeDayEntries(
  earliestDate: string,
  latestDate: string,
  members: ChoreMember[],
  chores: ChoreDefinition[],
  completionSet: Set<string>,
): DayEntry[] {
  const list: DayEntry[] = [];
  let cursor = earliestDate;
  while (cursor <= latestDate) {
    const parsed = parseISO(cursor);
    const dow = parsed.getDay();

    let total = 0;
    let earned = 0;
    for (const member of members) {
      const assigned = chores.filter((c) => {
        if (!choreAppliesToday(c, dow, cursor)) return false;
        return resolveAssignee(c, cursor).includes(member.id);
      });
      if (assigned.length === 0) continue; // vacation days aren't punished
      total += 1;
      if (assigned.every((c) => completionSet.has(completionKey(c.id, member.id, cursor)))) {
        earned += 1;
      }
    }

    list.push({
      date: cursor,
      dayOfWeek: dow,
      dayOfMonth: parsed.getDate(),
      earned,
      total,
    });
    cursor = addDaysISO(cursor, 1);
  }
  return list;
}

/**
 * Pure CRUD helpers for the chore-chart members and chores arrays.
 *
 * Both `ChoreChartModal` (editor, stateful) and `ChoresManageView` (/remote,
 * controlled-by-parent) need the same mutation semantics. They have
 * different state-ownership models, so these helpers are plain array
 * functions rather than a hook — each caller plugs them into its own
 * setState / callback flow. An earlier audit found the identical
 * body-inline mutations at two sites that could drift.
 *
 * Uses the shared `uuid()` helper (not `crypto.randomUUID` directly)
 * because /remote runs over plain HTTP on the LAN, where
 * `crypto.randomUUID` is unavailable in insecure contexts.
 */
export function addMemberToList(
  members: ChoreMember[],
  data: Omit<ChoreMember, 'id'>,
): ChoreMember[] {
  return [...members, { ...data, id: uuid() }];
}

export function updateMemberInList(
  members: ChoreMember[],
  id: string,
  data: Omit<ChoreMember, 'id'>,
): ChoreMember[] {
  return members.map((m) => (m.id === id ? { ...data, id } : m));
}

export function addChoreToList(
  chores: ChoreDefinition[],
  data: Omit<ChoreDefinition, 'id'>,
): ChoreDefinition[] {
  return [...chores, { ...data, id: uuid() }];
}

export function updateChoreInList(
  chores: ChoreDefinition[],
  id: string,
  data: Omit<ChoreDefinition, 'id'>,
): ChoreDefinition[] {
  return chores.map((c) => (c.id === id ? { ...data, id } : c));
}

export function removeChoreFromList(
  chores: ChoreDefinition[],
  id: string,
): ChoreDefinition[] {
  return chores.filter((c) => c.id !== id);
}

/**
 * Remove a member and cascade: strip them from all chore assigneeIds,
 * then delete any chores left with no assignees.
 */
export function cascadeDeleteMember(
  members: ChoreMember[],
  chores: ChoreDefinition[],
  memberId: string,
): { members: ChoreMember[]; chores: ChoreDefinition[] } {
  return {
    members: members.filter((m) => m.id !== memberId),
    chores: chores
      .map((c) => {
        const updated = { ...c, assigneeIds: c.assigneeIds.filter((a) => a !== memberId) };
        if (updated.schedule) {
          const { [memberId]: _, ...rest } = updated.schedule;
          const remaining = Object.keys(rest).length;
          if (remaining === 0) {
            updated.schedule = undefined;
            updated.rotation = 'fixed';
          } else if (remaining === 1 && updated.rotation === 'schedule') {
            updated.daysOfWeek = Object.values(rest)[0];
            updated.schedule = undefined;
            updated.rotation = 'fixed';
          } else {
            updated.schedule = rest;
            // Recalculate daysOfWeek from remaining schedule entries
            updated.daysOfWeek = [...new Set(Object.values(rest).flat())].sort((a, b) => a - b);
          }
        }
        return updated;
      })
      .filter((c) => c.assigneeIds.length > 0),
  };
}
