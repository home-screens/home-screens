import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWeekDates, currentSlotIndex } from '../meals-shared';

afterEach(() => {
  vi.useRealTimers();
});

describe('getWeekDates', () => {
  it('returns exactly 7 entries', () => {
    expect(getWeekDates()).toHaveLength(7);
  });

  it('starts on Sunday (dayIndex 0) and ends on Saturday (dayIndex 6)', () => {
    const dates = getWeekDates();
    expect(dates[0].dayIndex).toBe(0);
    expect(dates[0].label).toBe('Sunday');
    expect(dates[6].dayIndex).toBe(6);
    expect(dates[6].label).toBe('Saturday');
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

  it('accepts a custom start date', () => {
    // Pass a specific date and verify it returns that week
    const start = new Date(2026, 3, 5); // Sunday Apr 5 2026
    const dates = getWeekDates(start);
    expect(dates[0].date).toBe('2026-04-05');
    expect(dates[6].date).toBe('2026-04-11');
  });
});

describe('currentSlotIndex', () => {
  it('returns 0 (breakfast) before 10am', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 7, 30)); // 7:30 AM
    expect(currentSlotIndex()).toBe(0);
    vi.setSystemTime(new Date(2026, 3, 3, 0, 0)); // midnight
    expect(currentSlotIndex()).toBe(0);
  });

  it('returns 1 (lunch) between 10am and 2pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 10, 0)); // 10:00 AM
    expect(currentSlotIndex()).toBe(1);
    vi.setSystemTime(new Date(2026, 3, 3, 13, 59)); // 1:59 PM
    expect(currentSlotIndex()).toBe(1);
  });

  it('returns 2 (snack) between 2pm and 5pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 14, 0)); // 2:00 PM
    expect(currentSlotIndex()).toBe(2);
    vi.setSystemTime(new Date(2026, 3, 3, 16, 59)); // 4:59 PM
    expect(currentSlotIndex()).toBe(2);
  });

  it('returns 3 (dinner) from 5pm onwards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 3, 17, 0)); // 5:00 PM
    expect(currentSlotIndex()).toBe(3);
    vi.setSystemTime(new Date(2026, 3, 3, 23, 59)); // 11:59 PM
    expect(currentSlotIndex()).toBe(3);
  });
});

