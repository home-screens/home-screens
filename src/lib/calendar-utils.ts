import { addDays } from 'date-fns';
import type { AgendaSeparators, FullscreenCalendarConfig, ScheduleStartAnchor, TimeFormat, WeatherPlacement, WeekStartDay } from '@/types/config';
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
 * Hex plus rgb()/rgba() functional notation, which is what ModuleStyle
 * backgrounds are stored as. Anything else (named colors, gradients,
 * color-mix) returns null — callers keep their fallback.
 */
function parseCssColorToRgb(color: string | undefined): [number, number, number] | null {
  if (!color) return null;
  const fn = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return parseHexToRgb(color);
}

function wcagLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = wcagLuminance(a);
  const lb = wcagLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Text color for content sitting on a translucent accent tint. The tint
 * hue, the text color, and the surface under both are all independently
 * user-configurable, so no static pairing is safe: estimate the tint's
 * effective surface (accent at `tintAlpha` over the module background),
 * keep `preferred` while it clears 3:1 against that estimate, and fall
 * back to the same YIQ black/white pick as pickPillTextColor when it
 * doesn't. A translucent module background is treated as its own RGB (the
 * wallpaper behind it is unknowable); unparseable inputs keep `preferred`.
 */
export function pickTintedTextColor(preferred: string, accentColor: string, moduleBackground: string | undefined, tintAlpha = 0.25): string {
  const accent = parseHexToRgb(accentColor);
  const ground = parseCssColorToRgb(moduleBackground);
  const text = parseCssColorToRgb(preferred);
  if (!accent || !ground || !text) return preferred;
  const surface = [0, 1, 2].map(
    (i) => Math.round(accent[i] * tintAlpha + ground[i] * (1 - tintAlpha)),
  ) as [number, number, number];
  if (contrastRatio(text, surface) >= 3) return preferred;
  const [r, g, b] = surface;
  return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
}

/**
 * Compact grid-pill time: "8a", "5:30p" (12h) or "17:30" (24h). The modern
 * multi-week themes use this so the title, not the timestamp, owns the pill
 * width. 'aaaaa' is date-fns' narrow day period ("a"/"p" in en-US); locales
 * without a short day period keep whatever their narrow form is.
 */
export function formatEventTimeCompact(date: Date, timeFormat: TimeFormat, locale: string): string {
  if (timeFormat === '24h') return formatDateSync(date, 'HH:mm', { locale });
  const pattern = date.getMinutes() === 0 ? 'haaaaa' : 'h:mmaaaaa';
  return formatDateSync(date, pattern, { locale }).trim();
}

/**
 * Which stretch of a multi-day ALL-DAY event a grid day sees, so the modern
 * multi-week themes can stitch per-day pills into one visual bar (solid
 * first day, hollow squared continuations). All-day ends are exclusive
 * (a single-day event on Sep 7 has end Sep 8). Timed events — including
 * midnight-crossers, which have their own list-view classifier
 * (`classifyEventOnDay`) — always return 'single' here: only all-day pills
 * get continuation styling in the grids.
 */
export function allDaySpanSegment(
  ev: { start: string; end: string; allDay?: boolean },
  date: Date,
): EventDaySegment {
  if (!isAllDayEvent(ev)) return 'single';
  const evStart = parseEventDate(ev.start);
  const evEnd = parseEventDate(ev.end); // exclusive
  const dayEnd = addDays(date, 1);
  const startsToday = evStart >= date && evStart < dayEnd;
  const endsToday = evEnd <= dayEnd;
  if (startsToday) return endsToday ? 'single' : 'first';
  return endsToday ? 'last' : 'middle';
}

/**
 * Localized month-range title for the multi-week grid ("July 2026",
 * "July – August 2026", "December 2026 – January 2027"), derived from the
 * first and last rendered cells. The separator is an en dash — the
 * no-em-dash rule is about prose, and MonthView's title precedent is a
 * bare "MMMM yyyy" this must extend, not replace.
 */
export function formatMonthRangeLabel(start: Date, end: Date, locale: string): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear && start.getMonth() === end.getMonth()) {
    return formatDateSync(start, 'MMMM yyyy', { locale });
  }
  if (sameYear) {
    return `${formatDateSync(start, 'MMMM', { locale })} – ${formatDateSync(end, 'MMMM yyyy', { locale })}`;
  }
  return `${formatDateSync(start, 'MMMM yyyy', { locale })} – ${formatDateSync(end, 'MMMM yyyy', { locale })}`;
}

/**
 * Calendar-color time text for the clean multi-week pills. The pill surface
 * is white at 10% over the module background, and raw mid-saturation
 * calendar colors often land under 3:1 on it — mix toward white in 25%
 * steps until the color clears 3:1 (6 steps bounded, ~82% of the way to
 * white). Lightening only buys contrast on a dark surface: the module
 * background is free-form, so on a light one every step moves the color
 * closer to the surface instead of away from it. When the loop exhausts
 * without clearing 3:1, fall back to the same YIQ black/white pick as
 * pickPillTextColor rather than returning the worst candidate.
 * Unparseable calendar colors fall back to white; unparseable module
 * backgrounds estimate against the default charcoal.
 */
