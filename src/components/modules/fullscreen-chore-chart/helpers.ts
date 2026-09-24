
import type { FamilyMember } from '@/types/family';
import { Sunrise, Sun, Sunset, Clock } from 'lucide-react';
import type { ChoreTimeOfDay } from '@/types/config';
import { TIME_OF_DAY_META, type ResolvedAssignment } from '@/components/modules/chore-chart/types';
import type { ChoreRow } from '@/lib/chore-rows';

export interface ToggleParams {
  choreId: string;
  memberId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  wasCompleted: boolean;
}

export const TOD_ICONS: Record<ChoreTimeOfDay, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  anytime: Clock,
};

export const TOD_ORDER: ChoreTimeOfDay[] = ['morning', 'afternoon', 'evening', 'anytime'];

export function getOrientation(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}

export function getCurrentTimeOfDay(hour: number): ChoreTimeOfDay | null {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 24) return 'evening';
  return null;
}

/**
 * The by-person layout: one section per member with a single-dot row per
 * chore. Shared chores are not deduplicated here ("Marshall: dishes" is the
 * whole point), so the row count is the assignment count. Rows sit in
 * time-of-day order (or the order they were authored in) and stay there
 * when one is completed, so a tap never moves the row out from under the
 * finger.
 */
export function buildMemberRows(
  members: FamilyMember[],
  assignments: ResolvedAssignment[],
  showTimeOfDay: boolean,
): Map<string, ChoreRow[]> {
  const rows = new Map<string, ChoreRow[]>();
  for (const member of members) {
    const mine = assignments.filter((a) => a.memberId === member.id);
    if (mine.length === 0) continue;
    if (showTimeOfDay) {
      mine.sort((a, b) => TIME_OF_DAY_META[a.chore.timeOfDay].order - TIME_OF_DAY_META[b.chore.timeOfDay].order);
    }
    rows.set(member.id, mine.map((a) => ({
      choreId: a.chore.id,
      choreName: a.chore.name,
      choreEmoji: a.chore.emoji,
      timeOfDay: a.chore.timeOfDay,
      points: a.chore.points,
      assignees: [{ memberId: a.memberId, isCompleted: a.isCompleted, isSkipped: a.isSkipped }],
    })));
  }
  return rows;
}

/** Chore rows never shrink below this on the standard 1080-wide kiosk. */
export const ROW_HEIGHT_FLOOR = 56;
/**
 * Row height at `medium`, cozy density, before any headroom: a 30px name
 * beside a 52px dot. `typographySize` and density multiply it.
 */
export const ROW_HEIGHT_CAP = 70;
/** A light day may stretch rows this far past the cap before leaving the rest of the list empty. */
export const ROW_GROWTH = 1.6;
/** Assignee dots never drop below a fingertip, whatever the row height. */
export const MIN_DOT_PX = 44;
/** Or grow past this on the standard kiosk. */
export const MAX_DOT_REF = 60;

export interface FitRowHeightInput {
  /** Height available to the list, in px. */
  listHeight: number;
  /** Chore rows in the tallest stack (the whole list in portrait, the tallest column in landscape). */
  chores: number;
  /** Pixels that stack spends on things that are not rows: band headers and the gaps between bands. */
  fixed?: number;
  /** Canvas scale: 1 on a 1080-wide panel. */
  k: number;
  /** `typographySize` multiplier; raises the cap, never the floor. */
  typoMul: number;
  /** Density multiplier: 1.2 cozy, 1.0 snug. */
  densityMul?: number;
}

/**
 * The fit rule behind the fullscreen chore board: rows share what is left of
 * the list after the fixed blocks, capped by `typographySize` (plus a little
 * headroom on a light day) and floored so a 30-chore day scrolls instead of
 * going unreadable. The name is authored separately and does not grow with
 * the row; only the spacing and the dot do.
 */
export function fitRowHeight({ listHeight, chores, fixed = 0, k, typoMul, densityMul = 1.2 }: FitRowHeightInput): number {
  const floor = ROW_HEIGHT_FLOOR * k;
  const cap = ROW_HEIGHT_CAP * k * typoMul * densityMul;
  if (chores <= 0 || listHeight <= 0) return cap;
  const share = (listHeight - fixed) / chores;
  return Math.max(floor, Math.min(cap * ROW_GROWTH, share));
}

/** Dot for a row of the given height: fingertip-sized when the row can hold one, never taller than the row. */
export function fitDotSize(rowHeight: number, k: number): number {
  const wanted = Math.min(MAX_DOT_REF * k, rowHeight * 0.62);
  const floor = Math.min(MIN_DOT_PX, rowHeight * 0.9);
  return Math.max(floor, wanted);
}

/** Gap between two dots on a row. */
export function dotGap(dotSize: number): number {
  return Math.max(dotSize * 0.2, 8);
}

/** Longest group name a pill shows in full, in characters. */
const GROUP_LABEL_CHARS = 10;

/**
 * The labelled pill a group's rings sit in. Everything but the ring gap is a
 * fraction of the chore-name size, so the width it adds can be known before
 * a column settles its dot size.
 */
