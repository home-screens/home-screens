import { describe, it, expect, vi, afterEach } from 'vitest';
import { getWeekDates, currentSlotIndex, TAG_OPTIONS } from '../meals-shared';

afterEach(() => {
  vi.useRealTimers();
});

describe('getWeekDates', () => {
  it('returns exactly 7 entries', () => {
    expect(getWeekDates()).toHaveLength(7);
  });

  it('starts on Sunday (day 0) and ends on Saturday (day 6)', () => {
    const dates = getWeekDates();
    expect(dates[0].day).toBe(0);
    expect(dates[0].label).toBe('Sunday');
    expect(dates[6].day).toBe(6);
    expect(dates[6].label).toBe('Saturday');
  });

  it('returns consecutive dates', () => {
    const dates = getWeekDates();
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].date.getTime() - dates[i - 1].date.getTime();
      // Diff should be ~24 hours (within DST tolerance)
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
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

  it('places today at index matching its day-of-week', () => {
    const today = new Date();
    const dates = getWeekDates();
    const todayEntry = dates[today.getDay()];
    expect(todayEntry.date.getDate()).toBe(today.getDate());
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

describe('TAG_OPTIONS', () => {
  it('contains expected dietary/preparation tags', () => {
    expect(TAG_OPTIONS).toContain('Quick');
    expect(TAG_OPTIONS).toContain('Healthy');
    expect(TAG_OPTIONS).toContain('Vegetarian');
    expect(TAG_OPTIONS).toContain('Gluten-Free');
  });

  it('has no duplicates', () => {
    expect(new Set(TAG_OPTIONS).size).toBe(TAG_OPTIONS.length);
  });
});