export function pickGridTimeColor(calendarColor: string, moduleBackground: string | undefined): string {
  const rgb = parseHexToRgb(calendarColor);
  if (!rgb) return '#fff';
  const ground = parseCssColorToRgb(moduleBackground) ?? [38, 40, 46];
  const surface = [0, 1, 2].map((i) => Math.round(255 * 0.1 + ground[i] * 0.9)) as [number, number, number];
  let c: [number, number, number] = rgb;
  for (let i = 0; i < 6 && contrastRatio(c, surface) < 3; i++) {
    c = c.map((v) => Math.round(v + (255 - v) * 0.25)) as [number, number, number];
  }
  if (contrastRatio(c, surface) < 3) {
    const [r, g, b] = surface;
    return (299 * r + 587 * g + 114 * b) / 1000 >= 160 ? PILL_DARK_TEXT : '#fff';
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
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
 * Which part of an event a given day sees. Timed multi-day events render
 * day-appropriate labels in list views: the first day shows only the true
 * start ("From 10:00 AM"), middle days promote to an all-day row, and the
 * last day shows only the true end ("Until 3:00 PM"). Single-day events
 * (and all-day events, which keep their existing repeat-per-day rendering)
 * classify as 'single'.
 *
 * The end is exclusive at midnight: an event ending exactly at 00:00 never
 * reaches the next day, matching `isEventOnDay`.
 */
export type EventDaySegment = 'single' | 'first' | 'middle' | 'last';

export function classifyEventOnDay(
  ev: { start: string; end: string; allDay?: boolean },
  date: Date,
  timezone?: string,
): EventDaySegment {
  if (isAllDayEvent(ev)) return 'single';
  return classifyTimedSpan(parseEventWallTime(ev.start, timezone), parseEventWallTime(ev.end, timezone), date);
}

/** classifyEventOnDay's core for callers that already parsed the dates —
 *  list views parse start/end for their labels anyway, and grids mount
 *  hundreds of rows, so re-parsing inside the classifier would double the
 *  ICU work per row. Timed events only. */
export function classifyTimedSpan(evStart: Date, evEnd: Date, date: Date): EventDaySegment {
  const dayEnd = addDays(date, 1);
  const startsToday =
    evStart.getFullYear() === date.getFullYear() &&
    evStart.getMonth() === date.getMonth() &&
    evStart.getDate() === date.getDate();
  if (startsToday) {
    return evEnd > dayEnd ? 'first' : 'single';
  }
  // Continuation day (isEventOnDay already established the overlap): the
  // event runs past this day's midnight → middle; otherwise it ends today.
  return evEnd > dayEnd ? 'middle' : 'last';
}

/**
 * Resolve the first column of the schedule view for a start anchor.
 * 'start-of-week' honors the configured startDay. 'next-weekend' is the
 * Saturday of the current week — or yesterday's Saturday on a Sunday, so
 * the current weekend stays on screen through Sunday night.
 */
export function resolveScheduleStart(
  today: Date,
  anchor: ScheduleStartAnchor | undefined,
  weekStartsOn: 0 | 1,
): Date {
  if (anchor === 'start-of-week') {
    const day = today.getDay();
    const diff = (day - weekStartsOn + 7) % 7;
    return addDays(today, -diff);
  }
  if (anchor === 'next-weekend') {
    const day = today.getDay();
    if (day === 0) return addDays(today, -1); // Sunday: keep the running weekend
    return addDays(today, 6 - day);           // Saturday itself on a Saturday
  }
  return today;
}

// One formatter per locale for the lifetime of the tab: list views call
// formatCountdown per event row on every 60s clock tick, and constructing
// Intl.RelativeTimeFormat is ~13× the cost of formatting with it (same
// rationale as the formatter caches in src/lib/timezone.ts).
const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let rtf = rtfCache.get(locale);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    rtfCache.set(locale, rtf);
  }
  return rtf;
}

/**
 * Natural-language countdown to an event start ("in 5 minutes", "in 2
 * hours", "tomorrow", "in 4 days") via Intl.RelativeTimeFormat, so it is
 * correct in every locale without new dictionary strings. Timed events use
 * minute/hour granularity inside 24h; beyond that (and for all-day events,
 * pass `wholeDays`) the count is whole calendar days to the row's date so
 * consecutive split rows read "in 4 days", "in 5 days". Returns '' for
 * anything already started.
 */
export function formatCountdown(
  start: Date,
  now: Date,
  locale: string,
  wholeDays = false,
): string {
  const diffMs = start.getTime() - now.getTime();
  if (diffMs <= 0) return '';
  if (!wholeDays) {
    const mins = Math.round(diffMs / 60_000);
    if (mins < 60) return relativeFormatter(locale).format(Math.max(1, mins), 'minute');
    if (mins < 24 * 60) return relativeFormatter(locale).format(Math.round(mins / 60), 'hour');
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startDay.getTime() - nowDay.getTime()) / msPerDay);
  // days <= 0 with !wholeDays is reachable only across a DST fall-back day
  // (>24h of minutes inside one calendar day); "tomorrow"-style day phrasing
  // is the honest rendering there, never an hour count.
  if (days <= 0) return wholeDays ? '' : relativeFormatter(locale).format(1, 'day');
  return relativeFormatter(locale).format(days, 'day');
}

