import { describe, expect, it } from 'vitest';
import { addDays, startOfWeek } from 'date-fns';
import {
  calendarLookAhead, clampLookAhead, daySteps, fullscreenCalendarLookAhead, lookAheadAnchor, lookAheadHeading,
  lookAheadHomeKey, lookAheadLimit, lookAheadReach, mealLookAhead, LOOK_AHEAD_DAYS, LOOK_AHEAD_MONTHS,
} from '@/lib/look-ahead';
import { MEALIE_WINDOW_WEEKS_AFTER, MEALIE_WINDOW_WEEKS_BEFORE } from '@/lib/meal-sources';

const MON = new Date(2026, 10, 2); // Monday, November 2, 2026

describe('which views step, and by how much', () => {
  it('moves the small calendar by its own span', () => {
    expect(calendarLookAhead({ viewMode: 'week' })).toMatchObject({ unit: 'week', count: 1 });
    expect(calendarLookAhead({ viewMode: 'multi-week' })).toMatchObject({ unit: 'week', count: 1 });
    expect(calendarLookAhead({ viewMode: 'rolling' })).toMatchObject({ unit: 'week', count: 1 });
    expect(calendarLookAhead({ viewMode: 'month' })).toMatchObject({ unit: 'month', count: 1 });
    expect(calendarLookAhead({ viewMode: 'daily', daysToShow: 3 })).toMatchObject({ unit: 'day', count: 3 });
    // A list with no day span moves a week.
    expect(calendarLookAhead({ viewMode: 'agenda' })).toMatchObject({ unit: 'week', count: 1 });
  });

  it('gives no arrows to the full-screen views about right now', () => {
    expect(fullscreenCalendarLookAhead({ view: 'up-next' })).toBeNull();
    expect(fullscreenCalendarLookAhead({ view: 'free-time' })).toBeNull();
    expect(fullscreenCalendarLookAhead({ view: 'week-list' })).toMatchObject({ unit: 'week' });
    expect(fullscreenCalendarLookAhead({ view: 'month-grid' })).toMatchObject({ unit: 'month' });
    expect(fullscreenCalendarLookAhead({ view: 'day-timeline' })).toMatchObject({ unit: 'day', count: 1 });
    // The agenda is a list: it moves a week, whatever run of days it shows ("2 weeks ago" read as too far).
    expect(fullscreenCalendarLookAhead({ view: 'agenda' })).toMatchObject({ unit: 'week', count: 1 });
    // The schedule moves by the columns it draws.
    expect(fullscreenCalendarLookAhead({ view: 'schedule' }, 7)).toMatchObject({ unit: 'week', count: 1 });
    expect(fullscreenCalendarLookAhead({ view: 'schedule' }, 3)).toMatchObject({ unit: 'day', count: 3 });
  });

  it('keeps a Mealie plan to the weeks the hub reads, and lets a Home Screens plan reach as far as a calendar', () => {
    expect(mealLookAhead('week', true)).toEqual({ unit: 'week', count: 1, back: MEALIE_WINDOW_WEEKS_BEFORE, forward: MEALIE_WINDOW_WEEKS_AFTER });
    expect(mealLookAhead('week', false)).toEqual({ unit: 'week', count: 1, back: 8, forward: 8 });
    expect(mealLookAhead('list', true)).toMatchObject({ unit: 'week' });
    for (const view of ['today', 'next-meal', 'compact', 'grocery', 'recipes', 'menu-board', 'recipe'] as const) {
      expect(mealLookAhead(view, true)).toBeNull();
      expect(mealLookAhead(view, false)).toBeNull();
    }
  });

  it('reaches eight weeks either way on weeks and days, and two months back and six on', () => {
    expect(calendarLookAhead({ viewMode: 'week' })).toMatchObject({ back: 8, forward: 8 });
    expect(calendarLookAhead({ viewMode: 'month' })).toMatchObject(LOOK_AHEAD_MONTHS);
    // Three days a tap: 18 taps stay inside eight weeks.
    expect(daySteps(3)).toMatchObject({ back: 18, forward: 18 });
    expect(daySteps(3).forward * 3).toBeLessThanOrEqual(LOOK_AHEAD_DAYS);
    // A span longer than eight weeks still gets one tap.
    expect(daySteps(90)).toMatchObject({ back: 1, forward: 1 });
  });

  it('stops at the reach', () => {
    const week = calendarLookAhead({ viewMode: 'week' })!;
    expect(clampLookAhead(9, week)).toBe(8);
    expect(clampLookAhead(-9, week)).toBe(-8);
    expect(clampLookAhead(3, week)).toBe(3);
  });
});

