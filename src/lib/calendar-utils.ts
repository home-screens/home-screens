import { addDays } from 'date-fns';
import type { TimeFormat, WeekStartDay } from '@/types/config';
import { formatDateSync } from '@/i18n/formatters';
import { parseHexToRgb } from '@/lib/hex-color';
import { toTZWallTime } from '@/lib/timezone';

/** Clamp a multi-week grid's weeksToShow to its 4-12 range. The view and the
 * fetch window share these bounds; 6 is the default when unset or not a
 * number (config.json is hand-editable and the API doesn't type-check it). */
export function clampWeeksToShow(value: number | undefined): number {
  if (!Number.isFinite(value)) return 6;
  return Math.min(12, Math.max(4, value as number));
}

/** Grid views render their full visible range (wall-calendar semantics);
 * list views stay upcoming-only. */
export function isGridView(viewMode: string | undefined): boolean {
  return viewMode === 'week' || viewMode === 'month' || viewMode === 'multi-week';
}

/** date-fns weekStartsOn for a config startDay. The views and the fetch
 * window must share this mapping so the window always covers the grid. */
export function weekStartsOnFor(startDay: WeekStartDay | undefined): 0 | 1 {
  return startDay === 'monday' ? 1 : 0;
}

/** getWeek options matching a grid's startDay: ISO 8601 numbering for
 * Monday-start grids, the US Sunday convention otherwise. Without these,
 * getWeek defaults to the US system and Monday-start rows get labeled with
 * week numbers that disagree with their own cells around year boundaries. */
export function weekNumberOptions(startDay: WeekStartDay | undefined): {
  weekStartsOn: 0 | 1;
  firstWeekContainsDate: 1 | 4;
} {
  return startDay === 'monday'
    ? { weekStartsOn: 1, firstWeekContainsDate: 4 }
    : { weekStartsOn: 0, firstWeekContainsDate: 1 };
}

/**
 * Parse an event date string, treating date-only strings ("2026-03-22") as
 * local midnight instead of UTC midnight (the JS default for date-only strings).
 *
 * Per the ECMAScript spec, `new Date("2026-03-22")` is parsed as UTC midnight,
 * which becomes the previous day in any timezone west of UTC. Appending
 * "T00:00:00" forces local-time interpretation instead.
 */
export function parseEventDate(dateStr: string): Date {
  if (!dateStr.includes('T')) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

// Explicit zone designator: trailing Z or ±HH:MM / ±HHMM offset.
const HAS_ZONE_INFO = /Z|[+-]\d{2}:?\d{2}$/;

/**
 * Parse an event date string into the display's wall time. Timed strings
 * with an explicit zone (all shipped producers emit RFC3339 offsets or UTC
 * ISO strings) are absolute instants, so their clock reading must come from
 * the configured display timezone, not the Pi's OS timezone — this returns
 * them shifted via `toTZWallTime` so `getHours()` etc. read display-local.
 * Date-only strings and zone-less timed strings are already wall times and
 * pass through `parseEventDate` unchanged, as does everything when no
 * timezone is configured.
 */
export function parseEventWallTime(dateStr: string, timezone?: string): Date {
  const parsed = parseEventDate(dateStr);
  if (!timezone || !dateStr.includes('T') || !HAS_ZONE_INFO.test(dateStr.trim())) return parsed;
  return toTZWallTime(parsed, timezone);
}

/**
 * Compare two CalendarEvent start dates for sorting.
 * Uses parseEventDate to avoid the UTC-midnight bug on date-only strings.
 */
export function compareEventStarts(aStart: string, bStart: string): number {
  return parseEventDate(aStart).getTime() - parseEventDate(bStart).getTime();
}

/** Whether an event renders as all-day: the flag, or a date-only start. */
export function isAllDayEvent(ev: { start: string; allDay?: boolean }): boolean {
  return ev.allDay === true || !ev.start.includes('T');
}

/**
 * Events for one grid day cell, in display order: all-day events first
 * (multi-day all-days repeat on each covered day via `isEventOnDay`),
 * then timed events by start time. Sort keys are computed once per event
 * (decorate-sort-undecorate) — a comparator that re-parses both dates runs
 * O(n log n) parses per cell, and grids call this for up to 84 cells.
 * `timezone` buckets timed events by their display-timezone day.
 */
export function eventsForDay<T extends { start: string; end: string; allDay?: boolean }>(
  events: T[],
  date: Date,
  timezone?: string,
): T[] {
  return events
    .filter((ev) => isEventOnDay(ev, date, timezone))
    .map((ev) => ({ ev, allDay: isAllDayEvent(ev), startMs: parseEventDate(ev.start).getTime() }))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startMs - b.startMs;
    })
    .map((d) => d.ev);
}

