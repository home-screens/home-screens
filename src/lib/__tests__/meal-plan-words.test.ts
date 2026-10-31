import { describe, it, expect } from 'vitest';
import { formatPlannedDays, shownWeek } from '../meal-plan-words';

const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
const more = (count: number) => `${count} more`;

describe('shownWeek', () => {
  /* "This week" in a question before a delete read as the week the family
   * is living in, whichever week was on screen. */
  it('is this week only while today is in it', () => {
    expect(shownWeek(WEEK, '2026-11-18', 'en-US').thisWeek).toBe(true);
    expect(shownWeek(WEEK, '2026-10-31', 'en-US').thisWeek).toBe(false);
  });

  it('names the week by its dates in the language of the household', () => {
    expect(shownWeek(WEEK, '2026-10-31', 'en-US').range).toBe('Nov 16 – 22');
    expect(shownWeek(WEEK, '2026-10-31', 'de-DE').range).toBe('16.–22. Nov.');
  });

  it('adds the year to a week in another year', () => {
    const january = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10'];
    expect(shownWeek(january, '2026-12-20', 'en-US').range).toBe('Jan 4 – 10, 2027');
  });
});

describe('formatPlannedDays', () => {
  it('names a day in the coming week by its weekday and one further out by its date', () => {
    expect(formatPlannedDays(['2026-11-02', '2026-11-12'], '2026-10-31', 'en-US', more)).toBe('Monday and Nov 12');
  });

  it('leaves out days gone by, and says nothing when only those are left', () => {
    expect(formatPlannedDays(['2026-10-20', '2026-11-03'], '2026-10-31', 'en-US', more)).toBe('Tuesday');
    expect(formatPlannedDays(['2026-10-20'], '2026-10-31', 'en-US', more)).toBeNull();
    expect(formatPlannedDays([], '2026-10-31', 'en-US', more)).toBeNull();
  });

  it('names each day once, in order, and counts the rest past the first few', () => {
    const dates = ['2026-11-05', '2026-11-01', '2026-11-01', '2026-11-03', '2026-11-20', '2026-11-27'];
    expect(formatPlannedDays(dates, '2026-10-31', 'en-US', more)).toBe('Sunday, Tuesday, Thursday, and 2 more');
  });

  it('reads in the household language', () => {
    expect(formatPlannedDays(['2026-11-02', '2026-11-12'], '2026-10-31', 'de-DE', more)).toBe('Montag und 12. Nov.');
  });
});
