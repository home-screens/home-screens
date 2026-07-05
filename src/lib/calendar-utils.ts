import { addDays } from 'date-fns';

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

/**
 * Compare two CalendarEvent start dates for sorting.
 * Uses parseEventDate to avoid the UTC-midnight bug on date-only strings.
 */
export function compareEventStarts(aStart: string, bStart: string): number {
  return parseEventDate(aStart).getTime() - parseEventDate(bStart).getTime();
}

/**
 * Check whether a calendar event falls on a given day.
 *
 * All-day events use half-open interval overlap: [evStart, evEnd) ∩ [date, date+1).
 * Google Calendar and iCal both use exclusive end dates for all-day events
 * (a single-day event on March 15 has end = March 16).
 */
export function isEventOnDay(
  ev: { start: string; end: string; allDay?: boolean },
  date: Date,
): boolean {
  const evStart = parseEventDate(ev.start);
  if (ev.allDay || !ev.start.includes('T')) {
    const evEnd = parseEventDate(ev.end);
    return evStart < addDays(date, 1) && evEnd > date;
  }
  // Timed events: compare calendar day using date parts (avoids cross-timezone issues)
  return (
    evStart.getFullYear() === date.getFullYear() &&
    evStart.getMonth() === date.getMonth() &&
    evStart.getDate() === date.getDate()
  );
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
