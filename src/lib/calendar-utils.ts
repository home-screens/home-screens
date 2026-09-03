import { addDays, differenceInMinutes, startOfDay } from 'date-fns';
import type { AgendaSeparators, CalendarEvent, CalendarTitleFilter, ScheduleStartAnchor, TimeFormat, WeekStartDay } from '@/types/config';
import { formatDateSync } from '@/i18n/formatters';
import type { TranslateFn } from '@/i18n';
import { toTZWallTime } from '@/lib/timezone';

/** Clamp a multi-week grid's weeksToShow to its 2-12 range. The view and the
 * fetch window share these bounds; 6 is the default when unset or not a
 * number (config.json is hand-editable and the API doesn't type-check it). */
export function clampWeeksToShow(value: number | undefined): number {
  if (!Number.isFinite(value)) return 6;
  return Math.min(12, Math.max(2, value as number));
}

/** Clamp a grid's gridMaxEventsPerCell to its 2-10 range. Unset or not a
 * number (same hand-edited-config caveat as clampWeeksToShow) falls back to
 * the view's own default: 5 on the week grid, whose cells run a full column
 * tall, and 4 on the shorter month and multi-week cells. */
export function clampGridMaxEventsPerCell(value: number | undefined, viewMode: string | undefined): number {
  if (!Number.isFinite(value)) return defaultGridMaxEventsPerCell(viewMode);
  return Math.min(10, Math.max(2, value as number));
}

export function defaultGridMaxEventsPerCell(viewMode: string | undefined): number {
  return viewMode === 'week' ? 5 : 4;
}

/** Clamp a grid's gridDayLabelScale to its 0.8-2 range. Unset or not a number
 * (same hand-edited-config caveat as clampWeeksToShow) reads as 1, leaving the
 * day names and day numbers at their baked-in em sizes. The ceiling is 2
 * because the day-number row grows with the type and the cell has to keep
 * room for at least one event pill under it. */
export function clampGridDayLabelScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.8, value as number));
}

/** Grid views render their full visible range (wall-calendar semantics);
 * list views stay upcoming-only. */
export function isGridView(viewMode: string | undefined): boolean {
  return viewMode === 'week' || viewMode === 'month' || viewMode === 'multi-week';
}

/** The month and multi-week grids share one renderer and one `gridTheme`
 * (the week grid keeps its own single-row layout, styled by gridEventStyle). */
export function isThemedGridView(viewMode: string | undefined): boolean {
  return viewMode === 'month' || viewMode === 'multi-week';
}

/**
 * Saturday or Sunday, from the date itself.
 *
 * The month grid derives its own weekend flag from the column index instead,
 * because a Monday-start grid shifts which columns are the weekend; that is a
 * grid-position question, not a date question, so it stays where it is.
 */
