import { addDays, addWeeks, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { clampWeeksToShow, resolveScheduleStart, weekStartsOnFor } from '@/lib/calendar-utils';
import { isModuleEnabled } from '@/lib/schedule';
import type {
  CalendarConfig,
  CalendarSettings,
  FullscreenCalendarConfig,
  ModuleInstance,
  Screen,
} from '@/types/config';

/**
 * Widened fetch window for `/api/calendar`, derived from which calendar
 * views are actually on screen.
 *
 * The calendar API defaults `timeMin` to "now", which is right for
 * upcoming-events lists but starves grid views: a month grid is a wall
 * calendar and should show the whole month, and the fullscreen week/day
 * views were designed to render past days (they dim them via
 * `dimPastEvents` / collapse them via `weekCollapsePastDays`) but never
 * received the data. This module computes the earliest `timeMin` (and,
 * for grids that extend past the `daysAhead` default, the latest
 * `timeMax`) that any enabled calendar module needs.
 *
 * List views filter client-side (`isEventUpcoming` against
 * `listViewCutoff`, in CalendarModule's `allEvents` gate and
 * FullscreenCalendarModule's `selectVisibleEvents`), so widening the shared
 * fetch never leaks past events into them; the views that keep today's
 * finished events (both agendas' `agendaShowFinishedToday`, fullscreen
 * day-timeline) widen to start of today here via `fromStartOfToday`.
 */
export interface CalendarFetchWindow {
  /** ISO instant to fetch from — earlier than the server's "now" default. */
  timeMin: string;
  /** ISO instant to fetch to, or null to keep the server's daysAhead default. */
  timeMax: string | null;
}

interface ModuleWindow {
  start: Date;
  /** null = the module doesn't need more future data than the default. */
  end: Date | null;
}

function monthGridWindow(now: Date, weekStartsOn: 0 | 1): ModuleWindow {
  // Month grids render leading/trailing days of adjacent months, so the
  // window covers the full visible grid, not just the calendar month.
  return {
    start: startOfWeek(startOfMonth(now), { weekStartsOn }),
    end: endOfWeek(endOfMonth(now), { weekStartsOn }),
  };
}

/** The event window a single module's current view renders, or null if the
 *  server's upcoming-only default already covers it. */
/**
 * Window for views that keep today's already-ended events: start of today,
 * server default end. The server's "now" default would starve them of
 * exactly those rows.
 */
function fromStartOfToday(now: Date): ModuleWindow {
  return { start: startOfDay(now), end: null };
}

/** Both agenda views: upcoming-only (server default) unless the flag keeps today's finished events. */
function agendaWindow(config: { agendaShowFinishedToday?: boolean }, now: Date): ModuleWindow | null {
  return config.agendaShowFinishedToday === true ? fromStartOfToday(now) : null;
}

function getModuleWindow(mod: ModuleInstance, now: Date): ModuleWindow | null {
  if (mod.type === 'calendar') {
    const view = (mod.config as Partial<CalendarConfig>).viewMode;
    // Shared with the views (calendar-utils) so the window always covers the grid.
    const weekStartsOn = weekStartsOnFor((mod.config as Partial<CalendarConfig>).startDay);
    if (view === 'month') return monthGridWindow(now, weekStartsOn);
    if (view === 'week') {
      // WeekView honors startDay; the window follows the same convention so
      // past days of the displayed week are always inside the fetch.
      return { start: startOfWeek(now, { weekStartsOn }), end: endOfWeek(now, { weekStartsOn }) };
    }
    if (view === 'multi-week') {
      // Multi-week grid renders N weeks from the current week start. startDay
      // is honored directly so a Monday-start week containing a Sunday (whose
      // Monday lies six days back) is fully covered; the clamp mirrors the
      // view's so hand-edited configs can't starve the clamped rows.
      const weeks = clampWeeksToShow((mod.config as Partial<CalendarConfig>).weeksToShow);
      const start = startOfWeek(now, { weekStartsOn });
      return { start, end: addWeeks(start, weeks) };
    }
    if (view === 'agenda') return agendaWindow(mod.config as Partial<CalendarConfig>, now);
    return null; // daily: upcoming only
  }
  if (mod.type === 'fullscreen-calendar') {
    const view = (mod.config as Partial<FullscreenCalendarConfig>).view;
    // Both fullscreen grids honor startDay; the window follows the same
    // convention so their leading days are always inside the fetch.
    const weekStartsOn = weekStartsOnFor((mod.config as Partial<FullscreenCalendarConfig>).startDay);
    if (view === 'month-grid') return monthGridWindow(now, weekStartsOn);
    if (view === 'week-list') {
      return { start: startOfWeek(now, { weekStartsOn }), end: endOfWeek(now, { weekStartsOn }) };
    }
    if (view === 'schedule') {
      // The anchor decides the first column; both non-default anchors can
      // start away from today (past week days, a future Saturday), so the
      // window follows the anchor and covers the full 7-column maximum.
      const anchor = (mod.config as Partial<FullscreenCalendarConfig>).scheduleStartAnchor;
      const start = resolveScheduleStart(startOfDay(now), anchor, weekStartsOn);
      return anchor && anchor !== 'today'
        ? { start, end: addDays(start, 7) }
        : { start, end: null };
    }
    if (view === 'day-timeline') {
      // Renders all of today; earlier events show dimmed via dimPastEvents
      return fromStartOfToday(now);
    }
    if (view === 'agenda') return agendaWindow(mod.config as Partial<FullscreenCalendarConfig>, now);
    return null;
  }
  return null;
}

/**
 * Compute the calendar fetch window needed by the enabled modules across
 * `screens`, or null when the server defaults (`now` .. `now + daysAhead`)
 * already suffice — in which case callers should omit the params entirely
 * so URLs and server cache keys stay identical to today's behavior.
 *
 * `now` may be a timezone-shifted Date from `createTZDate`, whose ISO
 * instant can be off by up to the OS↔configured-zone offset; the window is
 * padded by a day on each side to absorb that, and views filter to their
 * exact visible range anyway. All boundaries are day-resolution so the
 * resulting URL is stable across renders (no refetch churn).
 */
export function getCalendarFetchWindow(
  screens: Screen[],
  now: Date,
  daysAhead: number,
): CalendarFetchWindow | null {
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const screen of screens) {
    for (const mod of screen.modules) {
      if (!isModuleEnabled(mod)) continue;
      const win = getModuleWindow(mod, now);
      if (!win) continue;
      if (!earliest || win.start < earliest) earliest = win.start;
      if (win.end && (!latest || win.end > latest)) latest = win.end;
    }
  }

  if (!earliest) return null;

  // A window may START in the future (a next-weekend schedule anchor), but
  // timeMin must never move PAST the server's "now" default: modules whose
  // views return null above rely on that default, so a future timeMin would
  // starve every co-present agenda/daily module of today's events.
  const todayStart = startOfDay(now);
  if (earliest > todayStart) earliest = todayStart;

  // Every grid view is startDay-aware, so the ±1-day padding only needs to
  // absorb timezone drift between the OS clock and the configured zone.
  const timeMin = addDays(earliest, -1).toISOString();

  // Only send timeMax when the grid extends beyond the daysAhead default —
  // otherwise leave it to the server so the URL doesn't embed a "now"-based
  // instant that would change every minute. The comparison uses a
  // day-boundary default so the include/omit decision can only flip at
  // midnight, together with every other window boundary.
  let timeMax: string | null = null;
  if (latest) {
    const defaultMax = addDays(startOfDay(now), daysAhead);
    const padded = addDays(latest, 1);
    if (padded > defaultMax) timeMax = padded.toISOString();
  }

  return { timeMin, timeMax };
}

