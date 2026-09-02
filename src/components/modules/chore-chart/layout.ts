import type { ChoreMember } from '@/types/config';
import type { MemberStats } from './types';

/**
 * Layout helpers shared by the small chore-chart views and the fullscreen
 * chart. Pure functions: they take measured widths and counts, never DOM.
 */

/**
 * Split `items` into rows of at most `maxPerRow`, spread as evenly as the
 * count allows: 7 items at 3 per row gives 3 / 2 / 2, never 3 / 3 / 1. A
 * trailing row with one lonely card is what the audit kept finding once a
 * family passed six members.
 */
export function balanceRows<T>(items: T[], maxPerRow: number): T[][] {
  const per = Math.max(1, Math.floor(maxPerRow));
  if (items.length === 0) return [];
  const rowCount = Math.ceil(items.length / per);
  const base = Math.floor(items.length / rowCount);
  const extra = items.length % rowCount;
  const rows: T[][] = [];
  let cursor = 0;
  for (let r = 0; r < rowCount; r++) {
    const size = base + (r < extra ? 1 : 0);
    rows.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

/**
 * How many `itemWidth`-wide items fit across `availableWidth` with `gap`
 * between them. An unmeasured width (0) fits everything on one row, so the
 * first paint matches the single-row layout the views always had.
 */
export function fitPerRow(availableWidth: number, itemWidth: number, gap: number, total: number): number {
  if (availableWidth <= 0 || itemWidth <= 0) return Math.max(1, total);
  const fits = Math.floor((availableWidth + gap) / (itemWidth + gap));
  return Math.max(1, Math.min(total, fits));
}

export interface MemberPartition {
  /** Has at least one chore today. */
  active: ChoreMember[];
  /** Nothing today, but chores on another day this week: a real day off. */
  dayOff: ChoreMember[];
  /** No chores at all this week (the parents, usually): not part of the chart. */
  idle: ChoreMember[];
}

/**
 * Sort members into the three states a chart has to treat differently.
 * Order within each group follows the household's member order.
 */
export function partitionMembers(members: ChoreMember[], memberStats: Map<string, MemberStats>): MemberPartition {
  const active: ChoreMember[] = [];
  const dayOff: ChoreMember[] = [];
  const idle: ChoreMember[] = [];
  for (const member of members) {
    const stats = memberStats.get(member.id);
    if (stats && stats.total > 0) active.push(member);
    else if (stats && stats.weekAssigned > 0) dayOff.push(member);
    else idle.push(member);
  }
  return { active, dayOff, idle };
}

/** Members that take part in the chart this week: everyone but the idle ones. */
export function weekMembers(members: ChoreMember[], memberStats: Map<string, MemberStats>): ChoreMember[] {
  return members.filter((m) => (memberStats.get(m.id)?.weekAssigned ?? 0) > 0);
}
