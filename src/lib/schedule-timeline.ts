/**
 * Week-long segment computation for the schedule editor's visual strip.
 *
 * The strip is the only description of a schedule the editor shows, so it must
 * never disagree with the display about when a module is on. It therefore does
 * not reimplement the day/time-window rules: it evaluates the real
 * `isModuleVisible` predicate at every schedule boundary across a synthetic
 * week and merges equal neighbours. `invert` and overnight wrapping are handled
 * for free because the predicate handles them.
 *
 * This mirrors `computeTimelineSegments` in `sleep-timeline.ts` (the sleep
 * settings' 24-hour bar), one axis wider.
 */

import { isModuleVisible, resolveSpanDays } from '@/lib/schedule';
import { parseTimeToMinutes } from '@/lib/sleep-timeline';
import type { ModuleSchedule } from '@/types/config';

export const MINUTES_PER_DAY = 1440;

export interface WeekSegment {
  /** 0=Sun … 6=Sat, matching `ModuleSchedule.daysOfWeek`. */
  day: number;
  /** Minutes from midnight, inclusive. */
  startMin: number;
  /** Minutes from midnight, exclusive. */
  endMin: number;
  /**
   * The stretch flowed in from the previous day. The renderer squares off the
   * left end to say "this continues", the way a wrapped line of text does.
   */
  continuesFromPrev: boolean;
  /** The stretch flows on into the next day; the right end is squared off. */
  continuesToNext: boolean;
  /**
   * On the piece that ends a stretch, the selected day whose window closes
   * here; `undefined` on every other piece, which has no end to drag.
   *
   * Dragging an end rewrites `endDayOffset`, and the offset is measured from
   * the day that window opened, not from the row the band is drawn on. Two
   * overlapping windows merge into one run on screen, so this cannot be found
   * by chaining backwards through the drawn pieces: that reports whichever
   * window opened earliest and rewrites one the user was not pointing at.
   */
  closingAnchorDay?: number;
}

/**
 * 2024-01-07 is a Sunday, so `anchor.getDay()` equals the `day` index we pass
 * in. Built with local-time `new Date(y, m, d, …)` so the predicate sees the
 * same wall clock the display would. Early January is clear of DST transitions
 * in every zone we support, so no day in the synthetic week is 23 or 25 hours
 * long.
 */
function instantAt(day: number, minute: number): Date {
  return new Date(2024, 0, 7 + day, Math.floor(minute / 60), minute % 60);
}

/**
 * The minutes at which visibility can possibly change within any day: midnight,
 * the window edges, and midnight again. Evaluating once per interval instead of
 * once per minute keeps this to at most three probes per day.
 */
function dayBoundaries(schedule: ModuleSchedule): number[] {
  const set = new Set<number>([0, MINUTES_PER_DAY]);
  for (const time of [schedule.startTime, schedule.endTime]) {
    if (!time) continue;
    const min = parseTimeToMinutes(time);
    // An unparseable time contributes no boundary. `isModuleVisible` treats it
    // as an open end, and the probes below will report that correctly.
    if (min !== null && min > 0 && min < MINUTES_PER_DAY) set.add(min);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Lit stretches for each day of the week, in day then time order.
 *
 * An always-on schedule yields seven full-day segments, each flagged as
 * continuing in both directions, which the strip draws as seven solid rows.
 */
export function computeWeekSegments(schedule: ModuleSchedule | undefined): WeekSegment[] {
  const bounds = dayBoundaries(schedule ?? {});
  const raw: { day: number; startMin: number; endMin: number }[] = [];

  for (let day = 0; day < 7; day++) {
    let openedAt: number | null = null;
    for (let i = 0; i < bounds.length - 1; i++) {
      const from = bounds[i];
      const to = bounds[i + 1];
      // Probe the middle of the interval: visibility cannot change inside one.
      const on = isModuleVisible(schedule, instantAt(day, Math.floor((from + to) / 2)));
      if (on && openedAt === null) openedAt = from;
      else if (!on && openedAt !== null) {
        raw.push({ day, startMin: openedAt, endMin: from });
        openedAt = null;
      }
    }
    if (openedAt !== null) raw.push({ day, startMin: openedAt, endMin: MINUTES_PER_DAY });
  }

  const startsAtMidnight = new Set(raw.filter((s) => s.startMin === 0).map((s) => s.day));
  const runsToMidnight = new Set(raw.filter((s) => s.endMin === MINUTES_PER_DAY).map((s) => s.day));

  // A window that closes on day D opened on D minus the span.
  const span = resolveSpanDays(schedule);

  return raw.map((s) => {
    const continuesToNext = s.endMin === MINUTES_PER_DAY && startsAtMidnight.has((s.day + 1) % 7);
    return {
      ...s,
      continuesFromPrev: s.startMin === 0 && runsToMidnight.has((s.day + 6) % 7),
      continuesToNext,
      closingAnchorDay: continuesToNext ? undefined : (s.day - span + 7) % 7,
    };
  });
}

type Range = { startMin: number; endMin: number };

/**
 * `base` minus every range in `holes`, used by the strip's hover preview to
 * draw only the parts a day would *add*. Without it, a ghost band would be
 * drawn underneath an existing solid one and its rounded ends would peek out.
 */
export function subtractRanges(base: Range, holes: Range[]): Range[] {
  let parts: Range[] = [base];
  for (const hole of holes) {
    const next: Range[] = [];
    for (const part of parts) {
      if (hole.endMin <= part.startMin || hole.startMin >= part.endMin) {
        next.push(part);
        continue;
      }
      if (hole.startMin > part.startMin) next.push({ startMin: part.startMin, endMin: hole.startMin });
      if (hole.endMin < part.endMin) next.push({ startMin: hole.endMin, endMin: part.endMin });
    }
    parts = next;
  }
  return parts;
}
