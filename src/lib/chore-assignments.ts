import type { FamilyGroup, FamilyMember } from '@/types/family';
import { localISODate } from './timezone';
import type { ChoreCompletion, ChoreDefinition } from '@/types/config';

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
  /** A grown-up marked it "not today" for this person: it pays nothing and leaves every count. */
  isSkipped: boolean;
  /** The groups the chore goes to on that date, which on a schedule is not every group it names. */
  groupIds: string[];
}

// ── Date plumbing ──────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in local time (avoids UTC drift from toISOString) */
export const localDateStr = localISODate;

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

/**
 * Whole weeks since the epoch, which is a Monday, so a week runs Monday to
 * Sunday. Floored, never rounded: rounding tips over at the half week and
 * moved every weekly handover to Friday.
 */
function weeksSinceEpoch(date: string): number {
  return Math.floor((dateToUTC(date) - EPOCH_UTC) / (MS_PER_DAY * 7));
}

// ── Assignment resolution ──────────────────────────────────────────

/** The part of a family group assignment needs: which people it holds. */
export type ChoreGroup = Pick<FamilyGroup, 'id' | 'memberIds'>;

/**
 * Everyone a chore can go to: the people it names, then the members of each
 * group it names, each person once. Groups are expanded here and never at
 * rest, so someone added to a group later owes its chores too. A group that
 * no longer exists contributes nobody.
 *
 * The people named directly keep their saved order (existing rotations must
 * not shift), and a group's members follow in the group's own order, which
 * is family order.
 */
export function choreAssigneeIds(
  chore: Pick<ChoreDefinition, 'assigneeIds' | 'assigneeGroupIds'>,
  groups: readonly ChoreGroup[],
): string[] {
  if (!chore.assigneeGroupIds?.length) return chore.assigneeIds;
  const ids = new Set(chore.assigneeIds);
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const groupId of chore.assigneeGroupIds) {
    for (const memberId of byId.get(groupId)?.memberIds ?? []) ids.add(memberId);
  }
  return [...ids];
}

/**
 * The groups a chore goes to on `date`. On a schedule that is only the groups
 * whose row has that day; otherwise it is every group the chore names.
 */
export function choreGroupIdsOn(
  chore: Pick<ChoreDefinition, 'rotation' | 'assigneeGroupIds' | 'groupSchedule'>,
  date: string,
): string[] {
  if (chore.rotation !== 'schedule') return chore.assigneeGroupIds ?? [];
  const dayOfWeek = parseISO(date).getDay();
  return Object.entries(chore.groupSchedule ?? {})
    .filter(([, days]) => days.includes(dayOfWeek))
    .map(([groupId]) => groupId);
}

/**
 * Resolve rotation — which member is assigned a chore on a given date.
 * Nobody is ever assigned a bonus chore: it is open to people, never owed by
 * them, and that is what keeps bonus chores out of every count, star and
 * streak. `@/lib/chore-bonus` resolves who can do one.
 */
export function resolveAssignee(
  chore: ChoreDefinition,
  date: string,
  groups: readonly ChoreGroup[],
): string[] {
  if (chore.bonus) return [];
  if (chore.rotation === 'schedule') {
    // A person with a row of their own who is also in a scheduled group has
    // the chore on either set of days, once.
    const dayOfWeek = parseISO(date).getDay();
    const assigneeIds = Object.entries(chore.schedule ?? {})
      .filter(([, days]) => days.includes(dayOfWeek))
      .map(([memberId]) => memberId);
    return choreAssigneeIds({ assigneeIds, assigneeGroupIds: choreGroupIdsOn(chore, date) }, groups);
  }

  const assigneeIds = choreAssigneeIds(chore, groups);
  if (chore.rotation === 'fixed' || assigneeIds.length <= 1) {
    return assigneeIds;
  }

  const diffMs = dateToUTC(date) - EPOCH_UTC;

  if (chore.rotation === 'rotate-daily') {
    const daysSinceEpoch = Math.round(diffMs / MS_PER_DAY);
    const idx = daysSinceEpoch % assigneeIds.length;
    return [assigneeIds[idx]];
  }

  if (chore.rotation === 'rotate-weekly') {
    const idx = weeksSinceEpoch(date) % assigneeIds.length;
    return [assigneeIds[idx]];
  }

  return assigneeIds;
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
    return weeksSinceEpoch(date) % 2 === 0; // applies on even weeks from epoch
  }
  return true;
}