/**
 * Event start time in the household clock preference. 24h is naturally
 * constant-width ("20:05"); 12h defaults to the unpadded "8:05 AM" that
 * list surfaces have always shown, with `pad` opting stacked grid pills
 * into zero-padded "08:05 AM" so every prefix renders at the same width.
 * `trim()` drops the trailing space for locales whose day-period token
 * renders empty (e.g. locales without AM/PM); no shipped locale renders an
 * empty day period today, so it is defensive only.
 */
export function formatEventTime(date: Date, timeFormat: TimeFormat, locale: string, pad = false): string {
  const pattern = timeFormat === '24h' ? 'HH:mm' : pad ? 'hh:mm a' : 'h:mm a';
  return formatDateSync(date, pattern, { locale }).trim();
}

const PILL_DARK_TEXT = '#1b1b1f';

/**
 * Auto-contrast text color for a solid pill background: light calendar
 * colors (yellows, limes) get near-black text, dark ones white. YIQ
 * luminance `((299R + 587G + 114B) / 1000) >= 160` picks dark; anything
 * unparseable (named colors, junk) falls back to white like the mockup's
 * "always white" policy.
 */
export function pickPillTextColor(hex: string | undefined): string {
  const rgb = hex ? parseHexToRgb(hex) : null;
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
}

/**
 * Check whether a calendar event falls on a given day.
 *
 * All-day events use half-open interval overlap: [evStart, evEnd) ∩ [date, date+1).
 * Google Calendar and iCal both use exclusive end dates for all-day events
 * (a single-day event on March 15 has end = March 16).
 *
 * Timed events match their start day by date parts (so zero-length or
 * end-before-start feed glitches still render somewhere), then any later day
 * the event is still running into — a 7 PM–6 AM event appears on both days.
 * The end is exclusive: ending exactly at midnight does not reach the next day.
 *
 * `timezone` puts timed events in their display-timezone day: `date` is a
 * wall-time day from `createTZDate`, so an OS-parsed start would bucket a
 * late-evening event into the wrong cell whenever the Pi's OS timezone
 * differs from the configured one. All-day starts are wall dates already
 * and never shift.
 */
export function isEventOnDay(
  ev: { start: string; end: string; allDay?: boolean },
  date: Date,
  timezone?: string,
): boolean {
  if (isAllDayEvent(ev)) {
    const evStart = parseEventDate(ev.start);
    const evEnd = parseEventDate(ev.end);
    return evStart < addDays(date, 1) && evEnd > date;
  }
  const evStart = parseEventWallTime(ev.start, timezone);
  // Timed events: compare calendar day using date parts (avoids cross-timezone issues)
  if (
    evStart.getFullYear() === date.getFullYear() &&
    evStart.getMonth() === date.getMonth() &&
    evStart.getDate() === date.getDate()
  ) {
    return true;
  }
  // Continuation days: started before this day's midnight and still running past it.
  const evEnd = parseEventWallTime(ev.end, timezone);
  return evStart < date && evEnd > date;
}

/**
 * Whether an event is still relevant to an "upcoming" list: ongoing or future.
 *
 * Mirrors the calendar API's default `timeMin = now` semantics (Google
 * filters on event *end*, exclusive), so list views behave identically
 * whether or not the shared fetch window was widened for a co-present
 * month/week grid view. All-day events use exclusive end dates (a single-day
 * event on March 15 has end = March 16), so they stay "upcoming" all day.
 */
export function isEventUpcoming(ev: { end: string }, now: Date): boolean {
  return parseEventDate(ev.end) > now;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

// Max Unicode code point — `String.fromCodePoint` throws RangeError above this.
const MAX_CODE_POINT = 0x10ffff;

function decodeNumericEntity(literal: string, code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > MAX_CODE_POINT) return literal;
  return String.fromCodePoint(code);
}

/**
 * Normalize an event description from an ICS or Google Calendar feed for display.
 *
 * ICS DESCRIPTION fields are nominally plain text but commonly contain inline
 * HTML (`<p>…</p>`, `<br>`, entity references). This converts block-level breaks
 * to real newlines, strips remaining tags, decodes common entities, and trims —
 * so callers can render with `whitespace-pre-line` and let CSS handle wrapping.
 *
 * Output is **plain text only**. Never feed it to `dangerouslySetInnerHTML` or a
 * Markdown renderer: tag-stripping happens before entity decoding, so
 * `&lt;script&gt;` would become a real `<script>` tag in HTML context.
 */
export function sanitizeEventDescription(raw?: string | null): string {
  if (!raw) return '';
  let out = raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (_, ref: string) => {
      if (ref.startsWith('#x') || ref.startsWith('#X')) {
        return decodeNumericEntity(_, parseInt(ref.slice(2), 16));
      }
      if (ref.startsWith('#')) {
        return decodeNumericEntity(_, parseInt(ref.slice(1), 10));
      }
      return ENTITY_MAP[ref.toLowerCase()] ?? _;
    });
  // Collapse runs of inline whitespace per line, then collapse 3+ blank lines to 2.
  out = out
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}
