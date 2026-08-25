import type { ChoreDefinition, ChoreMember } from '@/types/config';

/**
 * The pure chore assignment/completion core: "does this person owe this
 * chore on this date, and did they do it?" Lives in the lib layer because
 * it is data logic with no UI — the chore-chart components, the
 * `/api/chores/today` route, and the calendar week-list extras all resolve
 * assignments through these same functions. `date` is a YYYY-MM-DD string;
 * the day-of-week is always derived from it so callers can never pass a
 * separately-computed dow that drifts from the date.
 */

// ── Resolved assignment (chore + who's assigned + completion) ──────

export interface ResolvedAssignment {
  chore: ChoreDefinition;
  memberId: string;
  isCompleted: boolean;
}

// ── Date plumbing ──────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in local time (avoids UTC drift from toISOString) */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get today's date as YYYY-MM-DD in local time */
export function todayStr(): string {
  return localDateStr(new Date());
}

/** Parse a YYYY-MM-DD string as a local-midnight Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Parse YYYY-MM-DD to UTC millis (DST-safe for day arithmetic) */
function dateToUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const EPOCH_UTC = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 86_400_000;

// ── Assignment resolution ──────────────────────────────────────────

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

// ── Completion predicates ──────────────────────────────────────────

/** Build a completion lookup key */
export function completionKey(choreId: string, memberId: string, date: string): string {
  return `${choreId}-${memberId}-${date}`;
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
