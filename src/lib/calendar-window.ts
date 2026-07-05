import { addDays, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
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
 * List views keep their upcoming-only semantics client-side via
 * `isEventUpcoming` (calendar-utils), so widening the shared fetch never
 * leaks past events into them.
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

function monthGridWindow(now: Date): ModuleWindow {
  // Month grids render leading/trailing days of adjacent months, so the
  // window covers the full visible grid, not just the calendar month.
  return {
    start: startOfWeek(startOfMonth(now), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(now), { weekStartsOn: 0 }),
  };
}

/** The event window a single module's current view renders, or null if the
 *  server's upcoming-only default already covers it. */
function getModuleWindow(mod: ModuleInstance, now: Date): ModuleWindow | null {
  if (mod.type === 'calendar') {
    const view = (mod.config as Partial<CalendarConfig>).viewMode;
    if (view === 'month') return monthGridWindow(now);
    if (view === 'week') {
      return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
    }
    return null; // daily / agenda: upcoming only
  }
  if (mod.type === 'fullscreen-calendar') {
    const view = (mod.config as Partial<FullscreenCalendarConfig>).view;
    if (view === 'month-grid') return monthGridWindow(now);
    if (view === 'week-list') {
      // WeekListView renders a Monday-start week
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    }
    if (view === 'schedule' || view === 'day-timeline') {
      // Both render all of today; earlier events show dimmed via dimPastEvents
      return { start: startOfDay(now), end: null };
    }
    return null; // agenda: upcoming only
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

  // The ±1-day padding is also what makes the hardcoded weekStartsOn values
  // above safe: if a view's week-start convention ever drifts by a day from
  // this module, the padded window still covers the visible grid.
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
 * Build the `/api/calendar` URL for the shared display fetch. Kept pure and
 * separate from the hook so the URL-stability contract is unit-testable: the
 * URL must be byte-stable across renders within a day (a per-render or
 * per-minute change would make `useFetchData` refetch in a loop). `timeMin`
 * is emitted whenever a fetch window exists; `timeMax` only when the window
 * carries one (grids extending past the daysAhead default). Returns `''` when
 * no calendar source is configured, which `useFetchData` treats as "skip".
 */
export function buildCalendarUrl(
  calendarIdList: string[],
  hasIcalSources: boolean,
  hasHolidays: boolean,
  fetchWindow: CalendarFetchWindow | null,
  refreshEpoch: number,
): string {
  if (!calendarIdList.length && !hasIcalSources && !hasHolidays) return '';
  const params = [
    calendarIdList.length ? `calendarIds=${encodeURIComponent(calendarIdList.join(','))}` : '',
    fetchWindow ? `timeMin=${encodeURIComponent(fetchWindow.timeMin)}` : '',
    fetchWindow?.timeMax ? `timeMax=${encodeURIComponent(fetchWindow.timeMax)}` : '',
    refreshEpoch > 0 ? `_r=${refreshEpoch}` : '',
  ].filter(Boolean).join('&');
  return `/api/calendar${params ? `?${params}` : ''}`;
}
