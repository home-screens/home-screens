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

// ── Assignment / completion predicates ─────────────────────────────
//
// The canonical "does this person owe this chore, and did they do it?"
// vocabulary. Every stat below (streaks, weekly points, star days, the
// history strip) is built from these so the assignment rule lives in
// exactly one place. `date` is a YYYY-MM-DD string; the day-of-week is
// derived from it, so callers never pass a separately-computed dow that
// could drift from the date.

/** Whether `chore` applies to `memberId` on `date` — combines the
 *  frequency/day-of-week gate with rotation resolution. */
export function isAssignedOn(chore: ChoreDefinition, memberId: string, date: string): boolean {
  const dayOfWeek = parseISO(date).getDay();
  return choreAppliesToday(chore, dayOfWeek, date) && resolveAssignee(chore, date).includes(memberId);
}

/** The subset of `chores` that `memberId` is assigned on `date`. */
export function choresAssignedTo(
  chores: ChoreDefinition[],
  memberId: string,
  date: string,
): ChoreDefinition[] {
  return chores.filter((c) => isAssignedOn(c, memberId, date));
}

/** Whether `memberId` has a logged completion for `choreId` on `date`. */
export function isChoreComplete(
  completionSet: Set<string>,
  choreId: string,
  memberId: string,
  date: string,
): boolean {
  return completionSet.has(completionKey(choreId, memberId, date));
}

/** Whether `memberId` completed every chore assigned to them on `date`.
 *  A day with no assigned chores returns `false` (no chores earns no star);
 *  callers that must distinguish "nothing assigned" from "assigned but not
 *  done" (e.g. the streak walk) check `choresAssignedTo(...).length`. */
export function isDayFullyComplete(
  chores: ChoreDefinition[],
  memberId: string,
  date: string,
  completionSet: Set<string>,
): boolean {
  const assigned = choresAssignedTo(chores, memberId, date);
  if (assigned.length === 0) return false;
  return assigned.every((c) => isChoreComplete(completionSet, c.id, memberId, date));
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
      const assigned = choresAssignedTo(chores, member.id, cursor);
      if (assigned.length === 0) continue; // vacation days aren't punished
      total += 1;
      if (assigned.every((c) => isChoreComplete(completionSet, c.id, member.id, cursor))) {
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

// ── Per-member stats ───────────────────────────────────────────────
//
// Pure functions extracted from useChoreData so the streak / points math
// is unit-testable and expressed once. Each takes only plain data (no
// React, no clock) — `date`/`today` are always YYYY-MM-DD strings.

/** Resolve everyone assigned a chore on `date` into flat completion rows.
 *  Unlike the per-member helpers, this fans out over each chore's assignees
 *  and skips ids that aren't real members (stale rotation entries). */
export function resolveAssignmentsFor(
  chores: ChoreDefinition[],
  members: ChoreMember[],
  date: string,
  completionSet: Set<string>,
): ResolvedAssignment[] {
  const dayOfWeek = parseISO(date).getDay();
  const assignments: ResolvedAssignment[] = [];
  for (const chore of chores) {
    if (!choreAppliesToday(chore, dayOfWeek, date)) continue;
    for (const memberId of resolveAssignee(chore, date)) {
      if (!members.some((m) => m.id === memberId)) continue;
      assignments.push({
        chore,
        memberId,
        isCompleted: isChoreComplete(completionSet, chore.id, memberId, date),
      });
    }
  }
  return assignments;
}

/** Sum a member's earned vs assigned points across a set of dates. */
export function computeWeeklyPoints(
  chores: ChoreDefinition[],
  memberId: string,
  weekDates: string[],
  completionSet: Set<string>,
): { earned: number; total: number } {
  let earned = 0;
  let total = 0;
  for (const date of weekDates) {
    for (const chore of choresAssignedTo(chores, memberId, date)) {
      total += chore.points;
      if (isChoreComplete(completionSet, chore.id, memberId, date)) {
        earned += chore.points;
      }
    }
  }
  return { earned, total };
}

/** Consecutive days (ending today) on which a member completed all their
 *  assigned chores. Walks back up to 30 days from yesterday: days with no
 *  assigned chores are skipped without breaking the run, then today is
 *  added on top if fully complete. */
export function computeStreak(
  chores: ChoreDefinition[],
  memberId: string,
  today: string,
  completionSet: Set<string>,
): number {
  let streak = 0;
  const sd = parseISO(today);
  sd.setDate(sd.getDate() - 1); // start from yesterday
  for (let i = 0; i < 30; i++) {
    const date = localDateStr(sd);
    const assigned = choresAssignedTo(chores, memberId, date);

    if (assigned.length === 0) {
      // No chores assigned — skip day without breaking streak
      sd.setDate(sd.getDate() - 1);
      continue;
    }

    const allDone = assigned.every((c) => isChoreComplete(completionSet, c.id, memberId, date));
    if (allDone) {
      streak++;
      sd.setDate(sd.getDate() - 1);
    } else {
      break;
    }
  }

  // Include today if all today's chores are done
  if (isDayFullyComplete(chores, memberId, today, completionSet)) {
    streak++;
  }

  return streak;
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
