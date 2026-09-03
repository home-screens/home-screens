import { describe, it, expect } from 'vitest';
import { addDays, addWeeks, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { getCalendarFetchWindow } from '@/lib/calendar-window';
import { buildCalendarUrl, googleCalendarIdList, hasAnyCalendarSource, hasCalendarFeedSources } from '@/lib/calendar-sources';
import type { CalendarSettings, ModuleInstance, ModuleType, Screen } from '@/types/config';

function makeModule(type: ModuleType, config: Record<string, unknown>, enabled?: boolean): ModuleInstance {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    enabled,
    position: { x: 0, y: 0 },
    size: { w: 400, h: 300 },
    zIndex: 0,
    config,
    style: {} as ModuleInstance['style'],
  };
}

function makeScreen(modules: ModuleInstance[]): Screen {
  return { id: 's1', name: 'Screen 1', backgroundImage: '', modules };
}

// Mid-month reference time: Wednesday July 15, 2026, 10:30 local
const NOW = new Date(2026, 6, 15, 10, 30, 0);
const DAYS_AHEAD = 7;

describe('getCalendarFetchWindow', () => {
  it('returns null when no calendar modules are present', () => {
    const screens = [makeScreen([makeModule('clock', {}), makeModule('weather', {})])];
    expect(getCalendarFetchWindow(screens, NOW, DAYS_AHEAD)).toBeNull();
  });

  it('returns null for upcoming-only calendar views (daily, agenda)', () => {
    const screens = [makeScreen([
      makeModule('calendar', { viewMode: 'daily' }),
      makeModule('calendar', { viewMode: 'agenda' }),
      makeModule('fullscreen-calendar', { view: 'agenda' }),
    ])];
    expect(getCalendarFetchWindow(screens, NOW, DAYS_AHEAD)).toBeNull();
  });

  it('widens to padded start-of-today for agenda with agendaShowFinishedToday', () => {
    // Same fromStartOfToday window as the fullscreen day-timeline branch.
    const screens = [makeScreen([
      makeModule('calendar', { viewMode: 'agenda', agendaShowFinishedToday: true }),
    ])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    expect(win).not.toBeNull();
    expect(win!.timeMin).toBe(addDays(startOfDay(NOW), -1).toISOString());
    expect(win!.timeMax).toBeNull();
  });

  it.each([
    ['dimPastEvents', { viewMode: 'daily', dimPastEvents: true }],
    ['showNowRule', { viewMode: 'daily', showNowRule: true }],
  ])('widens to padded start-of-today for the daily view with %s', (_label, config) => {
    // Both toggles exist to show today's already-ended events (dimmed, above
    // the now rule). Those rows only exist if the fetch starts at midnight —
    // the module's own keepFinishedToday gate can't recover what was never
    // fetched.
    const win = getCalendarFetchWindow([makeScreen([makeModule('calendar', config)])], NOW, DAYS_AHEAD);
    expect(win).not.toBeNull();
    expect(win!.timeMin).toBe(addDays(startOfDay(NOW), -1).toISOString());
    expect(win!.timeMax).toBeNull();
  });

  it('leaves the daily view on the server default when neither toggle is on', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'daily', dimPastEvents: false, showNowRule: false })])];
    expect(getCalendarFetchWindow(screens, NOW, DAYS_AHEAD)).toBeNull();
  });

  it('widens to padded start-of-today for a fullscreen agenda with agendaShowFinishedToday', () => {
    const screens = [makeScreen([
      makeModule('fullscreen-calendar', { view: 'agenda', agendaShowFinishedToday: true }),
    ])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    expect(win).not.toBeNull();
    expect(win!.timeMin).toBe(addDays(startOfDay(NOW), -1).toISOString());
    expect(win!.timeMax).toBeNull();
  });

  it('widens to the padded month grid for a calendar module in month view', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'month' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    expect(win).not.toBeNull();
    const gridStart = startOfWeek(startOfMonth(NOW), { weekStartsOn: 0 });
    // Half-open grid end (midnight after the last cell) + one day of padding.
    const gridEnd = addDays(startOfDay(endOfWeek(endOfMonth(NOW), { weekStartsOn: 0 })), 1);
    expect(win!.timeMin).toBe(addDays(gridStart, -1).toISOString());
    // Grid end (padded) is beyond now + 7 days, so timeMax is sent
    expect(win!.timeMax).toBe(addDays(gridEnd, 1).toISOString());
  });

  it('widens to the padded month grid for fullscreen month-grid view', () => {
    const screens = [makeScreen([makeModule('fullscreen-calendar', { view: 'month-grid' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const gridStart = startOfWeek(startOfMonth(NOW), { weekStartsOn: 0 });
    expect(win!.timeMin).toBe(addDays(gridStart, -1).toISOString());
  });

  it('uses a Sunday-start week for the calendar module week view', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'week' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const weekStart = startOfWeek(NOW, { weekStartsOn: 0 });
    expect(win!.timeMin).toBe(addDays(weekStart, -1).toISOString());
    // Week end + padding is within now + 7 days → server default retained
    expect(win!.timeMax).toBeNull();
  });

  it('widens to weeksToShow weeks for the multi-week view, always sending timeMax', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 4 })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const weekStart = startOfWeek(NOW, { weekStartsOn: 0 });
    expect(win!.timeMin).toBe(addDays(weekStart, -1).toISOString());
    // 4 weeks (28 days) always exceeds the 7-day server default, so timeMax is sent
    expect(win!.timeMax).toBe(addDays(addWeeks(weekStart, 4), 1).toISOString());
  });

  it('defaults the multi-week window to 6 weeks when weeksToShow is unset', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'multi-week' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const weekStart = startOfWeek(NOW, { weekStartsOn: 0 });
    expect(win!.timeMax).toBe(addDays(addWeeks(weekStart, 6), 1).toISOString());
  });

  it('uses a Sunday-start week for fullscreen week-list view by default', () => {
    const screens = [makeScreen([makeModule('fullscreen-calendar', { view: 'week-list' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const weekStart = startOfWeek(NOW, { weekStartsOn: 0 });
    expect(win!.timeMin).toBe(addDays(weekStart, -1).toISOString());
  });

  it('honors startDay monday for the fullscreen week-list and month-grid views', () => {
    const weekWin = getCalendarFetchWindow(
      [makeScreen([makeModule('fullscreen-calendar', { view: 'week-list', startDay: 'monday' })])], NOW, DAYS_AHEAD,
    );
    const weekStart = startOfWeek(NOW, { weekStartsOn: 1 });
    expect(weekWin!.timeMin).toBe(addDays(weekStart, -1).toISOString());

    const monthWin = getCalendarFetchWindow(
      [makeScreen([makeModule('fullscreen-calendar', { view: 'month-grid', startDay: 'monday' })])], NOW, DAYS_AHEAD,
    );
    const gridStart = startOfWeek(startOfMonth(NOW), { weekStartsOn: 1 });
    // Half-open grid end (midnight after the last cell) + one day of padding.
    const gridEnd = addDays(startOfDay(endOfWeek(endOfMonth(NOW), { weekStartsOn: 1 })), 1);
    expect(monthWin!.timeMin).toBe(addDays(gridStart, -1).toISOString());
    expect(monthWin!.timeMax).toBe(addDays(gridEnd, 1).toISOString());
  });

  it('widens to start of today for schedule and day-timeline, keeping default timeMax', () => {
    for (const view of ['schedule', 'day-timeline']) {
      const screens = [makeScreen([makeModule('fullscreen-calendar', { view })])];
      const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
      expect(win!.timeMin).toBe(addDays(startOfDay(NOW), -1).toISOString());
      expect(win!.timeMax).toBeNull();
    }
  });

  it('ignores disabled modules', () => {
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'month' }, false)])];
    expect(getCalendarFetchWindow(screens, NOW, DAYS_AHEAD)).toBeNull();
  });

  it('unions windows across screens and modules', () => {
    const screens = [
      makeScreen([makeModule('fullscreen-calendar', { view: 'schedule' })]),
      makeScreen([makeModule('calendar', { viewMode: 'month' })]),
    ];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const gridStart = startOfWeek(startOfMonth(NOW), { weekStartsOn: 0 });
    // Half-open grid end (midnight after the last cell) + one day of padding.
    const gridEnd = addDays(startOfDay(endOfWeek(endOfMonth(NOW), { weekStartsOn: 0 })), 1);
    expect(win!.timeMin).toBe(addDays(gridStart, -1).toISOString());
    expect(win!.timeMax).toBe(addDays(gridEnd, 1).toISOString());
  });

  it('keeps the server default timeMax when daysAhead already covers the grid', () => {
    // 60 days ahead reaches well past the end of the month grid
    const screens = [makeScreen([makeModule('calendar', { viewMode: 'month' })])];
    const win = getCalendarFetchWindow(screens, NOW, 60);
    expect(win!.timeMax).toBeNull();
  });

  it('clamps out-of-range weeksToShow to the 2-12 bounds', () => {
    const weekStart = startOfWeek(NOW, { weekStartsOn: 0 });
    const hi = getCalendarFetchWindow([makeScreen([makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 99 })])], NOW, DAYS_AHEAD);
    expect(hi!.timeMax).toBe(addDays(addWeeks(weekStart, 12), 1).toISOString());
    expect(hi!.timeMin).toBe(addDays(weekStart, -1).toISOString());
    const lo = getCalendarFetchWindow([makeScreen([makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 1 })])], NOW, DAYS_AHEAD);
    expect(lo!.timeMax).toBe(addDays(addWeeks(weekStart, 2), 1).toISOString());
  });

  it('starts a Monday-start multi-week window at the Monday, not the Sunday', () => {
    // Sunday Aug 16 2026: the Monday-start week containing it begins Aug 10,
    // six days before the Sunday-convention start (Aug 16).
    const sunday = new Date(2026, 7, 16, 10, 30, 0);
    const win = getCalendarFetchWindow(
      [makeScreen([makeModule('calendar', { viewMode: 'multi-week', weeksToShow: 4, startDay: 'monday' })])],
      sunday, DAYS_AHEAD,
    );
    const monday = new Date(2026, 7, 10);
    expect(win!.timeMin).toBe(addDays(monday, -1).toISOString());
    expect(win!.timeMax).toBe(addDays(addWeeks(monday, 4), 1).toISOString());
  });

  it('honors startDay for the week view window too', () => {
    const sunday = new Date(2026, 7, 16, 10, 30, 0);
    const win = getCalendarFetchWindow(
      [makeScreen([makeModule('calendar', { viewMode: 'week', startDay: 'monday' })])],
      sunday, DAYS_AHEAD,
    );
    expect(win!.timeMin).toBe(addDays(new Date(2026, 7, 10), -1).toISOString());
  });

  it('honors startDay for the month view window when the month starts on a Sunday', () => {
    // February 2026 begins on a Sunday: the Monday-start month grid leads
    // with Mon Jan 26, six days before the Sunday-convention start (Feb 1).
    const feb = new Date(2026, 1, 11, 10, 30, 0);
    const win = getCalendarFetchWindow(
      [makeScreen([makeModule('calendar', { viewMode: 'month', startDay: 'monday' })])],
      feb, DAYS_AHEAD,
    );
    expect(win!.timeMin).toBe(addDays(new Date(2026, 0, 26), -1).toISOString());
  });
});

