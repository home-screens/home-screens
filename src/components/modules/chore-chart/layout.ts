
import type { FamilyMember } from '@/types/family';

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
  active: FamilyMember[];
  /** Nothing today, but chores on another day this week: a real day off. */
  dayOff: FamilyMember[];
  /** No chores at all this week (the parents, usually): not part of the chart. */
  idle: FamilyMember[];
}

/**
 * Sort members into the three states a chart has to treat differently.
 * Order within each group follows the household's member order.
 */
export function partitionMembers(members: FamilyMember[], memberStats: Map<string, MemberStats>): MemberPartition {
  const active: FamilyMember[] = [];
  const dayOff: FamilyMember[] = [];
  const idle: FamilyMember[] = [];
  for (const member of members) {
    const stats = memberStats.get(member.id);
    if (stats && stats.total > 0) active.push(member);
    else if (stats && stats.weekAssigned > 0) dayOff.push(member);
    else idle.push(member);
  }
  return { active, dayOff, idle };
}

/** Members that take part in the chart this week: everyone but the idle ones. */
export function weekMembers(members: FamilyMember[], memberStats: Map<string, MemberStats>): FamilyMember[] {
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
const ROW_PADDING_EM: Record<string, number> = { today: 0.7, compact: 0.5, board: 1.35 };

/**
 * Views whose rows carry no tap target, so a row is a plain line of text: its
 * whole height in em (a 1.3em line plus 0.35em of padding either side). The
 * view pads in em for exactly this reason; pixel padding does not shrink with
 * the fitted type, and the fit then promises rows the card cannot hold.
 */
const PLAIN_ROW_EM: Record<string, number> = { 'reward-history': 2.0 };
/** The hairline under a plain row, which no font size shrinks. */
const PLAIN_ROW_RULE_PX = 1;

/**
 * How many em across a list needs before its columns start eating each other.
 * The reward history is four columns of words (who, what, cost, when), so it
 * needs far more than a chore row: at 13 a name was cut to "Ta...".
 */
const LIST_WIDTH_EM = 13;
const LIST_WIDTH_EM_BY_VIEW: Record<string, number> = { 'reward-history': 24 };

/** A time-of-day header: its 0.85em line plus its margins. */
const SECTION_EM = 1.9;

/**
 * Everything that is neither a row nor a section header. Compact carries far
 * more than the others: a member column header above the matrix and a
 * per-member totals legend under it.
 */
const CHROME_EM: Record<string, number> = { today: 3.7, compact: 9, board: 3.7, 'reward-history': 2.4 };

/**
 * The strip `FitRows` keeps for its "N more below" pill. Budgeted on every
 * list, not just an overflowing one: a fit that ignored it would shrink the
 * type to exactly fill the box, the strip would then appear and push a row
 * back out, and the chart would sit one row short forever.
 */
const MORE_PILL_EM = 1.7;

/**
 * The smallest the pill's own text may be. Its 0.62em would otherwise follow
 * the chart down to 6.8px on a chart pinned at the font floor, which is the
 * one moment the pill has something to say. The strip reserved above is
 * `MORE_PILL_EM` of a font that is itself never below `CHORE_FONT_FLOOR`, so a
 * floored pill still fits the space budgeted for it.
 */
export const MORE_PILL_FLOOR_PX = CHORE_FONT_FLOOR;

/**
 * The font size a view can actually draw at inside its box.
 *
 * The chart is authored in `em` off the module's font size, so nothing about
 * it followed the box: a 10-chore day at the 24px default needs 62px rows and
 * 780px of height, and a card that size cut the last three chores off
 * mid-row. This solves for the size where the day fits instead.
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

  const listView = view === 'today' || view === 'board' || view === 'compact' || view === 'reward-history';
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
  // A `today` row carries one dot per assignee rather than a single tap box,
  // and the dot is what sets its height.
  const rowTall = (f: number) => {
    if (view in PLAIN_ROW_EM) return PLAIN_ROW_EM[view] * f + PLAIN_ROW_RULE_PX;
    const target = view === 'today' ? choreDotSize(f) : choreTapSize(f);
    return target + ROW_PADDING_EM[view] * f;
  };
  const tall = (f: number) =>
    rows * rowTall(f)
    + sections * SECTION_EM * f
    + (CHROME_EM[view] + MORE_PILL_EM) * f;

  return search(tall, budget, Math.min(requested, width / (LIST_WIDTH_EM_BY_VIEW[view] ?? LIST_WIDTH_EM)));
}

/**
 * Largest size at or below `hi` whose content fits `budget`, never below the
 * floor. A search rather than a divide because the pieces that refuse to
 * shrink past their own minimums (tap targets, member icons) make the height
 * a bent line, not a straight one.
 */
function search(tall: (f: number) => number, budget: number, hi: number, floor = CHORE_FONT_FLOOR): number {
  const lo0 = floor;
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
 * A chore's icon on the board and compact rows: as tall as the line of text
 * beside it. A fixed 16px left a family's own picture a 12px speck on a wall
 * read from across the kitchen, and built-in icons swam in large type.
 */
export function choreIconSize(fontSize: number): number {
  return Math.round(Math.max(16, fontSize * 1.15));
}

/**
 * An assignee dot on a `today` row. Every person on a shared chore gets one,
 * and each is its own tap target, so it keeps a fingertip floor of its own and
 * stops growing before a row of five dots takes the width the chore name needs.
 */
export function choreDotSize(fontSize: number): number {
  return Math.round(Math.max(24, Math.min(40, fontSize * 1.5)));
}

/** The gap between dots in a run, in px. */
export function choreDotGap(dotSize: number): number {
  return Math.max(3, Math.round(dotSize * 0.16));
}

/**
 * Width a run of `count` dots needs, gaps included. The `today` row uses it to
 * decide how much of the line is left for the chore name.
 */
export function choreDotRunWidth(dotSize: number, count: number): number {
  if (count <= 0) return 0;
  return count * dotSize + (count - 1) * choreDotGap(dotSize);
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

/** Bounds and default for how many redemptions the reward history lists. */
export const HISTORY_LIMIT = { min: 1, max: 50, fallback: 5 } as const;

/**
 * The reward history's row limit as a whole number inside its bounds. Config
 * can be hand-edited or imported, so anything that is not a finite number
 * (a string, null, NaN) reads as unset rather than slicing the list to nothing.
 */
export function resolveHistoryLimit(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return HISTORY_LIMIT.fallback;
  return Math.max(HISTORY_LIMIT.min, Math.min(HISTORY_LIMIT.max, Math.floor(raw)));
}

// ── Rewards store ─────────────────────────────────────────────────────

export type StoreLayout = 'list' | 'tiles' | 'price-list';

/** The smallest thing on the store a finger has to hit, whatever the type does. */
export const STORE_TAP_PX = 44;
/** A tile's Redeem pill. Smaller than a row's: the whole tile is the target. */
export const STORE_TILE_PILL_PX = 36;
/**
 * Where a store with pills stops shrinking. Below this the words sit beside a
 * 44px pill nearly three times their height, so it scrolls sooner instead.
 */
export const STORE_FONT_FLOOR = 18;
/** The picker rail beside the rewards on a wide, short card, in em. */
export const STORE_RAIL_EM = 13;

const STORE_TITLE_EM = 1.5;
/** Avatar strip: its margin, the chip padding and the avatar, then the balance under it. */
const STORE_PICKER_EM = 2.55;
const STORE_PICKER_BALANCE_EM = 1.1;
/** The picked person's tickets: a 1.5em number and its margins. */
const STORE_BALANCE_EM = 2.4;
const STORE_ROW_PAD_EM = 0.84;
const STORE_ROW_LINE_EM = 1.5;
/** A tile without its pill: padding, icon, two lines of name, cost, gaps. */
const STORE_TILE_EM = 5.9;
const STORE_TILE_GAP_EM = 0.45;
const STORE_TILE_MIN_WIDTH_EM = 7.2;

/** Avatars across the rail. */
export const STORE_RAIL_PER_ROW = 3;
/** One row of rail avatars: chip padding, avatar and the gap under it. */
const STORE_RAIL_CHIP_EM = 2.4;

/**
 * How tall the rail's own content is, in em: the picked person's tickets, then
 * the avatars in rows of three, with or without a balance under each.
 */
export function storeRailEm(members: number, withBalances: boolean): number {
  const rows = Math.ceil(Math.max(0, members) / STORE_RAIL_PER_ROW);
  return STORE_BALANCE_EM + rows * (STORE_RAIL_CHIP_EM + (withBalances ? STORE_PICKER_BALANCE_EM : 0));
}

/**
 * Whether the rail has the height to put a balance under every avatar. When
 * it does not they go first: the picked person's tickets are still in the big
 * number, and an avatar row that fits beats one that is clipped.
 */
export function storeRailShowsBalances(members: number, height: number, fontSize: number, showTitle: boolean): boolean {
  return ((showTitle ? STORE_TITLE_EM : 0) + 0.5 + storeRailEm(members, true)) * fontSize <= height;
}

/**
 * A wide, short card puts the picker in a rail beside the rewards instead of
 * on top of them, where it would take a third of the height.
 */
export function storeUsesRail(width: number, height: number): boolean {
  return width >= 640 && width / Math.max(1, height) >= 1.8;
}

/** How many tiles go across, between two and four. */
export function storeTileColumns(width: number, fontSize: number): number {
  const gap = STORE_TILE_GAP_EM * fontSize;
  return Math.max(2, Math.min(4, Math.floor((width + gap) / (STORE_TILE_MIN_WIDTH_EM * fontSize + gap))));
}

export interface StoreFitInput {
  width: number;
  height: number;
  requested: number;
  layout: StoreLayout;
  /** Rewards on offer. */
  count: number;
  showTitle: boolean;
  /** The avatar strip: list and tiles, with more than one person. */
  showPicker: boolean;
  /** People in the picker, which sets how tall the rail is. */
  members: number;
  /** The picked person's ticket line: list and tiles. */
  showBalance: boolean;
  /** No Redeem pills, so rows are as short as their text. */
  readOnly: boolean;
}

/**
 * The type size at which the store's rewards fit the card, never below the
 * chart's readable floor. Same idea as `fitChoreFontSize`, but the pieces that
 * refuse to shrink here are the 44px pills, and tiles change their column
 * count as the type changes, so the height is searched rather than solved.
 */
export function fitStoreFontSize(input: StoreFitInput): number {
  const { width, height, requested, layout, count, showTitle, showPicker, members, showBalance, readOnly } = input;
  if (height <= 0 || width <= 0) return requested;
  const rail = layout !== 'price-list' && storeUsesRail(width, height);

  const tall = (f: number) => {
    const title = (showTitle ? STORE_TITLE_EM : 0) * f;
    const head = title
      + (rail ? 0 : (showPicker ? (STORE_PICKER_EM + STORE_PICKER_BALANCE_EM) * f : 0) + (showBalance ? STORE_BALANCE_EM * f : 0));
    // The rail is a column of its own beside the rewards, and the card has to
    // hold whichever is taller. Counted without the avatars' balances, which
    // the view drops before it lets the type shrink for them.
    const railTall = rail ? title + (0.5 + storeRailEm(showPicker ? members : 0, false)) * f : 0;
    let rewards: number;
    if (layout === 'tiles') {
      const listWidth = rail ? width - (STORE_RAIL_EM + 1) * f : width;
      const rows = Math.ceil(count / storeTileColumns(listWidth, f));
      const tile = STORE_TILE_EM * f + (readOnly ? 0 : STORE_TILE_PILL_PX);
      rewards = rows * tile + Math.max(0, rows - 1) * STORE_TILE_GAP_EM * f;
    } else {
      const line = STORE_ROW_LINE_EM * f;
      rewards = count * ((readOnly ? line : Math.max(STORE_TAP_PX, line)) + STORE_ROW_PAD_EM * f + 1);
    }
    return Math.max(railTall, head + rewards + MORE_PILL_EM * f);
  };

  // The price list adds "4 can get it" and its dots to every row.
  const rowEm = layout === 'price-list' ? 22 : 17;
  const across = layout === 'tiles' ? width / 14 : (rail ? width - (STORE_RAIL_EM + 1) * CHORE_FONT_FLOOR : width) / rowEm;
  const hi = Math.min(requested, across);
  // Never a floor above what the household asked for or the card can hold across.
  const floor = readOnly ? CHORE_FONT_FLOOR : Math.max(CHORE_FONT_FLOOR, Math.min(STORE_FONT_FLOOR, hi));
  return search(tall, height, hi, floor);
}
