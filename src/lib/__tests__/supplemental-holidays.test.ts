import { describe, it, expect, vi } from 'vitest';
import { computeEaster, getSupplementalHolidays } from '../supplemental-holidays';

describe('computeEaster', () => {
  // Known Easter dates — verified against multiple sources
  const knownEasters: [number, number, number][] = [
    [2024, 3, 31],  // March 31
    [2025, 4, 20],  // April 20
    [2026, 4, 5],   // April 5
    [2027, 3, 28],  // March 28
    [2028, 4, 16],  // April 16
    [2029, 4, 1],   // April 1
    [2030, 4, 21],  // April 21
    [2031, 4, 13],  // April 13
    [2032, 3, 28],  // March 28
    [2033, 4, 17],  // April 17
  ];

  it.each(knownEasters)(
    'computes Easter %i as %i-%i',
    (year, expectedMonth, expectedDay) => {
      const { month, day } = computeEaster(year);
      expect(month).toBe(expectedMonth);
      expect(day).toBe(expectedDay);
    }
  );
});

describe('getSupplementalHolidays', () => {
  it('returns US supplemental holidays for a given year', () => {
    const results = getSupplementalHolidays('US', [2026], '2026-01-01');
    const names = results.map((h) => h.title);

    expect(names).toContain('Easter Sunday');
    expect(names).toContain("Valentine's Day");
    expect(names).toContain("St. Patrick's Day");
    expect(names).toContain("Mother's Day");
    expect(names).toContain("Father's Day");
    expect(names).toContain('Halloween');
    expect(names).toContain("New Year's Eve");
  });

  it('computes correct Easter date for 2026', () => {
    const results = getSupplementalHolidays('US', [2026], '2026-01-01');
    const easter = results.find((h) => h.title === 'Easter Sunday');
    expect(easter?.start).toBe('2026-04-05');
  });

  it('computes correct Mother\'s Day (2nd Sunday of May)', () => {
    const results = getSupplementalHolidays('US', [2026], '2026-01-01');
    const md = results.find((h) => h.title === "Mother's Day");
    // May 2026: May 1 is Friday, 2nd Sunday = May 10
    expect(md?.start).toBe('2026-05-10');
  });

  it('computes correct Father\'s Day (3rd Sunday of June)', () => {
    const results = getSupplementalHolidays('US', [2026], '2026-01-01');
    const fd = results.find((h) => h.title === "Father's Day");
    // June 2026: June 1 is Monday, 3rd Sunday = June 21
    expect(fd?.start).toBe('2026-06-21');
  });

  it('filters out past holidays', () => {
    const results = getSupplementalHolidays('US', [2026], '2026-10-30');
    const names = results.map((h) => h.title);

    // Easter, Valentine's, St Patrick's, Mother's, Father's are all past
    expect(names).not.toContain('Easter Sunday');
    expect(names).not.toContain("Valentine's Day");
    // Halloween and NYE are still upcoming
    expect(names).toContain('Halloween');
    expect(names).toContain("New Year's Eve");
  });

  it('returns empty array for unsupported country', () => {
    const results = getSupplementalHolidays('ZZ', [2026], '2026-01-01');
    expect(results).toEqual([]);
  });

  it('handles case-insensitive country codes', () => {
    const results = getSupplementalHolidays('us', [2026], '2026-01-01');
    expect(results.length).toBeGreaterThan(0);
  });

  it("keeps a holiday on its own day even after the UTC day has moved on", () => {
    // 8 PM on Halloween in Chicago is already November 1 in UTC. The caller's
    // household day decides, whatever the clock says.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
    try {
      const results = getSupplementalHolidays('US', [2026, 2027], '2026-10-31');
      const halloweens = results.filter((h) => h.title === 'Halloween').map((h) => h.start);
      expect(halloweens[0]).toBe('2026-10-31');
    } finally {
      vi.useRealTimers();
    }
  });
});