export function groupPillMetrics(label: string, nameSize: number, dotSize: number, extraGroups = 0) {
  const labelSize = nameSize * 0.62;
  const padLeft = nameSize * 0.5;
  const padRight = nameSize * 0.32;
  // Bold capitals with tracking run wide of the chore-name glyph estimate.
  const glyph = labelSize * 0.78;
  // A group name can run to forty characters. Past this many it is cut off
  // with an ellipsis: every ring in the column shrinks to make room for the
  // widest pill, and the rings are what people tap.
  const nameMax = GROUP_LABEL_CHARS * glyph;
  const labelWidth = Math.min(label.length * glyph, nameMax) + (extraGroups > 0 ? 3 * glyph : 0);
  return { labelSize, padLeft, padRight, nameMax, extra: labelWidth + dotGap(dotSize) + padLeft + padRight + 2 };
}

/** Top and bottom border of a pill, plus a hair so two pills in neighbouring rows never touch. */
const PILL_EDGES = 4;

/** The least padding a pill keeps above and below its rings when a row is tight. */
function groupPillMinPadY(nameSize: number): number {
  return nameSize * 0.1;
}

/**
 * The shortest row a pill fits in. A flat row's height comes from how many
 * rows have to fit, and on a dense chart the ring may take nine tenths of it,
 * so a row holding a pill has to be at least this tall or the pill runs into
 * the rows above and below and covers their rings.
 */
export function groupPillMinRow(nameSize: number, dotSize: number): number {
  return dotSize + groupPillMinPadY(nameSize) * 2 + PILL_EDGES;
}

/** A pill's top and bottom padding in a row of `rowHeight`: the full amount when there is room, squeezed when there is not. */
export function groupPillPadY(nameSize: number, dotSize: number, rowHeight: number | undefined): number {
  const full = nameSize * 0.26;
  if (rowHeight === undefined) return full;
  return Math.max(groupPillMinPadY(nameSize), Math.min(full, (rowHeight - dotSize - PILL_EDGES) / 2));
}

/** Width a run of `count` dots takes on one line. */
export function dotRunWidth(dotSize: number, count: number): number {
  if (count <= 0) return 0;
  return count * dotSize + (count - 1) * dotGap(dotSize);
}

/** Smallest dot still readable as a ring with a letter in it. */
const MIN_PACKED_DOT = 28;

/**
 * The largest dot, up to `dotSize`, at which `count` dots fit in `room`.
 * Gaps scale with the dot, so solve count*d + (count-1)*max(0.2d, 8) <= room
 * by trying the proportional gap first and the 8px floor second.
 */
export function fitDotsInRoom(dotSize: number, count: number, room: number): number {
  if (count <= 1 || room <= 0) return dotSize;
  const proportional = room / (count + (count - 1) * 0.2);
  const fitted = proportional * 0.2 >= 8 ? proportional : (room - (count - 1) * 8) / count;
  return Math.max(MIN_PACKED_DOT, Math.min(dotSize, fitted));
}

/**
 * Whether a stack of rows should put its dots on their own line under the
 * name. The decision is per column, not per row, so every row in a column
 * has the same shape: a column stacks when its widest row's dots would take
 * more than two fifths of the width beside the name. `extra` is what a
 * group pill adds around the dots.
 */
export function shouldStack(widestDots: number, dotSize: number, rowWidth: number, extra = 0): boolean {
  if (widestDots <= 1 || rowWidth <= 0) return false;
  return dotRunWidth(dotSize, widestDots) + extra > rowWidth * 0.4;
}

/**
 * Split sections across `columns` in order (morning stays left of evening,
 * the household order stays put) so the tallest column is as short as it
 * can be. Sections are never split: a person's chores stay together. Small
 * inputs, so every contiguous partition is tried.
 */
export function splitInOrder<T>(sections: T[], weightOf: (s: T) => number, columns: number): T[][] {
  const cols = Math.max(1, Math.min(columns, sections.length));
  if (cols <= 1) return [[...sections]];
  const w = sections.map(weightOf);
  const n = w.length;
  let best: number[] = [];
  let bestMax = Infinity;
  // Choose cols - 1 cut points between items; prefer the lowest max load, then the earliest cuts.
  const cuts: number[] = [];
  const search = (from: number, remaining: number) => {
    if (remaining === 0) {
      const bounds = [0, ...cuts, n];
      let max = 0;
      for (let c = 0; c < cols; c++) {
        let load = 0;
        for (let i = bounds[c]; i < bounds[c + 1]; i++) load += w[i];
        max = Math.max(max, load);
      }
      if (max < bestMax) { bestMax = max; best = [...cuts]; }
      return;
    }
    for (let cut = from; cut <= n - remaining; cut++) {
      cuts.push(cut);
      search(cut + 1, remaining - 1);
      cuts.pop();
    }
  };
  search(1, cols - 1);
  const bounds = [0, ...best, n];
  return Array.from({ length: cols }, (_, c) => sections.slice(bounds[c], bounds[c + 1]));
}