export function isWeekendDay(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
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
 *
 * The shift is memoized on (string, timezone): grid views call this for every
 * (day cell, event) pair on every render, and `toTZWallTime` costs an ICU
 * `formatToParts` extraction per call — thousands per render on a Pi for a
 * busy month grid. Only the epoch is cached; each call returns a fresh Date
 * so callers can never alias through the cache.
 */
const WALL_TIME_CACHE = new Map<string, number>();
const WALL_TIME_CACHE_MAX = 4096;

export function parseEventWallTime(dateStr: string, timezone?: string): Date {
  // Cache lookup first — a hit must skip the parse and zone-regex work the
  // cache exists to amortize. Only shifted results are stored, so a
  // zone-less string simply misses and takes the passthrough below.
  const key = timezone ? `${dateStr}|${timezone}` : null;
  if (key) {
    const cached = WALL_TIME_CACHE.get(key);
    if (cached !== undefined) return new Date(cached);
  }
  const parsed = parseEventDate(dateStr);
  if (!key || !dateStr.includes('T') || !HAS_ZONE_INFO.test(dateStr.trim())) return parsed;
  const wall = toTZWallTime(parsed, timezone!);
  if (WALL_TIME_CACHE.size >= WALL_TIME_CACHE_MAX) WALL_TIME_CACHE.clear();
  WALL_TIME_CACHE.set(key, wall.getTime());
  return wall;
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
 * One day's events in list-view display order: rows that render as all-day
 * (true all-day events plus middle days of split multi-day events, which
 * promote to all-day rendering) first, then timed rows by start. The
 * cross-view invariant behind the fullscreen agenda, week list, and family
 * grid; `eventsForDay` stays the segment-unaware variant the compact grids
 * use.
 */
export function bucketEventsForDay<T extends { start: string; end: string; allDay?: boolean }>(
  events: T[],
  day: Date,
  timezone?: string,
): { ev: T; segment: EventDaySegment; isAllDayRow: boolean }[] {
  return events
    .filter((ev) => isEventOnDay(ev, day, timezone))
    .map((ev) => {
      const segment = classifyEventOnDay(ev, day, timezone);
      return { ev, segment, isAllDayRow: ev.allDay === true || segment === 'middle' };
    })
    .sort((a, b) => {
      if (a.isAllDayRow !== b.isAllDayRow) return a.isAllDayRow ? -1 : 1;
      return compareEventStarts(a.ev.start, b.ev.start);
    });
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
 * Whether a (non-all-day, non-middle-segment) event in today's daily-view
 * column has already ended. Unlike the fullscreen views' equivalent check,
 * this never needs hour-decomposed comparison: the daily view has at most
 * one "today" column per render, so `end` and `now` are always on the same
 * calendar day when `isToday` is true and a direct instant comparison holds.
 */
export function isPastInDailyColumn(
  end: Date,
  now: Date,
  isToday: boolean,
  isAllDay: boolean,
  segment: EventDaySegment,
): boolean {
  return isToday && !isAllDay && segment !== 'middle' && end <= now;
}

/**
 * Whether a timed row in the fullscreen agenda's TODAY group has already
 * ended. The compare is hour-decomposed rather than a direct instant
 * compare: `end` is a display-wall time and `now` ticks on the same wall
 * clock, so on today's group both share a calendar day and clock hours
 * compare directly; the end-of-day bound then keeps a midnight-crossing
 * row (segment 'first', rendered under today) from dimming before it
 * actually ends. Rows on future day groups are never past; all-day and
 * middle-segment rows carry no past meaning. The compact counterpart is
 * `isPastInDailyColumn`, which can use a plain instant compare because its
 * today column always shares `now`'s day.
 */
export function isPastInAgendaGroup(
  end: Date,
  groupDate: Date,
  now: Date,
  isGroupToday: boolean,
  isAllDayRow: boolean,
): boolean {
  if (!isGroupToday || isAllDayRow) return false;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  return end.getHours() + end.getMinutes() / 60 <= nowHour && end <= addDays(groupDate, 1);
}

/** UI glyph for a kind-aware row/cell; null for a plain event (no chrome change). */
export function eventKindGlyph(kind: CalendarEvent['kind']): string | null {
  if (kind === 'birthday') return '🎂';
  if (kind === 'holiday') return '🎉';
  return null;
}

/**
 * Age in the birthday's occurrence year, or null when the source has no birth
 * year on file (Apple's X-APPLE-OMIT-YEAR contacts, and every Google-sourced
 * birthday).
 */
export function birthdayAge(birthYear: number | undefined, occurrenceYear: number): number | null {
  return birthYear == null ? null : occurrenceYear - birthYear;
}

/**
 * Kind-aware replacement for a row's generic "all day" text — "Holiday" or
 * "Birthday · turns N" — or null for a plain event, so the caller falls
 * through to its normal time text. `ns` picks the translation namespace
 * (`t('<ns>.holiday')` etc.) since each surface owns its own copy of these
 * keys in `modules.json`.
 */
export function eventKindLabel(
  event: Pick<CalendarEvent, 'kind' | 'birthYear'>,
  occurrenceYear: number,
  t: TranslateFn,
  ns: 'calendar' | 'fullscreen-calendar' | 'event-detail',
): string | null {
  if (event.kind === 'holiday') return t(`${ns}.holiday`);
  if (event.kind === 'birthday') {
    const age = birthdayAge(event.birthYear, occurrenceYear);
    return age != null ? t(`${ns}.birthdayWithAge`, { age }) : t(`${ns}.birthday`);
  }
  return null;
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

/** "45m", "1h 30m" between two instants — the compact module's row suffix. */
export function formatEventDuration(start: Date, end: Date): string {
  const mins = differenceInMinutes(end, start);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * The one product rule for a list row's time text, shared by both calendar
 * modules: split multi-day rows show only their true partial time on their
 * first and last days ("From 10:00 AM" / "Until 3:00 PM"); plain rows show
 * the view's single-day presentation. `ns` picks the translation namespace,
 * same as `eventKindLabel` — each surface owns its own copy of these keys.
 */
export function eventRowTimeLabel(opts: {
  segment: EventDaySegment | undefined;
  startLabel: string;
  endLabel: string;
  t: TranslateFn;
  ns: 'calendar' | 'fullscreen-calendar';
  /** Plain single-day rows: a full range (default), the start alone (compact chips), or "start · 1h 30m". */
  single?: 'range' | 'start' | 'duration';
  /** Required when `single` is 'duration'. */
  start?: Date;
  end?: Date;
}): string {
  if (opts.segment === 'first') return opts.t(`${opts.ns}.fromTime`, { time: opts.startLabel });
  if (opts.segment === 'last') return opts.t(`${opts.ns}.untilTime`, { time: opts.endLabel });
  if (opts.single === 'start') return opts.startLabel;
  if (opts.single === 'duration' && opts.start && opts.end) {
    return `${opts.startLabel} · ${formatEventDuration(opts.start, opts.end)}`;
  }
  return `${opts.startLabel} – ${opts.endLabel}`;
}

/**
 * Append the quiet "saved" marker to a row's time text when the event's
 * source feed has stopped updating, so stale rows never read as live. The
 * key lives in the compact `calendar.*` namespace; both modules share it.
 */
export function withSavedSuffix(
  label: string,
  ev: { sourceId?: string },
  failingSourceIds: ReadonlySet<string> | undefined,
  t: TranslateFn,
): string {
  return ev.sourceId && failingSourceIds?.has(ev.sourceId)
    ? `${label} · ${t('calendar.savedShort')}`
    : label;
}

/** Agenda boundary separators; month beats week when boundaries coincide. */
export type AgendaBoundary = 'month' | 'week' | null;

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
 *
 * `now` comes from the display's wall clock (`useTZClock`/`createTZDate`), so
 * the event end must be read on the same wall clock — comparing a true epoch
 * instant against the shifted `now` drifts by the OS↔display offset.
 */
export function isEventUpcoming(ev: { end: string }, now: Date, timezone?: string): boolean {
  return parseEventWallTime(ev.end, timezone) > now;
}

/**
 * Cutoff for a list view's "still worth showing" filter, for use as the
 * `now` argument of `isEventUpcoming`: the current instant by default, or
 * start of today when the view keeps events that already ended today (the
 * compact daily view's dimPastEvents/showNowRule, both agendas'
 * agendaShowFinishedToday). One threshold compare rather than
 * "upcoming OR ended after midnight", since start of today <= now.
 */
export function listViewCutoff(now: Date, keepFinishedToday: boolean): Date {
  return keepFinishedToday ? startOfDay(now) : now;
}

/**
 * Case-insensitive substring match against event titles. No terms (or an
 * undefined filter) passes everything through. 'include' keeps only events
 * matching at least one term; 'exclude' drops any event that matches one.
 */
export function applyTitleFilter<T extends { title: string }>(
  events: T[],
  titleFilter: CalendarTitleFilter | undefined,
): T[] {
  const terms = (titleFilter?.terms ?? [])
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length === 0) return events;

  const matches = (title: string) => {
    const lower = title.toLowerCase();
    return terms.some((term) => lower.includes(term));
  };

  return titleFilter?.mode === 'exclude'
    ? events.filter((ev) => !matches(ev.title))
    : events.filter((ev) => matches(ev.title));
}
