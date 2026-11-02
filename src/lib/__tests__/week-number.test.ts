import { describe, expect, it } from 'vitest';
import { localeWeekStart, weekNumberFor } from '../week-number';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('weekNumberFor', () => {
  it('numbers a Monday week the ISO way', () => {
    expect(weekNumberFor(day(2026, 12, 27), 'monday')).toBe(52);
    expect(weekNumberFor(day(2027, 1, 1), 'monday')).toBe(53);
    expect(weekNumberFor(day(2027, 1, 4), 'monday')).toBe(1);
    expect(weekNumberFor(day(2027, 3, 10), 'monday')).toBe(10);
  });

  it('numbers a Sunday week the US way, and so does an unset week start', () => {
    expect(weekNumberFor(day(2026, 12, 27), 'sunday')).toBe(1);
    expect(weekNumberFor(day(2027, 3, 10), 'sunday')).toBe(11);
    expect(weekNumberFor(day(2027, 3, 10), undefined)).toBe(11);
  });

  it('gives every day of a week the same number', () => {
    // 2027-06-13 is a Sunday: the first day of a Sunday week, the last of a Monday one.
    for (let offset = 0; offset < 7; offset++) {
      expect(weekNumberFor(day(2027, 6, 13 + offset), 'sunday')).toBe(25);
      expect(weekNumberFor(day(2027, 6, 7 + offset), 'monday')).toBe(23);
    }
  });
});

describe('localeWeekStart', () => {
  it('starts on Sunday where the region does', () => {
    expect(localeWeekStart('en-US')).toBe('sunday');
    expect(localeWeekStart('pt-BR')).toBe('sunday');
    expect(localeWeekStart('es-MX')).toBe('sunday');
  });

  it('starts on Monday everywhere else', () => {
    for (const tag of ['de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'da-DK', 'en-GB']) {
      expect(localeWeekStart(tag)).toBe('monday');
    }
  });

  it("reads a bare language as its likely region's", () => {
    expect(localeWeekStart('en')).toBe('sunday');
    expect(localeWeekStart('pt')).toBe('sunday');
    expect(localeWeekStart('de')).toBe('monday');
  });

  it('falls back to Monday for a tag it cannot read', () => {
    expect(localeWeekStart('not a locale')).toBe('monday');
  });
});
