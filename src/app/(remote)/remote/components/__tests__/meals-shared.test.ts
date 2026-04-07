import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWeekDates, currentActiveSlot } from '../meals-shared';

afterEach(() => {
  vi.useRealTimers();
});

describe('getWeekDates', () => {
  it('returns exactly 7 entries', () => {
    expect(getWeekDates()).toHaveLength(7);
  });

  it('starts on Sunday by default', () => {
    // Pass a known Sunday so we don't depend on the current day
    const start = new Date(2026, 3, 5); // Sunday Apr 5 2026
    const dates = getWeekDates(start);
    expect(dates[0].dayIndex).toBe(0);
    expect(dates[0].label).toBe('Sunday');
    expect(dates[6].dayIndex).toBe(6);
    expect(dates[6].label).toBe('Saturday');
  });

  it('starts on Monday when weekStartDay is monday', () => {
    // Pass a Wednesday — should align back to the prior Monday
    const wednesday = new Date(2026, 3, 8); // Wed Apr 8 2026
    const dates = getWeekDates(wednesday, 'monday');
    expect(dates[0].dayIndex).toBe(1); // Monday
    expect(dates[0].label).toBe('Monday');
    expect(dates[0].date).toBe('2026-04-06'); // Mon Apr 6
    expect(dates[6].dayIndex).toBe(0); // Sunday
    expect(dates[6].label).toBe('Sunday');
    expect(dates[6].date).toBe('2026-04-12'); // Sun Apr 12
  });

  it('aligns labels to actual day-of-week, not loop index', () => {
    // Regression test for the bug where labels were keyed off `i` instead of d.getDay()
    const monday = new Date(2026, 3, 6); // Mon Apr 6 2026
    const dates = getWeekDates(monday, 'monday');
    expect(dates[0].label).toBe('Monday');
    expect(dates[1].label).toBe('Tuesday');
    expect(dates[2].label).toBe('Wednesday');
    expect(dates[3].label).toBe('Thursday');
    expect(dates[4].label).toBe('Friday');
    expect(dates[5].label).toBe('Saturday');
    expect(dates[6].label).toBe('Sunday');
  });

  it('returns consecutive dates', () => {
    const dates = getWeekDates();
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1].date + 'T12:00:00');
      const curr = new Date(dates[i].date + 'T12:00:00');
      const diff = curr.getTime() - prev.getTime();
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
    }
  });

  it('returns ISO date strings in YYYY-MM-DD format', () => {
    const dates = getWeekDates();
    for (const d of dates) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('formats shortDate as M/D', () => {
    const dates = getWeekDates();
    for (const d of dates) {
      expect(d.shortDate).toMatch(/^\d{1,2}\/\d{1,2}$/);
    }
  });

  it('includes today within the returned week', () => {
    const today = new Date();
    const dates = getWeekDates();
    const todayStr = `${today.getMonth() + 1}/${today.getDate()}`;
    const found = dates.some((d) => d.shortDate === todayStr);
    expect(found).toBe(true);
  });

  it('accepts a custom reference date', () => {
    const start = new Date(2026, 3, 5); // Sunday Apr 5 2026
    const dates = getWeekDates(start);
    expect(dates[0].date).toBe('2026-04-05');
    expect(dates[6].date).toBe('2026-04-11');
  });
});

describe('currentActiveSlot', () => {
  it('returns "breakfast" between 5am and 10am', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 7, 30));
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'])).toBe('breakfast');
  });

  it('returns "lunch" between 10am and 2pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 12, 0));
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'])).toBe('lunch');
  });

  it('returns "dinner" between 5pm and 9pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 18, 30));
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'])).toBe('dinner');
  });

  it('returns null when current hour is outside any enabled slot window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 23, 30)); // 11:30 PM — past dinner end
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'])).toBeNull();
  });

  it('skips disabled slots — returns "lunch" at snack time when snack is disabled', () => {
    // Regression test for the active-slot bug: with snack disabled, we should
    // never claim snack is active, but also shouldn't return a wrong slot.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 15, 0)); // 3 PM — snack hour
    // Snack disabled, no other slot covers 3 PM → null
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'])).toBeNull();
  });

  it('returns "snack" at 3 PM when snack is enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 15, 0));
    expect(currentActiveSlot(['breakfast', 'lunch', 'snack', 'dinner'])).toBe('snack');
  });

  it('accepts an explicit `now` Date (for tick-driven callers)', () => {
    // The parent drives a minute-tick Date through this helper so the active
    // slot advances as the wall clock crosses slot boundaries. This test
    // exercises that explicit-argument path without relying on fake timers.
    const earlyBreakfast = new Date(2026, 3, 3, 7, 30);
    const dinnerHour = new Date(2026, 3, 3, 18, 0);
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], earlyBreakfast)).toBe('breakfast');
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], dinnerHour)).toBe('dinner');
  });
});