describe('buildCalendarUrl', () => {
  const windowWithMax = { timeMin: '2026-06-27T00:00:00.000Z', timeMax: '2026-08-02T00:00:00.000Z' };
  const windowNoMax = { timeMin: '2026-07-13T00:00:00.000Z', timeMax: null };

  it('returns empty string when no calendar source is configured', () => {
    expect(buildCalendarUrl([], false, windowWithMax, 0)).toBe('');
  });

  it('builds a google-only URL with no window (non-grid display)', () => {
    expect(buildCalendarUrl(['cal-a'], false, null, 0))
      .toBe('/api/calendar?calendarIds=cal-a');
  });

  it('emits timeMin but not timeMax when the window has no max', () => {
    const url = buildCalendarUrl(['cal-a'], false, windowNoMax, 0);
    expect(url).toContain(`timeMin=${encodeURIComponent(windowNoMax.timeMin)}`);
    expect(url).not.toContain('timeMax');
  });

  it('emits both bounds when the window has a max (grid extends past default)', () => {
    const url = buildCalendarUrl(['cal-a'], false, windowWithMax, 0);
    expect(url).toContain(`timeMin=${encodeURIComponent(windowWithMax.timeMin)}`);
    expect(url).toContain(`timeMax=${encodeURIComponent(windowWithMax.timeMax)}`);
  });

  it('serves ical/holiday-only displays (no calendarIds param) with a window', () => {
    const url = buildCalendarUrl([], true, windowNoMax, 0);
    expect(url).toBe(`/api/calendar?timeMin=${encodeURIComponent(windowNoMax.timeMin)}`);
    expect(buildCalendarUrl([], true, null, 0)).toBe('/api/calendar');
  });

  it('appends the cache-bust epoch only when > 0, and is otherwise byte-stable', () => {
    const base = buildCalendarUrl(['cal-a'], false, windowWithMax, 0);
    // Same inputs → identical string (URL stability contract).
    expect(buildCalendarUrl(['cal-a'], false, windowWithMax, 0)).toBe(base);
    expect(base).not.toContain('_r=');
    expect(buildCalendarUrl(['cal-a'], false, windowWithMax, 3)).toContain('_r=3');
  });
});

