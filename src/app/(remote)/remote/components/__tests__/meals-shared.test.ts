import { describe, it, expect } from 'vitest';
import { getWeekDates, formatShownMinutes } from '../meals-shared';
import { toISODate } from '@/lib/meal-constants';
import { readMealsPlace, writeMealsPlace } from '../meals-shared';

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

  it('includes today within the returned week', () => {
    const today = new Date();
    const dates = getWeekDates(today);
    expect(dates.some((d) => d.date === toISODate(today))).toBe(true);
  });

  it('accepts a custom reference date', () => {
    const start = new Date(2026, 3, 5); // Sunday Apr 5 2026
    const dates = getWeekDates(start);
    expect(dates[0].date).toBe('2026-04-05');
    expect(dates[6].date).toBe('2026-04-11');
  });
});

describe('formatShownMinutes', () => {
  const words: Record<string, string> = {
    'mealsTab.duration.minutes': '{minutes}m',
    'mealsTab.duration.hours': '{hours}h',
    'mealsTab.duration.hoursMinutes': '{hours}h {minutes}m',
    'mealsTab.duration.prep': '{time} prep',
  };
  const t = (key: string, vars: Record<string, string | number> = {}) =>
    words[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]));

  it('prints minutes, whole hours and hours with minutes', () => {
    expect(formatShownMinutes({ minutes: 45, kind: 'total' }, t)).toBe('45m');
    expect(formatShownMinutes({ minutes: 60, kind: 'total' }, t)).toBe('1h');
    expect(formatShownMinutes({ minutes: 140, kind: 'total' }, t)).toBe('2h 20m');
  });

  it('says prep for the family own meals only where asked', () => {
    expect(formatShownMinutes({ minutes: 15, kind: 'prep' }, t, true)).toBe('15m prep');
    expect(formatShownMinutes({ minutes: 15, kind: 'prep' }, t)).toBe('15m');
    expect(formatShownMinutes({ minutes: 140, kind: 'total' }, t, true)).toBe('2h 20m');
  });
});

describe('readMealsPlace', () => {
  it('reads the tab and the week the address kept', () => {
    expect(readMealsPlace('?tab=meals&meals=plan&week=2026-11-02')).toEqual({ view: 'plan', week: '2026-11-02' });
    expect(readMealsPlace('?tab=meals&meals=grocery')).toEqual({ view: 'grocery', week: null });
  });

  it('opens on This Week for anything missing or not understood', () => {
    expect(readMealsPlace('')).toEqual({ view: 'week', week: null });
    expect(readMealsPlace('?meals=recipes&week=next')).toEqual({ view: 'week', week: null });
    expect(readMealsPlace('?week=2026-02-31')).toEqual({ view: 'week', week: null });
  });
});

describe('writeMealsPlace', () => {
  it('keeps the place beside the other parameters and leaves This Week out', () => {
    const url = new URL('http://hub.local/remote?tab=meals');
    expect(writeMealsPlace(url, { view: 'library', week: '2026-11-09' })).toBe(true);
    expect(url.search).toBe('?tab=meals&meals=library&week=2026-11-09');
    expect(writeMealsPlace(url, { view: 'library', week: '2026-11-09' })).toBe(false);
    expect(writeMealsPlace(url, { view: 'week', week: null })).toBe(true);
    expect(url.search).toBe('?tab=meals');
  });

  it('reads back what it wrote', () => {
    const url = new URL('http://hub.local/remote?tab=meals');
    writeMealsPlace(url, { view: 'plan', week: '2026-10-26' });
    expect(readMealsPlace(url.search)).toEqual({ view: 'plan', week: '2026-10-26' });
  });
});
