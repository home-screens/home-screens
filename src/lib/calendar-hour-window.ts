import type { HourWindowMode } from '@/types/config';

/** Bounds for the rolling window length, in hours. */
export const ROLLING_HOURS_MIN = 4;
export const ROLLING_HOURS_MAX = 16;
export const ROLLING_HOURS_DEFAULT = 8;

export interface HourWindow {
  hourStart: number;
  hourEnd: number;
  /** True when the window is following the clock rather than the fixed hours. */
  rolling: boolean;
}

/**
 * The hour range a time grid (schedule, day timeline) draws.
 *
 * `fixed` is the configured start/end. `rolling` is a window of
 * `rollingHours` that starts one hour before the current hour, so the event
 * that is next always renders at full size instead of shrinking into a
 * 6 AM to 10 PM slab where the evening is a sliver. The window clamps to the
 * day (never before 0, never past 24) and falls back to the fixed hours when
 * today is not on screen — a schedule anchored to next weekend has no "now"
 * to follow, and a window that slid with a clock the board doesn't show
 * would cut across days it doesn't belong to.
 */
export function resolveHourWindow(opts: {
  mode: HourWindowMode | undefined;
  rollingHours: number | undefined;
  fixedStart: number;
  fixedEnd: number;
  /** Current fractional hour on the display clock (e.g. 15.67 for 3:40 PM). */
  nowHour: number;
  todayVisible: boolean;
}): HourWindow {
  const fixed: HourWindow = { hourStart: opts.fixedStart, hourEnd: opts.fixedEnd, rolling: false };
  if (opts.mode !== 'rolling' || !opts.todayVisible) return fixed;
  const span = Math.min(ROLLING_HOURS_MAX, Math.max(ROLLING_HOURS_MIN, Math.round(opts.rollingHours ?? ROLLING_HOURS_DEFAULT)));
  const start = Math.max(0, Math.min(Math.floor(opts.nowHour) - 1, 24 - span));
  return { hourStart: start, hourEnd: start + span, rolling: true };
}
