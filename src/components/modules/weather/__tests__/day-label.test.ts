import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dayLabel } from '../day-label';

// Inline translator: returns a stable English label for the two keys we care
// about (`weather.today` / `weather.tomorrowShort`); anything else echoes the
// key, which day-label never asks for so the test stays focused on the
// today/tomorrow branches and the date-fns `EEE` fallback.
const enT = ((key: string) => {
  if (key === 'weather.today') return 'Today';
  if (key === 'weather.tomorrowShort') return 'Tmrw';
  return key;
}) as Parameters<typeof dayLabel>[2];

describe('dayLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns translated "Today" for the current date', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // March 15, 2026
    expect(dayLabel('2026-03-15', 'en-US', enT)).toBe('Today');
  });

  it('returns translated "Tmrw" for tomorrow', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    expect(dayLabel('2026-03-16', 'en-US', enT)).toBe('Tmrw');
  });

  it('returns abbreviated day name for other dates', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // Sunday
    // March 17, 2026 is a Tuesday
    expect(dayLabel('2026-03-17', 'en-US', enT)).toBe('Tue');
  });

  it('returns abbreviated day for a date in the past', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    // March 13, 2026 is a Friday
    expect(dayLabel('2026-03-13', 'en-US', enT)).toBe('Fri');
  });

  it('returns translated "Today" regardless of time of day', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 23, 59, 59));
    expect(dayLabel('2026-03-15', 'en-US', enT)).toBe('Today');
  });

  it('handles year boundaries', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0)); // Dec 31, 2026
    expect(dayLabel('2027-01-01', 'en-US', enT)).toBe('Tmrw');
  });

  it('honors a translator that returns localized text', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    const deT = ((key: string) => {
      if (key === 'weather.today') return 'Heute';
      if (key === 'weather.tomorrowShort') return 'Morgen';
      return key;
    }) as Parameters<typeof dayLabel>[2];
    expect(dayLabel('2026-03-15', 'en-US', deT)).toBe('Heute');
    expect(dayLabel('2026-03-16', 'en-US', deT)).toBe('Morgen');
  });
});
