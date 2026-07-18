/**
 * Wall-clock schedule window helpers, shared by display specs that gate on time
 * windows (module scheduling, sleep/dim schedules).
 *
 * The display evaluates schedule windows against a timezone-aware clock. With no
 * `settings.timezone`, that clock is `new Date()` (browser local), which is the
 * same machine and zone as the test runner — so a window bracketed around "now"
 * here lines up with what the display sees. Windows are wrap-safe across
 * midnight, so callers can pick offsets freely regardless of the current hour.
 */

/** A start/end clock window in "HH:MM" form. Assignable to `ModuleSchedule`. */
export interface TimeWindow {
  startTime: string;
  endTime: string;
}

const fmt = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const nowMinutes = () => new Date().getHours() * 60 + new Date().getMinutes();

/**
 * A time window offset from the current minute, wrap-safe across midnight.
 * `windowAround(-120, 120)` brackets now; `windowAround(60, 180)` starts in the
 * future and so excludes now.
 */
export function windowAround(startOffsetMin: number, endOffsetMin: number): TimeWindow {
  const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
  const base = nowMinutes();
  return { startTime: fmt(wrap(base + startOffsetMin)), endTime: fmt(wrap(base + endOffsetMin)) };
}

/**
 * A window whose `startTime > endTime` (an overnight window) that still contains
 * "now", exercising the wrap-around branch of an overnight schedule check. Built
 * as "the whole day minus a 2-minute gap on the far side of the clock", so the
 * gap never wraps midnight (guaranteeing start > end) and never contains now.
 */
export function overnightWindowContainingNow(): TimeWindow {
  const gapStart = nowMinutes() < 720 ? 1437 : 1; // 23:57 (mornings) or 00:01 (afternoons) — far from now
  const gapEnd = gapStart + 2;
  return { startTime: fmt(gapEnd), endTime: fmt(gapStart) };
}
