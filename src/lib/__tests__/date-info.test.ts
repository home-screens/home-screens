import { describe, it, expect } from 'vitest';
import { parseClockTime, buildInfoParts, getDateInfoValues, clockTimeInTZ } from '../date-info';

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
// buildInfoParts
// ---------------------------------------------------------------------------

describe('buildInfoParts', () => {
  const date = new Date(2024, 2, 15); // March 15, 2024

  it('returns empty array when both flags are false', () => {
    const result = buildInfoParts({ showWeekNumber: false, showDayOfYear: false }, date);
    expect(result).toEqual([]);
  });

  it('returns ["Week N"] when only showWeekNumber is true', () => {
    const result = buildInfoParts({ showWeekNumber: true, showDayOfYear: false }, date);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^Week \d+$/);
  });

  it('returns ["Day N"] when only showDayOfYear is true', () => {
    const result = buildInfoParts({ showWeekNumber: false, showDayOfYear: true }, date);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^Day \d+$/);
  });

  it('returns both when both flags are true', () => {
    const result = buildInfoParts({ showWeekNumber: true, showDayOfYear: true }, date);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/^Week \d+$/);
    expect(result[1]).toMatch(/^Day \d+$/);
  });

  it('returns empty array when config has no flags set', () => {
    const result = buildInfoParts({}, date);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDateInfoValues
// ---------------------------------------------------------------------------

describe('getDateInfoValues', () => {
  it('returns correct weekNumber and dayOfYear for a known date', () => {
    // March 15, 2024 is the 75th day of 2024 (leap year), week 11
    const date = new Date(2024, 2, 15);
    const result = getDateInfoValues(date);
    expect(result.weekNumber).toBe(11);
    expect(result.dayOfYear).toBe(75);
  });

  it('returns day 1 and week 1 for Jan 1', () => {
    const date = new Date(2024, 0, 1);
    const result = getDateInfoValues(date);
    expect(result.dayOfYear).toBe(1);
    expect(result.weekNumber).toBe(1);
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