describe('getCalendarFetchWindow · schedule start anchors', () => {
  it('widens back to the week start for a start-of-week schedule', () => {
    const screens = [makeScreen([
      makeModule('fullscreen-calendar', { view: 'schedule', scheduleStartAnchor: 'start-of-week', startDay: 'sunday' }),
    ])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    const weekStart = startOfWeek(startOfDay(NOW), { weekStartsOn: 0 });
    expect(win!.timeMin).toBe(addDays(weekStart, -1).toISOString());
    // Week start + 7 days + padding stays inside now + daysAhead here, so
    // the server default is retained (timeMax omitted).
    expect(win!.timeMax).toBeNull();
  });

  it('never pushes timeMin into the future for a next-weekend schedule', () => {
    // NOW is a Wednesday; the anchor start (Saturday) is 3 days out. A
    // future timeMin would starve every co-present agenda/daily module of
    // today's events — the window must clamp back to today.
    const screens = [makeScreen([
      makeModule('fullscreen-calendar', { view: 'schedule', scheduleStartAnchor: 'next-weekend' }),
      makeModule('fullscreen-calendar', { view: 'agenda' }),
    ])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    expect(win).not.toBeNull();
    expect(new Date(win!.timeMin).getTime()).toBeLessThanOrEqual(NOW.getTime());
    // The weekend window's end (Saturday + 7 days + padding) still widens timeMax.
    const saturday = addDays(startOfDay(NOW), 3);
    expect(win!.timeMax).toBe(addDays(addDays(saturday, 7), 1).toISOString());
  });

  it('keeps the default anchor behavior unchanged', () => {
    const screens = [makeScreen([makeModule('fullscreen-calendar', { view: 'schedule' })])];
    const win = getCalendarFetchWindow(screens, NOW, DAYS_AHEAD);
    expect(win!.timeMin).toBe(addDays(startOfDay(NOW), -1).toISOString());
    expect(win!.timeMax).toBeNull();
  });
});

describe('hasCalendarFeedSources', () => {
  const icloud = { id: 'ic1', accountId: 'a', kind: 'calendar' as const, url: 'https://caldav.icloud.com/x', name: 'Home', color: '#fff', enabled: true };
  const ical = { id: 'i1', type: 'ical' as const, name: 'School', url: 'https://example.com/a.ics', color: '#000', enabled: true };

  it('is false with no sources', () => {
    expect(hasCalendarFeedSources({})).toBe(false);
    expect(hasCalendarFeedSources({ icalSources: [], icloudSources: [], holidayCountry: '' })).toBe(false);
  });

  it('ignores disabled sources', () => {
    expect(hasCalendarFeedSources({ icalSources: [{ ...ical, enabled: false }] })).toBe(false);
    expect(hasCalendarFeedSources({ icloudSources: [{ ...icloud, enabled: false }] })).toBe(false);
  });

  it('is true for an iCloud-only setup', () => {
    expect(hasCalendarFeedSources({ icloudSources: [icloud] })).toBe(true);
    expect(hasCalendarFeedSources({ icloudSources: [{ ...icloud, kind: 'birthdays', url: '' }] })).toBe(true);
  });

  it('is true for ical-only and holiday-only setups', () => {
    expect(hasCalendarFeedSources({ icalSources: [ical] })).toBe(true);
    expect(hasCalendarFeedSources({ holidayCountry: 'US' })).toBe(true);
  });
});

describe('googleCalendarIdList', () => {
  it('prefers the multi-calendar list and falls back to the legacy single field', () => {
    expect(googleCalendarIdList({ googleCalendarIds: ['a', 'b'], googleCalendarId: 'legacy' })).toEqual(['a', 'b']);
    expect(googleCalendarIdList({ googleCalendarIds: [], googleCalendarId: 'legacy' })).toEqual(['legacy']);
    expect(googleCalendarIdList({ googleCalendarIds: [], googleCalendarId: '' })).toEqual([]);
    expect(googleCalendarIdList({})).toEqual([]);
  });
});

describe('hasAnyCalendarSource', () => {
  const base: CalendarSettings = {
    googleCalendarId: '',
    googleCalendarIds: [],
    icalSources: [],
    daysAhead: 30,
  };

  it('agrees with buildCalendarUrl on whether anything is fetched', () => {
    const cases: Partial<CalendarSettings>[] = [
      {},
      { googleCalendarIds: ['family@example.com'] },
      { googleCalendarId: 'legacy@example.com' },
      { holidayCountry: 'US' },
      { icalSources: [{ id: 'i1', type: 'ical', name: 'School', url: 'https://example.com/a.ics', color: '#000', enabled: true }] },
      { icalSources: [{ id: 'i1', type: 'ical', name: 'School', url: 'https://example.com/a.ics', color: '#000', enabled: false }] },
    ];
    for (const over of cases) {
      const calendar = { ...base, ...over };
      const url = buildCalendarUrl(googleCalendarIdList(calendar), hasCalendarFeedSources(calendar), null, 0);
      expect(hasAnyCalendarSource(calendar)).toBe(url !== '');
    }
  });

  it('is false without settings', () => {
    expect(hasAnyCalendarSource(undefined)).toBe(false);
  });
});
