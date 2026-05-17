import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dayLabel } from '../day-label';

// Pre-resolved label bundle. Mirrors the shape the host passes — `today`
// lives in `core` and `tomorrowShort` lives in the `modules` dictionary
// under `weather.tomorrowShort`. Tests pass them in already-translated so
// the helper has no knowledge of namespace routing.
const enLabels = { today: 'Today', tomorrowShort: 'Tmrw' };

describe('dayLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns translated "Today" for the current date', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // March 15, 2026
    expect(dayLabel('2026-03-15', 'en-US', enLabels)).toBe('Today');
  });

  it('returns translated "Tmrw" for tomorrow', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    expect(dayLabel('2026-03-16', 'en-US', enLabels)).toBe('Tmrw');
  });

  it('returns abbreviated day name for other dates', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0)); // Sunday
    // March 17, 2026 is a Tuesday
    expect(dayLabel('2026-03-17', 'en-US', enLabels)).toBe('Tue');
  });

  it('returns abbreviated day for a date in the past', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    // March 13, 2026 is a Friday
    expect(dayLabel('2026-03-13', 'en-US', enLabels)).toBe('Fri');
  });

  it('returns translated "Today" regardless of time of day', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 23, 59, 59));
    expect(dayLabel('2026-03-15', 'en-US', enLabels)).toBe('Today');
  });

  it('handles year boundaries', () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0)); // Dec 31, 2026
    expect(dayLabel('2027-01-01', 'en-US', enLabels)).toBe('Tmrw');
  });

  it('honors localized labels', () => {
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0, 0));
    const deLabels = { today: 'Heute', tomorrowShort: 'Morgen' };
    expect(dayLabel('2026-03-15', 'en-US', deLabels)).toBe('Heute');
    expect(dayLabel('2026-03-16', 'en-US', deLabels)).toBe('Morgen');
  });
});
