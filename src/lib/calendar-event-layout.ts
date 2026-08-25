import { addDays } from 'date-fns';
import { parseEventDate, parseEventWallTime } from '@/lib/calendar-utils';
import { computeOverlapLayout, type OverlapLayout } from '@/lib/fullscreen-overlap';
import type { EventOverlapMode } from '@/types/config';

/**
 * An event's fractional-hour span as rendered on one specific day, clamped to
 * that day: a segment spilling in from the previous day starts at 0, one
 * running past midnight ends at 24. So a 7 PM–6 AM event is [19, 24] on its
 * start day and [0, 6] on the next. An end at or before the start (zero-length
 * or glitched feed data) keeps the legacy "runs to the end of the day"
 * fallback rather than vanishing. `timezone` reads the clock in the display's
 * timezone, matching the `day` wall date the caller derived from `useTZClock`.
 */
export function eventHoursOnDay(
  ev: { start: string; end: string },
  day: Date,
  timezone?: string,
): { startHour: number; endHour: number } {
  const start = parseEventWallTime(ev.start, timezone);
  const end = parseEventWallTime(ev.end, timezone);
  const startHour = start < day ? 0 : start.getHours() + start.getMinutes() / 60;
  // Degenerate data is judged on true instants: across the DST fall-back hour
  // a real event's wall times can collapse to end <= start, which must not
  // trigger the runs-to-end-of-day fallback. When only the wall span
  // collapsed, draw the event at its true duration from the wall start.
  const trueDurationMs = parseEventDate(ev.end).getTime() - parseEventDate(ev.start).getTime();
  let endHour: number;
  if (trueDurationMs <= 0 || end >= addDays(day, 1)) {
    endHour = 24;
  } else if (end.getTime() <= start.getTime()) {
    endHour = Math.min(24, startHour + trueDurationMs / 3_600_000);
  } else {
    endHour = end.getHours() + end.getMinutes() / 60;
  }
  return { startHour, endHour };
}

/** A timed calendar event as far as day-grid layout is concerned. */
export interface TimedLayoutEvent {
  id: string;
  start: string;
  end: string;
}

export interface TimedEventLayout {
  /** Per-event horizontal placement (column / stack), keyed by event id. */
  overlapLayout: Map<string, OverlapLayout>;
  /** Count of columns-mode overflow events hidden at each start hour, for "+N" badges. */
  hiddenStarts: Map<number, number>;
  /**
   * Each event's window-clamped span, keyed by id — the same numbers the
   * overlap layout was computed from. Views must draw pill geometry from this
   * map rather than re-deriving it, so the drawn rectangle can never disagree
   * with the assigned overlap column.
   */
  hourSpans: Map<string, { startHour: number; endHour: number }>;
}

/**
 * Lay out a single day's timed events in the hour grid.
 *
 * Takes each event's day-clamped span (`eventHoursOnDay`, so midnight-crossing
 * events get their correct segment for `day`), clamps it to the visible
 * [hourStart, hourEnd) window, drops events that fall entirely outside it —
 * clamping alone would leave degenerate, zero-height inputs that still occupy
 * an overlap column — runs the shared overlap/column layout, then tallies how
 * many events each start hour hid in columns mode so the caller can render a
 * "+N" indicator instead of silence.
 *
 * Shared verbatim by ScheduleView (once per day column) and DayTimelineView
 * (today only); callers keep their own event filtering and rendering.
 */
export function computeTimedEventLayout(
  events: TimedLayoutEvent[],
  day: Date,
  hourStart: number,
  hourEnd: number,
  overlapMode: EventOverlapMode,
  timezone?: string,
): TimedEventLayout {
  const layoutInput = events
    .map((ev) => {
      const { startHour, endHour } = eventHoursOnDay(ev, day, timezone);
      return {
        id: ev.id,
        startHour: Math.max(startHour, hourStart),
        endHour: Math.min(endHour, hourEnd),
      };
    })
    .filter((e) => e.startHour < hourEnd && e.endHour > e.startHour);
  const overlapLayout = computeOverlapLayout(layoutInput, overlapMode);
  // Columns mode hides overflow (width 0); aggregate hidden events by start
  // position so the view can render a "+N" indicator instead of silence.
  const hiddenStarts = new Map<number, number>();
  for (const input of layoutInput) {
    if (overlapLayout.get(input.id)?.width === 0) {
      hiddenStarts.set(input.startHour, (hiddenStarts.get(input.startHour) ?? 0) + 1);
    }
  }
  const hourSpans = new Map(layoutInput.map((e) => [e.id, { startHour: e.startHour, endHour: e.endHour }]));
  return { overlapLayout, hiddenStarts, hourSpans };
}
