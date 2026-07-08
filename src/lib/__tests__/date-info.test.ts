import { describe, it, expect } from 'vitest';
import { parseClockTime, buildInfoParts, getDateInfoValues } from '../date-info';

// ---------------------------------------------------------------------------
// parseClockTime
// ---------------------------------------------------------------------------

describe('parseClockTime', () => {
  // Fixed date: March 15, 2024 at 14:30:45
  const afternoon = new Date(2024, 2, 15, 14, 30, 45);

  describe('24h format', () => {
    it('returns correct hours (0-23)', () => {
      const result = parseClockTime(true, afternoon);
      expect(result.hours).toBe(14);
      expect(result.h).toBe(14);
    });

    it('zero-pads hour string', () => {
      const early = new Date(2024, 2, 15, 3, 5, 9);
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
      const midnight = new Date(2024, 2, 15, 0, 0, 0);
      const result = parseClockTime(false, midnight);
      expect(result.h).toBe(12);
      expect(result.period).toBe(' AM');
    });

    it('converts 12 hours to 12 PM (noon)', () => {
      const noon = new Date(2024, 2, 15, 12, 0, 0);
      const result = parseClockTime(false, noon);
      expect(result.h).toBe(12);
      expect(result.period).toBe(' PM');
    });

    it('converts 13 to 1 PM', () => {
      const onepm = new Date(2024, 2, 15, 13, 0, 0);
      const result = parseClockTime(false, onepm);
      expect(result.h).toBe(1);
      expect(result.period).toBe(' PM');
    });

    it('converts 23 to 11 PM', () => {
      const late = new Date(2024, 2, 15, 23, 0, 0);
      const result = parseClockTime(false, late);
      expect(result.h).toBe(11);
      expect(result.period).toBe(' PM');
    });

    it('does not pad hour string with leading zero', () => {
      const onepm = new Date(2024, 2, 15, 13, 5, 0);
      const result = parseClockTime(false, onepm);
      expect(result.hStr).toBe('1');
    });

    it('returns period with leading space', () => {
      const morning = new Date(2024, 2, 15, 9, 0, 0);
      const result = parseClockTime(false, morning);
      expect(result.period).toBe(' AM');
    });
  });

  it('always zero-pads minutes and seconds', () => {
    const early = new Date(2024, 2, 15, 14, 5, 9);
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