// ── Completion predicates ──────────────────────────────────────────

/** Build a completion lookup key */
export function completionKey(choreId: string, memberId: string, date: string): string {
  return `${choreId}-${memberId}-${date}`;
}

/** The lookup key a "not today" mark is stored under, beside the done keys in one set. */
function skipKey(choreId: string, memberId: string, date: string): string {
  return `skip:${completionKey(choreId, memberId, date)}`;
}

/**
 * The lookup set every chore count reads: a done key per finished chore and a
 * skip key per "not today". One set carries both so every function that takes
 * a completion set can tell the two apart without a second parameter.
 */
export function buildCompletionSet(completions: readonly ChoreCompletion[]): Set<string> {
  const set = new Set<string>();
  for (const c of completions) {
    set.add(c.status === 'skipped' ? skipKey(c.choreId, c.memberId, c.date) : completionKey(c.choreId, c.memberId, c.date));
  }
  return set;
}

/** Whether a grown-up marked `choreId` "not today" for `memberId` on `date`. */
export function isChoreSkipped(
  completionSet: Set<string>,
  choreId: string,
  memberId: string,
  date: string,
): boolean {
  return completionSet.has(skipKey(choreId, memberId, date));
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
export function isAssignedOn(chore: ChoreDefinition, memberId: string, date: string, groups: readonly ChoreGroup[]): boolean {
  const dayOfWeek = parseISO(date).getDay();
  return choreAppliesToday(chore, dayOfWeek, date) && resolveAssignee(chore, date, groups).includes(memberId);
}

/** The subset of `chores` that `memberId` is assigned on `date`. */
export function choresAssignedTo(
  chores: ChoreDefinition[],
  memberId: string,
  date: string,
  groups: readonly ChoreGroup[],
): ChoreDefinition[] {
  return chores.filter((c) => isAssignedOn(c, memberId, date, groups));
}

/**
 * The chores `memberId` owes on `date`: assigned, and not marked "not today".
 * Every count (done fractions, stars, streaks, points) reads this rather than
 * `choresAssignedTo`, so a skipped chore can neither be missed nor earned.
 */
export function choresOwedBy(
  chores: ChoreDefinition[],
  memberId: string,
  date: string,
  completionSet: Set<string>,
  groups: readonly ChoreGroup[],
): ChoreDefinition[] {
  return choresAssignedTo(chores, memberId, date, groups)
    .filter((c) => !isChoreSkipped(completionSet, c.id, memberId, date));
}

/** Resolve everyone assigned a chore on `date` into flat completion rows.
 *  Unlike the per-member helpers, this fans out over each chore's assignees
 *  and skips ids that aren't real members (stale rotation entries). */
export function resolveAssignmentsFor(
  chores: ChoreDefinition[],
  members: FamilyMember[],
  date: string,
  completionSet: Set<string>,
  groups: readonly ChoreGroup[],
): ResolvedAssignment[] {
  const dayOfWeek = parseISO(date).getDay();
  const assignments: ResolvedAssignment[] = [];
  for (const chore of chores) {
    if (!choreAppliesToday(chore, dayOfWeek, date)) continue;
    const groupIds = choreGroupIdsOn(chore, date);
    for (const memberId of resolveAssignee(chore, date, groups)) {
      if (!members.some((m) => m.id === memberId)) continue;
      assignments.push({
        chore,
        memberId,
        isCompleted: isChoreComplete(completionSet, chore.id, memberId, date),
        isSkipped: isChoreSkipped(completionSet, chore.id, memberId, date),
        groupIds,
      });
    }
  }
  return assignments;
}
