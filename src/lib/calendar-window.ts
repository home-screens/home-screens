import { addDays, startOfDay } from 'date-fns';
import { clampWeeksToShow, resolveScheduleStart, weekStartsOnFor } from '@/lib/calendar-utils';
import { viewDayWindow } from '@/lib/calendar-legend';
import { isModuleEnabled } from '@/lib/schedule';
import type {
  CalendarConfig,
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
 * finished events widen to start of today here via `fromStartOfToday` (see
 * its call sites for the current list).
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

/**
 * A grid view's drawn day range via `viewDayWindow` — the same authority
 * the views and legends use, so the fetch can never disagree with the grid.
 * `viewDayWindow`'s half-open end (midnight after the last drawn day) is
 * within a millisecond of the old inclusive end-of-day instants; the fetch
 * window's ±1-day padding absorbs the difference.
 */
function gridWindow(kind: 'week' | 'weeks' | 'month-grid', now: Date, weekStartsOn: 0 | 1, count?: number): ModuleWindow {
  return viewDayWindow({ kind, today: now, weekStartsOn, count });
}

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

/** The event window a single module's current view renders, or null if the
 *  server's upcoming-only default already covers it. */
function getModuleWindow(mod: ModuleInstance, now: Date): ModuleWindow | null {
  if (mod.type === 'calendar') {
    const view = (mod.config as Partial<CalendarConfig>).viewMode;
    // Every grid honors startDay; the window follows the same convention so
    // past days of the displayed range are always inside the fetch. The
    // clamp mirrors the multi-week view's so hand-edited configs can't
    // starve the clamped rows.
    const weekStartsOn = weekStartsOnFor((mod.config as Partial<CalendarConfig>).startDay);
    if (view === 'month') return gridWindow('month-grid', now, weekStartsOn);
    if (view === 'week') return gridWindow('week', now, weekStartsOn);
    if (view === 'multi-week') {
      return gridWindow('weeks', now, weekStartsOn, clampWeeksToShow((mod.config as Partial<CalendarConfig>).weeksToShow));
    }
    if (view === 'agenda') return agendaWindow(mod.config as Partial<CalendarConfig>, now);
    // Daily lists today forward, so the server's upcoming-only default covers
    // it — unless past dimming or the now rule is on. Both exist to show the
    // events that already ended today (dimmed, above the rule), and those rows
    // only reach the module if the fetch starts at midnight. Same pairing as
    // the agenda's `agendaShowFinishedToday`, and the same gate the module
    // itself uses to keep them (`keepFinishedToday` in CalendarModule).
    const daily = mod.config as Partial<CalendarConfig>;
    if (daily.dimPastEvents === true || daily.showNowRule === true) return fromStartOfToday(now);
    return null; // daily: upcoming only
  }
  if (mod.type === 'fullscreen-calendar') {
    const view = (mod.config as Partial<FullscreenCalendarConfig>).view;
    // Both fullscreen grids honor startDay; the window follows the same
    // convention so their leading days are always inside the fetch.
    const weekStartsOn = weekStartsOnFor((mod.config as Partial<FullscreenCalendarConfig>).startDay);
    if (view === 'month-grid') return gridWindow('month-grid', now, weekStartsOn);
    if (view === 'week-list' || view === 'family-grid') return gridWindow('week', now, weekStartsOn);
    // Up next lists today's finished events under "Earlier" and free time
    // draws the whole day's busy blocks, so both need today from midnight.
    if (view === 'up-next' || view === 'free-time') return fromStartOfToday(now);
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

// Source predicates and the /api/calendar URL builder live in
// `calendar-sources.ts`; this file owns only the fetch-window math.