/**
 * Fraction of a running event that has elapsed, or null when the event is
 * not currently in progress. Degenerate ranges (end ≤ start) return null —
 * a progress bar over a zero-length event is meaningless.
 */
export function eventProgress(start: Date, end: Date, now: Date): number | null {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return null;
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0 || elapsed >= total) return null;
  return elapsed / total;
}

/**
 * The one shared status slot on a list-view event row: a countdown before
 * the event starts, a progress fraction while it runs — never both, so the
 * slot can swap contents without layout jitter. All-day rows (and middle
 * days of split multi-day events) count whole calendar days to the row's
 * own date, and only when `countdownAllDay` opts them in.
 */
export function eventStatusSlot(opts: {
  start: Date;
  end: Date;
  isAllDayRow: boolean;
  rowDate: Date;
  now: Date;
  locale: string;
  showCountdown: boolean;
  showProgressBar: boolean;
  countdownAllDay: boolean;
  /** Day-relative part for split multi-day rows; default 'single'. */
  segment?: EventDaySegment;
}): { countdown: string | null; progress: number | null } {
  const { start, end, isAllDayRow, rowDate, now, locale } = opts;
  if (isAllDayRow) {
    const countdown = opts.showCountdown && opts.countdownAllDay
      ? formatCountdown(rowDate, now, locale, true)
      : '';
    return { countdown: countdown || null, progress: null };
  }
  const progress = opts.showProgressBar ? eventProgress(start, end, now) : null;
  if (progress != null) return { countdown: null, progress };
  // The last-day row of a split timed event counts whole days to ITS OWN
  // date, so consecutive split rows read "in 4 days", "in 5 days" instead of
  // repeating the countdown to the event's overall start.
  const countdown = opts.showCountdown
    ? formatCountdown(opts.segment === 'last' ? rowDate : start, now, locale, opts.segment === 'last')
    : '';
  return { countdown: countdown || null, progress: null };
}

/** Agenda boundary separators; month beats week when boundaries coincide. */
export type AgendaBoundary = 'month' | 'week' | null;

/**
 * Resolve the fullscreen calendar's weather placement, honoring the legacy
 * `showWeather` boolean from configs saved before the placement enum existed
 * (true → 'header'). Lives here (not in the module component) so the editor
 * config section shares one resolver instead of inlining a copy.
 */
export function resolveWeatherPlacement(
  config: Pick<FullscreenCalendarConfig, 'weatherPlacement' | 'showWeather'>,
): WeatherPlacement {
  if (config.weatherPlacement) return config.weatherPlacement;
  return config.showWeather === false ? 'off' : 'header';
}

/** Which views can render day-header weather / per-event weather. */
const WEATHER_DAYS_VIEWS = new Set(['agenda', 'week-list', 'schedule']);
const WEATHER_EVENTS_VIEWS = new Set(['agenda', 'week-list']);

/**
 * The placement a given view actually renders. Placements carry across view
 * switches (the module keeps one config), so a value the current view has no
 * surface for must degrade to the header pill — never to nothing: "I picked
 * a weather option and weather vanished" is the failure mode this prevents.
 * The stored config is untouched; switching back restores the richer
 * placement.
 */
export function effectiveWeatherPlacement(
  view: FullscreenCalendarConfig['view'],
  config: Pick<FullscreenCalendarConfig, 'weatherPlacement' | 'showWeather'>,
): WeatherPlacement {
  const resolved = resolveWeatherPlacement(config);
  if (resolved === 'off' || resolved === 'header') return resolved;
  const days = WEATHER_DAYS_VIEWS.has(view);
  const events = WEATHER_EVENTS_VIEWS.has(view);
  if (resolved === 'days') return days ? 'days' : 'header';
  if (resolved === 'events') return events ? 'events' : 'header';
  // days-and-events
  if (days && events) return 'days-and-events';
  if (days) return 'days';
  return 'header';
}

/**
 * The separator to render between two consecutive agenda day groups.
 * Precedence: a month boundary renders as the month divider (never both
 * lines); a week boundary that isn't a month boundary renders as the week
 * rule. Hidden empty days don't matter — the comparison is calendar
 * position, not adjacency.
 */
export function boundaryBetween(
  prev: Date,
  next: Date,
  separators: AgendaSeparators | undefined,
  weekStartsOn: 0 | 1,
): AgendaBoundary {
  if (!separators || separators === 'none') return null;
  const monthChanged = prev.getMonth() !== next.getMonth() || prev.getFullYear() !== next.getFullYear();
  if (monthChanged && separators === 'weeks-and-months') return 'month';
  const weekOf = (d: Date) => addDays(d, -((d.getDay() - weekStartsOn + 7) % 7)).toDateString();
  return weekOf(prev) !== weekOf(next) ? 'week' : null;
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
