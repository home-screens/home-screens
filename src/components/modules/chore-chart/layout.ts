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
  /**
   * Rows the view stacks down the box: chores for the list views, charted
   * members for the star chart.
   */
  rows: number;
  /**
   * Bands between or below the rows: time-of-day headers for `today`, legend
   * rows for the star chart, none for the rest.
   */
  sections: number;
  view: string;
}

/** Below this the chart is unreadable from anywhere, so it stops shrinking.
 *  Past the floor the list scrolls and says how many chores are below it
 *  (see `FitRows`) rather than shrinking into nothing. */
const CHORE_FONT_FLOOR = 11;

/** The fixed gap Tailwind's `space-y-2` puts between time-of-day sections. */
const SECTION_GAP_PX = 8;

/**
 * Star chart geometry, in em of the fitted size, measured off the rendered
 * table rather than derived from its CSS: the star is an emoji, whose line
 * box is half again taller than its font size, so a row costs 2.64em where
 * the stylesheet reads 1.4em.
 */
const STAR_ROW_EM = 2.64;
const STAR_ROW_PAD_EM = 0.72;
const STAR_HEADER_EM = 1.6;
const STAR_TITLE_EM = 1.28;
const STAR_LEGEND_EM = 0.97;
/** Name column plus seven day columns, wide enough that stars are not squeezed. */
const STAR_WIDTH_EM = 20;
/** Fixed pixels the star chart spends whatever the type does. */
const STAR_TITLE_GAP_PX = 8;
const STAR_LEGEND_TOP_PX = 8;
const STAR_LEGEND_GAP_PX = 4;

/** Padding a row adds around its tap target, in em, per view. */
const ROW_PADDING_EM: Record<string, number> = { today: 1.0, compact: 0.5, board: 1.35 };

/** A time-of-day header: its 0.85em line plus its margins. */
const SECTION_EM = 1.9;

/**
 * Everything that is neither a row nor a section header. Compact carries far
 * more than the others: a member column header above the matrix and a
 * per-member totals legend under it.
 */
const CHROME_EM: Record<string, number> = { today: 3.7, compact: 9, board: 3.7 };

/**
 * The strip `FitRows` keeps for its "N more below" pill. Budgeted on every
 * list, not just an overflowing one: a fit that ignored it would shrink the
 * type to exactly fill the box, the strip would then appear and push a row
 * back out, and the chart would sit one row short forever.
 */
const MORE_PILL_EM = 1.7;

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
  if (view === 'star-chart') {
    // A table: a header row, one row per charted member, then the legend.
    // Its stars and its member icons both scale, so this searches the same
    // way the lists do rather than dividing.
    const fixedPx = STAR_TITLE_GAP_PX
      + (sections > 0 ? STAR_LEGEND_TOP_PX + (sections - 1) * STAR_LEGEND_GAP_PX : 0);
    const tallStar = (f: number) =>
      // The member icon only sets the row height below the readable floor, but
      // it is in the max so the model stays honest if either changes.
      rows * Math.max(STAR_ROW_EM * f, starIconSize(f) + STAR_ROW_PAD_EM * f)
      + (STAR_HEADER_EM + STAR_TITLE_EM + MORE_PILL_EM) * f
      + sections * STAR_LEGEND_EM * f;
    return search(tallStar, height - fixedPx, Math.min(requested, width / STAR_WIDTH_EM));
  }

  const listView = view === 'today' || view === 'board' || view === 'compact';
  if (!listView) {
    // The progress rings are one block per member rather than a list, so they
    // key off the box alone.
    return Math.max(CHORE_FONT_FLOOR, Math.min(requested, height / 14, width / 13));
  }

  // Sections are spaced with a fixed 8px gap (Tailwind space-y-2), which does
  // not scale with the type at all.
  const gapPx = Math.max(0, sections - 1) * SECTION_GAP_PX;
  const budget = height - gapPx;

  // Height the whole list needs at font `f`. A row is its tap target plus the
  // view's own padding, and the tap target has a floor of its own, so rows
  // stop shrinking before the type does: solving this in closed form gets the
  // last chore wrong every time, which is why it is searched instead.
  const tall = (f: number) =>
    rows * (choreTapSize(f) + ROW_PADDING_EM[view] * f)
    + sections * SECTION_EM * f
    + (CHROME_EM[view] + MORE_PILL_EM) * f;

  return search(tall, budget, Math.min(requested, width / 13));
}

/**
 * Largest size at or below `hi` whose content fits `budget`, never below the
 * floor. A search rather than a divide because the pieces that refuse to
 * shrink past their own minimums (tap targets, member icons) make the height
 * a bent line, not a straight one.
 */
function search(tall: (f: number) => number, budget: number, hi: number): number {
  const lo0 = CHORE_FONT_FLOOR;
  if (hi <= lo0) return lo0;
  if (tall(hi) <= budget) return hi;
  let lo = lo0;
  let high = hi;
  // 12 halvings over a 24px range settles well inside a tenth of a pixel.
  for (let i = 0; i < 12; i++) {
    const mid = (lo + high) / 2;
    if (tall(mid) <= budget) lo = mid;
    else high = mid;
  }
  return lo;
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

/**
 * The member icon in a star chart row, and its smaller twin in the legend.
 * Both were fixed pixel sizes, so they set the row height on a small card and
 * the type could not shrink past them.
 */
export function starIconSize(fontSize: number): number {
  return Math.round(Math.max(10, Math.min(22, fontSize * 0.9)));
}

export function starLegendIconSize(fontSize: number): number {
  return Math.round(Math.max(8, Math.min(14, fontSize * 0.55)));
}
