import type { ChoreMember } from '@/types/config';
import { TAP_CHECKBOX_SIZE } from '../shared/TapCheckbox';
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

/** Rows and section headers a view has to fit, in the em units it draws them at. */
interface ChoreFitInput {
  /** Measured box, px. Zero on the first paint. */
  width: number;
  height: number;
  /** The module's own font size: the ceiling, never exceeded. */
  requested: number;
  /** Chore rows the view must show today. */
  rows: number;
  /** Time-of-day headers between them (0 when the view has none). */
  sections: number;
  view: string;
}

/** Below this the chart is unreadable from anywhere, so it stops shrinking. */
const CHORE_FONT_FLOOR = 11;

/**
 * The font size a view can actually draw at inside its box.
 *
 * The chart is authored in `em` off the module's font size, so nothing about
 * it followed the box: a 10-chore day at the 24px default needs 62px rows and
 * 780px of height, and the module's own 500x650 default cut the last three
 * chores off mid-row. This solves for the size where the day fits instead.
 *
 * The module font size is a ceiling, not a target, so a chart that already
 * fits is left exactly as it was and only an overfull one shrinks.
 */
export function fitChoreFontSize({ width, height, requested, rows, sections, view }: ChoreFitInput): number {
  if (height <= 0 || width <= 0) return requested;

  // Height each part costs, in em, measured off the rendered views: a row is
  // its 1em of text plus 0.5em padding top and bottom plus the tap target's
  // overhang, a section header is its 0.85em line plus margins.
  const ROW_EM = view === 'compact' ? 1.9 : 2.6;
  const SECTION_EM = 1.9;
  // Compact carries far more chrome than the others: a member column header
  // above the matrix and a per-member totals legend under it.
  const CHROME_EM = view === 'compact' ? 9 : 3.7;

  const listViews = view === 'today' || view === 'board' || view === 'compact';
  const emTall = listViews
    ? rows * ROW_EM + sections * SECTION_EM + CHROME_EM
    // The grid views (star chart, progress rings) are one block per member
    // rather than a list, so they key off the box alone.
    : 14;

  // The em model runs a couple of percent optimistic against the real
  // borders and margins, so leave that much back rather than fit exactly.
  const byHeight = (height / Math.max(1, emTall)) * 0.96;
  // A name needs room across the row as well as down the column.
  const byWidth = width / 13;
  return Math.max(CHORE_FONT_FLOOR, Math.min(requested, byHeight, byWidth));
}

/**
 * Tap target for a chore row: a fingertip-sized box whenever the box allows
 * one, shrinking only when the alternative is hiding chores off the bottom.
 * A fixed 38px floors the row height, so on a small card it, not the type,
 * is what pushes the last chores out of view.
 */
export function choreTapSize(fontSize: number): number {
  return Math.round(Math.max(24, Math.min(TAP_CHECKBOX_SIZE, fontSize * 1.6)));
}
