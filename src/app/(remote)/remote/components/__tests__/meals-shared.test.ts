import { describe, it, expect } from 'vitest';
import { getWeekDates, currentActiveSlot } from '../meals-shared';

describe('getWeekDates', () => {
  it('returns exactly 7 entries', () => {
    expect(getWeekDates(new Date())).toHaveLength(7);
  });

  it('starts on Sunday by default', () => {
    // Pass a known Sunday so we don't depend on the current day
    const start = new Date(2026, 3, 5); // Sunday Apr 5 2026
    const dates = getWeekDates(start);
    expect(dates[0].dayIndex).toBe(0);
    expect(dates[6].dayIndex).toBe(6);
  });

  it('starts on Monday when weekStartDay is monday', () => {
    // Pass a Wednesday — should align back to the prior Monday
    const wednesday = new Date(2026, 3, 8); // Wed Apr 8 2026
    const dates = getWeekDates(wednesday, 'monday');
    expect(dates[0].dayIndex).toBe(1); // Monday
    expect(dates[0].date).toBe('2026-04-06'); // Mon Apr 6
    expect(dates[6].dayIndex).toBe(0); // Sunday
    expect(dates[6].date).toBe('2026-04-12'); // Sun Apr 12
  });

  it('aligns dayIndex to actual day-of-week, not loop index', () => {
    // Regression test for the bug where day indices were keyed off `i` instead of d.getDay()
    const monday = new Date(2026, 3, 6); // Mon Apr 6 2026
    const dates = getWeekDates(monday, 'monday');
    expect(dates[0].dayIndex).toBe(1); // Monday
    expect(dates[1].dayIndex).toBe(2); // Tuesday
    expect(dates[2].dayIndex).toBe(3); // Wednesday
    expect(dates[3].dayIndex).toBe(4); // Thursday
    expect(dates[4].dayIndex).toBe(5); // Friday
    expect(dates[5].dayIndex).toBe(6); // Saturday
    expect(dates[6].dayIndex).toBe(0); // Sunday
  });

  it('returns consecutive dates', () => {
    const dates = getWeekDates(new Date());
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1].date + 'T12:00:00');
      const curr = new Date(dates[i].date + 'T12:00:00');
      const diff = curr.getTime() - prev.getTime();
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
    }
  });

  it('returns ISO date strings in YYYY-MM-DD format', () => {
    const dates = getWeekDates(new Date());
    for (const d of dates) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('formats shortDate as M/D', () => {
    const dates = getWeekDates(new Date());
    for (const d of dates) {
      expect(d.shortDate).toMatch(/^\d{1,2}\/\d{1,2}$/);
    }
  });

  it('includes today within the returned week', () => {
    const today = new Date();
    const dates = getWeekDates(new Date());
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
    const now = new Date(2026, 3, 3, 7, 30);
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], now)).toBe('breakfast');
  });

  it('returns "lunch" between 10am and 2pm', () => {
    const now = new Date(2026, 3, 3, 12, 0);
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], now)).toBe('lunch');
  });

  it('returns "dinner" between 5pm and 9pm', () => {
    const now = new Date(2026, 3, 3, 18, 30);
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], now)).toBe('dinner');
  });

  it('returns null when current hour is outside any enabled slot window', () => {
    const now = new Date(2026, 3, 3, 23, 30); // 11:30 PM, past dinner end
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], now)).toBeNull();
  });

  it('skips disabled slots — returns "lunch" at snack time when snack is disabled', () => {
    // Regression test for the active-slot bug: with snack disabled, we should
    // never claim snack is active, but also shouldn't return a wrong slot.
    const now = new Date(2026, 3, 3, 15, 0); // 3 PM, snack hour
    // Snack disabled, no other slot covers 3 PM → null
    expect(currentActiveSlot(['breakfast', 'lunch', 'dinner'], now)).toBeNull();
  });

  it('returns "snack" at 3 PM when snack is enabled', () => {
    const now = new Date(2026, 3, 3, 15, 0);
    expect(currentActiveSlot(['breakfast', 'lunch', 'snack', 'dinner'], now)).toBe('snack');
  });
});
