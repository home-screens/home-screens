/**
 * The sleep-schedule window predicate plus segment computation for the
 * sleep-settings 24-hour preview bar.
 *
 * `isMinuteInScheduleWindow` is the single source of truth for window
 * membership — `useSleepManager` wraps it for the runtime and
 * `computeTimelineSegments` uses it for the preview, so the two cannot drift.
 * Segment precedence mirrors `useSleepManager`'s timer: the sleep schedule is
 * checked before the dim schedule, so where the two windows overlap the
 * display is off, not dimmed. Idle dimming is time-independent and cannot be
 * drawn on a clock — the preview component notes it in the legend instead.
 */

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
 * This is THE window predicate for sleep behavior — `useSleepManager`'s
 * `isInScheduleWindow` wraps it with a wall-clock minute, and the timeline
 * preview evaluates it directly, so the preview cannot disagree with the
 * runtime about window edges.
 */
export function isMinuteInScheduleWindow(window: ScheduleWindow, minute: number): boolean {
  const start = parseTimeToMinutes(window.startTime);
  const end = parseTimeToMinutes(window.endTime);
  if (start === null || end === null) return false;
  if (start <= end) return minute >= start && minute < end;
  return minute >= start || minute < end;
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
