/**
 * The sleep-schedule window predicate plus segment computation for the
 * sleep-settings 24-hour preview bar.
 *
 * `isMinuteInScheduleWindow` is the single source of truth for window
 * membership on a clock face: `computeTimelineSegments` draws the preview
 * from it. `useSleepManager` runs `isInstantInScheduleWindow`, which applies
 * the same minutes to real instants and so agrees with the preview on every
 * night except the two a year when the clock jumps.
 * Segment precedence mirrors `useSleepManager`'s timer: the sleep schedule is
 * checked before the dim schedule, so where the two windows overlap the
 * display is off, not dimmed. Idle dimming is time-independent and cannot be
 * drawn on a clock — the preview component notes it in the legend instead.
 */

import { parseDateInTZ, wallClockParts } from './timezone';

/**
 * Default for `SleepSettings.wakeHoldMinutes`: how long an explicit wake
 * (touch, remote wake, remote navigation, remote brightness) holds off a
 * sleep/dim schedule window before it re-asserts. Lives here rather than in
 * `useSleepManager` so the settings-form transforms (plain lib) don't have
 * to import a 'use client' hook module for one constant.
 */
export const DEFAULT_WAKE_HOLD_MINUTES = 5;

export type TimelineState = 'bright' | 'dim' | 'off';

export interface TimelineSegment {
  state: TimelineState;
  /** Minutes from midnight, inclusive. */
  startMin: number;
  /** Minutes from midnight, exclusive. Segments tile [0, 1440]. */
  endMin: number;
}

export interface ScheduleWindow {
  startTime: string; // "HH:MM"
  endTime: string;
}

/**
 * Validating "HH:MM" → minutes-from-midnight parse. Returns null for anything
 * malformed — including the empty string a cleared `<input type="time">` can
 * persist — so callers treat an invalid window as no window instead of letting
 * NaN corrupt comparisons.
 */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Same-day and overnight window membership: start inclusive, end exclusive,
 * start === end is a zero-length window that matches nothing, and an
 * unparseable time makes the window match nothing (fail-safe: never dim or
 * sleep on garbage input).
 *
 * The timeline preview evaluates it directly, and `isInstantInScheduleWindow`
 * (the runtime's test) keeps the same edges, so the preview cannot disagree
 * with the display about when a window starts or ends.
 */
export function isMinuteInScheduleWindow(window: ScheduleWindow, minute: number): boolean {
  const start = parseTimeToMinutes(window.startTime);
  const end = parseTimeToMinutes(window.endTime);
  if (start === null || end === null) return false;
  if (start <= end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

/** `YYYY-MM-DD` shifted by whole days, on the calendar alone. */
function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function minutesToHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Whether `instant` falls inside a run of the window, judged on real instants
 * rather than the wall-clock minute. Each run opens at its start time and
 * closes at its end time as the household's clock reads them (converted with
 * `parseDateInTZ`), and once open it stays open until that real end even if
 * the clock steps back. On fall-back night a 01:30 to 06:00 window opens at
 * the first 01:30 and keeps the display asleep through the repeated hour,
 * where the minute test alone reads 01:00 to 01:29 as outside it. A start or
 * end in the hour spring-forward skips moves on by the size of the skip, so
 * the run still ends and keeps its usual length. On every other night this
 * agrees with `isMinuteInScheduleWindow`, edges included.
 *
 * Without a timezone the machine's own clock is the household's.
 */
export function isInstantInScheduleWindow(window: ScheduleWindow, instant: Date, timezone?: string): boolean {
  const start = parseTimeToMinutes(window.startTime);
  const end = parseTimeToMinutes(window.endTime);
  if (start === null || end === null || start === end) return false;
  const nowMs = instant.getTime();
  const today = wallClockParts(instant, timezone).isoDate;
  // A run lasts under a day, so only one that opened today or yesterday
  // (household calendar) can still be open.
  for (const opensOn of [shiftIsoDate(today, -1), today]) {
    const closesOn = end > start ? opensOn : shiftIsoDate(opensOn, 1);
    const opens = parseDateInTZ(`${opensOn}T${minutesToHHMM(start)}`, timezone).getTime();
    const closes = parseDateInTZ(`${closesOn}T${minutesToHHMM(end)}`, timezone).getTime();
    if (nowMs >= opens && nowMs < closes) return true;
  }
  return false;
}

/**
 * Tile the 24-hour day into contiguous bright/dim/off segments for the given
 * schedule windows (pass only the enabled ones). Always returns at least one
 * segment; with no windows the whole day is a single bright segment.
 */
export function computeTimelineSegments(
  dimWindow?: ScheduleWindow,
  sleepWindow?: ScheduleWindow,
): TimelineSegment[] {
  const stateAt = (minute: number): TimelineState => {
    if (sleepWindow && isMinuteInScheduleWindow(sleepWindow, minute)) return 'off';
    if (dimWindow && isMinuteInScheduleWindow(dimWindow, minute)) return 'dim';
    return 'bright';
  };

  // State can only change at a window edge (or midnight), so evaluate once
  // per boundary interval instead of per minute, then merge equal neighbors.
  // A window with an unparseable time contributes no boundaries — it also
  // matches no minute above, so it simply doesn't exist.
  const boundaries = new Set<number>([0, 1440]);
  for (const w of [dimWindow, sleepWindow]) {
    if (!w) continue;
    const start = parseTimeToMinutes(w.startTime);
    const end = parseTimeToMinutes(w.endTime);
    if (start === null || end === null) continue;
    boundaries.add(start);
    boundaries.add(end);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const segments: TimelineSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const startMin = sorted[i];
    const endMin = sorted[i + 1];
    if (startMin === endMin) continue;
    const state = stateAt(startMin);
    const prev = segments[segments.length - 1];
    if (prev && prev.state === state) {
      prev.endMin = endMin;
    } else {
      segments.push({ state, startMin, endMin });
    }
  }
  return segments;
}
