import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dayLabel } from '../day-label';

describe('dayLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Today" for the current date', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // March 15, 2026
    expect(dayLabel('2026-03-15')).toBe('Today');
  });

  it('returns "Tmrw" for tomorrow', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    expect(dayLabel('2026-03-16')).toBe('Tmrw');
  });

  it('returns abbreviated day name for other dates', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // Sunday
    // March 17, 2026 is a Tuesday
    expect(dayLabel('2026-03-17')).toBe('Tue');
  });

  it('returns abbreviated day for a date in the past', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    // March 13, 2026 is a Friday
    expect(dayLabel('2026-03-13')).toBe('Fri');
  });

  it('returns "Today" regardless of time of day', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 23, 59, 59));
    expect(dayLabel('2026-03-15')).toBe('Today');
  });

  it('handles year boundaries', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0)); // Dec 31, 2026
    expect(dayLabel('2027-01-01')).toBe('Tmrw');
  });
});