/**
 * True when settings carry at least one non-Google calendar source the server
 * resolves on its own: an enabled iCal URL, an enabled iCloud calendar or
 * birthday feed, or a public-holiday country. Single source of truth for the
 * "is there anything to fetch?" question, so a new source type only needs to be
 * added here.
 */
export function hasCalendarFeedSources(
  calendar: Partial<Pick<CalendarSettings, 'icalSources' | 'icloudSources' | 'holidayCountry'>>,
): boolean {
  return Boolean(
    calendar.icalSources?.some(s => s.enabled)
    || calendar.icloudSources?.some(s => s.enabled)
    || calendar.holidayCountry,
  );
}

/**
 * Build the `/api/calendar` URL for the shared display fetch. Kept pure and
 * separate from the hook so the URL-stability contract is unit-testable: the
 * URL must be byte-stable across renders within a day (a per-render or
 * per-minute change would make `useFetchData` refetch in a loop). `timeMin`
 * is emitted whenever a fetch window exists; `timeMax` only when the window
 * carries one (grids extending past the daysAhead default). Returns `''` when
 * no calendar source is configured, which `useFetchData` treats as "skip".
 * `hasFeedSources` covers every server-resolved source that is not a Google
 * calendar id (iCal URLs, iCloud calendars and birthdays, public holidays); the
 * route reads those from settings itself, so the URL only needs to know that
 * at least one exists.
 */
export function buildCalendarUrl(
  calendarIdList: string[],
  hasFeedSources: boolean,
  fetchWindow: CalendarFetchWindow | null,
  refreshEpoch: number,
): string {
  if (!calendarIdList.length && !hasFeedSources) return '';
  const params = [
    calendarIdList.length ? `calendarIds=${encodeURIComponent(calendarIdList.join(','))}` : '',
    fetchWindow ? `timeMin=${encodeURIComponent(fetchWindow.timeMin)}` : '',
    fetchWindow?.timeMax ? `timeMax=${encodeURIComponent(fetchWindow.timeMax)}` : '',
    refreshEpoch > 0 ? `_r=${refreshEpoch}` : '',
  ].filter(Boolean).join('&');
  return `/api/calendar${params ? `?${params}` : ''}`;
}
