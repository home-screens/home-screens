import type { FamilyGroup } from '@/types/family';
import type { ChoreTimeOfDay } from '@/types/config';
import type { ResolvedAssignment } from '@/lib/chore-assignments';

/**
 * How a chore chart turns today's assignments into rows.
 *
 * Both chart modules read this: the full-screen wall chart and the card chore
 * chart's `today` view. `resolveAssignmentsFor` fans a shared chore out into
 * one assignment per person, which is the right shape for counting and for a
 * by-person layout but the wrong one to print: five kids on "Make your bed"
 * became five identical rows on the card, pushing the chart to its font floor
 * and hiding a third of the day behind an unreadable pill. One row per chore
 * with a dot per person is the shape that survives this product's own stated
 * household, so the rule lives here rather than in either module.
 */

export interface ChoreRow {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  timeOfDay: ChoreTimeOfDay;
  points: number;
  /** `viaGroup` marks the people who have the chore through a family group; they sit first, inside the group pill. */
  assignees: { memberId: string; isCompleted: boolean; isSkipped?: boolean; viaGroup?: boolean }[];
  /** The first family group the chore goes to, by name. Set only when someone on the row has it through a group. */
  groupLabel?: string;
  /** How many further groups the chore goes to; the pill shows them as "+1" rather than more names. */
  groupExtra?: number;
}

/**
 * Group today's assignments by time-of-day, then deduplicate chores (a chore
 * assigned to 3 people becomes one row with 3 assignee dots). Dots keep the
 * household's member order whatever their state: a kid's ring stays in the
 * same column all day and does not jump when someone else finishes. On a
 * chore that goes to a family group, the group's people come first so their
 * rings sit together in one labelled pill, and anyone named on top of the
 * group follows outside it.
 */
export function buildChoreRows(
  assignments: ResolvedAssignment[],
  memberOrder?: Map<string, number>,
  familyGroups: readonly FamilyGroup[] = [],
): Map<ChoreTimeOfDay, ChoreRow[]> {
  const choreMap = new Map<string, ChoreRow>();
  const viaGroup = new Map<string, Set<string>>();

  for (const a of assignments) {
    const existing = choreMap.get(a.chore.id);
    if (existing) {
      existing.assignees.push({ memberId: a.memberId, isCompleted: a.isCompleted, isSkipped: a.isSkipped, viaGroup: viaGroup.get(a.chore.id)?.has(a.memberId) });
    } else {
      const named = a.groupIds.flatMap((id) => familyGroups.find((group) => group.id === id) ?? []);
      const inGroup = new Set(named.flatMap((group) => group.memberIds));
      viaGroup.set(a.chore.id, inGroup);
      choreMap.set(a.chore.id, {
        choreId: a.chore.id,
        choreName: a.chore.name,
        choreEmoji: a.chore.emoji,
        timeOfDay: a.chore.timeOfDay,
        points: a.chore.points,
        assignees: [{ memberId: a.memberId, isCompleted: a.isCompleted, isSkipped: a.isSkipped, viaGroup: inGroup.has(a.memberId) }],
        ...(named.length > 0 ? { groupLabel: named[0].name, groupExtra: named.length - 1 } : {}),
      });
    }
  }

  const groups = new Map<ChoreTimeOfDay, ChoreRow[]>();
  for (const row of choreMap.values()) {
    const existing = groups.get(row.timeOfDay) ?? [];
    if (memberOrder) {
      row.assignees.sort((a, b) => (memberOrder.get(a.memberId) ?? 0) - (memberOrder.get(b.memberId) ?? 0));
    }
    // Stable, so household order holds inside the pill and after it.
    row.assignees.sort((a, b) => Number(!!b.viaGroup) - Number(!!a.viaGroup));
    if (!row.assignees.some((a) => a.viaGroup)) { delete row.groupLabel; delete row.groupExtra; }
    existing.push(row);
    groups.set(row.timeOfDay, existing);
  }
  return groups;
}

/** Compute shortest unique initial for each member. Uses first letter when
 *  unique; extends to 2–3 characters only where collisions exist. */
export function getUniqueInitials(memberList: { id: string; name: string }[]): Map<string, string> {
  const result = new Map<string, string>();
  let remaining = [...memberList];

  for (let len = 1; len <= 3 && remaining.length > 0; len++) {
    const groups = new Map<string, typeof remaining>();
    for (const m of remaining) {
      const prefix = m.name.slice(0, len);
      const group = groups.get(prefix) ?? [];
      group.push(m);
      groups.set(prefix, group);
    }

    const next: typeof remaining = [];
    for (const [prefix, group] of groups) {
      if (group.length === 1) {
        result.set(group[0].id, prefix);
      } else {
        next.push(...group);
      }
    }
    remaining = next;
  }
  for (const m of remaining) {
    result.set(m.id, m.name.slice(0, 3));
  }
  return result;
}