describe('lookAheadAnchor', () => {
  it('is today at rest, and moves by days, weeks or calendar months', () => {
    expect(lookAheadAnchor(MON, 0, daySteps(3))).toBe(MON);
    expect(lookAheadAnchor(MON, 2, daySteps(3))).toEqual(new Date(2026, 10, 8));
    expect(lookAheadAnchor(MON, 1, calendarLookAhead({ viewMode: 'week' })!)).toEqual(new Date(2026, 10, 9));
    expect(lookAheadAnchor(MON, -1, calendarLookAhead({ viewMode: 'week' })!)).toEqual(new Date(2026, 9, 26));
    expect(lookAheadAnchor(MON, 1, calendarLookAhead({ viewMode: 'month' })!)).toEqual(new Date(2026, 11, 2));
    // The 31st lands on the last day of a shorter month.
    expect(lookAheadAnchor(new Date(2026, 0, 31), 1, calendarLookAhead({ viewMode: 'month' })!)).toEqual(new Date(2026, 1, 28));
  });

  it('keeps the wall clock day across a daylight saving change', () => {
    // US clocks fall back on November 1, 2026.
    const sat = new Date(2026, 9, 31);
    expect(lookAheadAnchor(sat, 1, calendarLookAhead({ viewMode: 'week' })!).getHours()).toBe(0);
  });
});

describe('lookAheadHeading', () => {
  const week = calendarLookAhead({ viewMode: 'week' })!;
  const month = calendarLookAhead({ viewMode: 'month' })!;

  it('says weeks the way a family does', () => {
    expect(lookAheadHeading(0, week)).toEqual({ key: 'thisWeek' });
    expect(lookAheadHeading(1, week)).toEqual({ key: 'nextWeek' });
    expect(lookAheadHeading(3, week)).toEqual({ key: 'inWeeks', values: { count: 3 } });
    expect(lookAheadHeading(-1, week)).toEqual({ key: 'lastWeek' });
    expect(lookAheadHeading(-2, week)).toEqual({ key: 'weeksAgo', values: { count: 2 } });
  });

  it('says days for a run of days, and weeks when the run is whole weeks', () => {
    expect(lookAheadHeading(0, daySteps(1))).toEqual({ key: 'today' });
    expect(lookAheadHeading(1, daySteps(1))).toEqual({ key: 'tomorrow' });
    expect(lookAheadHeading(-1, daySteps(1))).toEqual({ key: 'yesterday' });
    expect(lookAheadHeading(2, daySteps(3))).toEqual({ key: 'inDays', values: { count: 6 } });
    expect(lookAheadHeading(-1, daySteps(3))).toEqual({ key: 'daysAgo', values: { count: 3 } });
    expect(lookAheadHeading(0, daySteps(14))).toEqual({ key: 'today' });
    expect(lookAheadHeading(1, daySteps(14))).toEqual({ key: 'inWeeks', values: { count: 2 } });
  });

  it('says months', () => {
    expect(lookAheadHeading(0, month)).toEqual({ key: 'thisMonth' });
    expect(lookAheadHeading(1, month)).toEqual({ key: 'nextMonth' });
    expect(lookAheadHeading(-1, month)).toEqual({ key: 'lastMonth' });
    expect(lookAheadHeading(4, month)).toEqual({ key: 'inMonths', values: { count: 4 } });
    expect(lookAheadHeading(-2, month)).toEqual({ key: 'monthsAgo', values: { count: 2 } });
  });

  it('names the way back by the unit', () => {
    expect(lookAheadHomeKey(week)).toBe('homeWeek');
    expect(lookAheadHomeKey(month)).toBe('homeMonth');
    expect(lookAheadHomeKey(daySteps(3))).toBe('homeToday');
  });
});

describe('lookAheadLimit', () => {
  /* A faded arrow said nothing, and looked broken to a child. */
  it('says how far the wall goes, in the step\'s own unit', () => {
    expect(lookAheadLimit(calendarLookAhead({ viewMode: 'week' })!, 'forward')).toEqual({ key: 'limitAhead.week', values: { count: 8 } });
    expect(lookAheadLimit(calendarLookAhead({ viewMode: 'month' })!, 'forward')).toEqual({ key: 'limitAhead.month', values: { count: 6 } });
    expect(lookAheadLimit(calendarLookAhead({ viewMode: 'month' })!, 'back')).toEqual({ key: 'limitBack.month', values: { count: 2 } });
    expect(lookAheadLimit(mealLookAhead('week', true)!, 'back')).toEqual({ key: 'limitBack.week', values: { count: MEALIE_WINDOW_WEEKS_BEFORE } });
    // Days in whole weeks are said in weeks; three-day steps in days.
    expect(lookAheadLimit(daySteps(1), 'forward')).toEqual({ key: 'limitAhead.week', values: { count: 8 } });
    expect(lookAheadLimit(daySteps(3), 'back')).toEqual({ key: 'limitBack.day', values: { count: 54 } });
  });
});

describe('lookAheadReach', () => {
  it('runs from the first day the arrows reach back to the last day they reach forward', () => {
    const week = calendarLookAhead({ viewMode: 'week' })!;
    const windowAt = (anchor: Date) => {
      const start = startOfWeek(anchor, { weekStartsOn: 0 });
      return { start, end: addDays(start, 7) };
    };
    expect(lookAheadReach(MON, week, windowAt)).toEqual({
      start: new Date(2026, 8, 6), // the week of September 6, eight weeks before November 1
      end: new Date(2027, 0, 3), // the end of the week of December 27
    });
  });
});
