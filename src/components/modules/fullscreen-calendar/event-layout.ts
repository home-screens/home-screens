import { parseEventDate } from '@/lib/calendar-utils';
import { computeOverlapLayout, type OverlapLayout } from '@/lib/fullscreen-overlap';
import type { EventOverlapMode } from '@/types/config';

/** Convert an ISO date string to fractional hours (e.g. 14:30 → 14.5). */
export function parseTimeToHours(dateStr: string): number {
  const d = parseEventDate(dateStr);
  return d.getHours() + d.getMinutes() / 60;
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
}

/**
 * Lay out a single day's timed events in the hour grid.
 *
 * Clamps each event to the visible [hourStart, hourEnd) window, drops events
 * that fall entirely outside it — clamping alone would leave degenerate,
 * zero-height inputs that still occupy an overlap column — runs the shared
 * overlap/column layout, then tallies how many events each start hour hid in
 * columns mode so the caller can render a "+N" indicator instead of silence.
 *
 * Shared verbatim by ScheduleView (once per day column) and DayTimelineView
 * (today only); callers keep their own event filtering and rendering.
 */
export function computeTimedEventLayout(
  events: TimedLayoutEvent[],
  hourStart: number,
  hourEnd: number,
  overlapMode: EventOverlapMode,
): TimedEventLayout {
  const layoutInput = events
    .map((ev) => {
      const rawStart = parseTimeToHours(ev.start);
      const rawEnd = parseTimeToHours(ev.end);
      return {
        id: ev.id,
        startHour: Math.max(rawStart, hourStart),
        endHour: rawEnd <= rawStart ? hourEnd : Math.min(rawEnd, hourEnd),
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
  return { overlapLayout, hiddenStarts };
}
