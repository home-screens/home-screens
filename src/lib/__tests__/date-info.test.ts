import { describe, it, expect } from 'vitest';
import { parseClockTime, dateInfoParts, dateInfoText, getDateInfoValues, clockTimeInTZ } from '../date-info';

// ---------------------------------------------------------------------------
// parseClockTime
// ---------------------------------------------------------------------------

describe('parseClockTime', () => {
  // 14:30:45
  const afternoon = { hours: 14, minutes: 30, seconds: 45 };

  describe('24h format', () => {
    it('returns correct hours (0-23)', () => {
      const result = parseClockTime(true, afternoon);
      expect(result.hours).toBe(14);
      expect(result.h).toBe(14);
    });

    it('zero-pads hour string', () => {
      const early = { hours: 3, minutes: 5, seconds: 9 };
      const result = parseClockTime(true, early);
      expect(result.hStr).toBe('03');
    });

    it('returns empty period string', () => {
      const result = parseClockTime(true, afternoon);
      expect(result.period).toBe('');
    });
  });

  describe('12h format', () => {
    it('converts 0 hours to 12 AM (midnight)', () => {
      const midnight = { hours: 0, minutes: 0, seconds: 0 };
      const result = parseClockTime(false, midnight);
      expect(result.h).toBe(12);
      expect(result.period).toBe(' AM');
    });

    it('converts 12 hours to 12 PM (noon)', () => {
      const noon = { hours: 12, minutes: 0, seconds: 0 };
      const result = parseClockTime(false, noon);
      expect(result.h).toBe(12);
      expect(result.period).toBe(' PM');
    });

    it('converts 13 to 1 PM', () => {
      const onepm = { hours: 13, minutes: 0, seconds: 0 };
      const result = parseClockTime(false, onepm);
      expect(result.h).toBe(1);
      expect(result.period).toBe(' PM');
    });

    it('converts 23 to 11 PM', () => {
      const late = { hours: 23, minutes: 0, seconds: 0 };
      const result = parseClockTime(false, late);
      expect(result.h).toBe(11);
      expect(result.period).toBe(' PM');
    });

    it('does not pad hour string with leading zero', () => {
      const onepm = { hours: 13, minutes: 5, seconds: 0 };
      const result = parseClockTime(false, onepm);
      expect(result.hStr).toBe('1');
    });

    it('returns period with leading space', () => {
      const morning = { hours: 9, minutes: 0, seconds: 0 };
      const result = parseClockTime(false, morning);
      expect(result.period).toBe(' AM');
    });
  });

  it('always zero-pads minutes and seconds', () => {
    const early = { hours: 14, minutes: 5, seconds: 9 };
    const result = parseClockTime(true, early);
    expect(result.mStr).toBe('05');
    expect(result.sStr).toBe('09');
  });

  it('returns raw hours, minutes, and seconds', () => {
    const result = parseClockTime(true, afternoon);
    expect(result.hours).toBe(14);
    expect(result.minutes).toBe(30);
    expect(result.seconds).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// dateInfoParts / dateInfoText
// ---------------------------------------------------------------------------

describe('dateInfoParts', () => {
  const date = new Date(2024, 2, 15); // March 15, 2024: week 11, day 75
  const labels = { week: 'Woche', day: 'Tag' };

  it('returns nothing when both switches are off or absent', () => {
    expect(dateInfoParts({ showWeekNumber: false, showDayOfYear: false }, date, 'sunday', labels)).toEqual([]);
    expect(dateInfoParts({}, date, 'sunday', labels)).toEqual([]);
  });

  it('labels each number with the words it was given', () => {
    expect(dateInfoParts({ showWeekNumber: true }, date, 'sunday', labels)).toEqual([{ label: 'Woche', value: '11' }]);
    expect(dateInfoParts({ showDayOfYear: true }, date, 'sunday', labels)).toEqual([{ label: 'Tag', value: '75' }]);
  });

  it('puts the week before the day', () => {
    const parts = dateInfoParts({ showWeekNumber: true, showDayOfYear: true }, date, 'sunday', labels);
    expect(parts).toEqual([{ label: 'Woche', value: '11' }, { label: 'Tag', value: '75' }]);
  });

  it('numbers the week by the week start it is given', () => {
    const march2027 = new Date(2027, 2, 10);
    expect(dateInfoParts({ showWeekNumber: true }, march2027, 'monday', labels)[0].value).toBe('10');
    expect(dateInfoParts({ showWeekNumber: true }, march2027, 'sunday', labels)[0].value).toBe('11');
  });
});

describe('dateInfoText', () => {
  const parts = [{ label: 'Week', value: '11' }, { label: 'Day', value: '75' }];

  it('joins label and number with a middle dot between parts', () => {
    expect(dateInfoText(parts)).toBe('Week 11 · Day 75');
    expect(dateInfoText(parts.slice(0, 1))).toBe('Week 11');
  });

  it('takes the Banner view\'s wider separator', () => {
    expect(dateInfoText(parts, '  ·  ')).toBe('Week 11  ·  Day 75');
  });

  it('is null with nothing to print, so a view can leave the line out', () => {
    expect(dateInfoText([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDateInfoValues
// ---------------------------------------------------------------------------

describe('getDateInfoValues', () => {
  it('returns correct weekNumber and dayOfYear for a known date', () => {
    // March 15, 2024 is the 75th day of 2024 (leap year), week 11
    const date = new Date(2024, 2, 15);
    const result = getDateInfoValues(date, 'sunday');
    expect(result.weekNumber).toBe(11);
    expect(result.dayOfYear).toBe(75);
  });

  it('returns day 1 and week 1 for Jan 1', () => {
    const date = new Date(2024, 0, 1);
    const result = getDateInfoValues(date, 'sunday');
    expect(result.dayOfYear).toBe(1);
    expect(result.weekNumber).toBe(1);
  });
  // A clock in a Monday household has to agree with a Monday calendar.
  it('numbers the week the way the week start says', () => {
    const date = new Date(2027, 2, 10);
    expect(getDateInfoValues(date, 'sunday').weekNumber).toBe(11);
    expect(getDateInfoValues(date, 'monday').weekNumber).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// clockTimeInTZ
// ---------------------------------------------------------------------------

describe('clockTimeInTZ', () => {
  // 02:30 GMT in London on the night Chicago skips 02:00 to 03:00. A shifted
  // Date read on a Chicago machine gave 3:30; run under TZ=America/Chicago.
  const GAP_INSTANT = new Date('2026-03-08T02:30:15Z');

  it("reads the zone's own clock, even inside the machine's skipped hour", () => {
    expect(clockTimeInTZ(GAP_INSTANT, 'Europe/London')).toEqual({ hours: 2, minutes: 30, seconds: 15 });
  });

  it('keeps half-hour and 45-minute offsets', () => {
    expect(clockTimeInTZ(GAP_INSTANT, 'Asia/Kolkata')).toEqual({ hours: 8, minutes: 0, seconds: 15 });
    expect(clockTimeInTZ(GAP_INSTANT, 'Asia/Kathmandu')).toEqual({ hours: 8, minutes: 15, seconds: 15 });
  });

  it('reads midnight as hour 0', () => {
    expect(clockTimeInTZ(new Date('2026-03-08T00:00:00Z'), 'UTC').hours).toBe(0);
  });

  it("falls back to the Date's own clock without a zone or with an unknown one", () => {
    const local = new Date(2026, 2, 8, 14, 5, 9);
    expect(clockTimeInTZ(local)).toEqual({ hours: 14, minutes: 5, seconds: 9 });
    expect(clockTimeInTZ(local, 'Not/AZone')).toEqual({ hours: 14, minutes: 5, seconds: 9 });
  });
});
