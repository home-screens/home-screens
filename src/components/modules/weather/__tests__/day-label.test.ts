import { describe, it, expect, vi, afterEach } from 'vitest';
import { dayLabel } from '../day-label';

// Pre-resolved label bundle. Mirrors the shape the host passes: `today`
// lives in `core` and `tomorrowShort` lives in the `modules` dictionary
// under `weather.tomorrowShort`. Tests pass them in already-translated so
// the helper has no knowledge of namespace routing.
const enLabels = { today: 'Today', tomorrowShort: 'Tmrw' };

// The household's today, as the views hand it in. 2026-03-15 is a Sunday.
const TODAY = '2026-03-15';

describe('dayLabel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns translated "Today" for the household today', () => {
    expect(dayLabel('2026-03-15', TODAY, 'en-US', enLabels)).toBe('Today');
  });

  it('returns translated "Tmrw" for the household tomorrow', () => {
    expect(dayLabel('2026-03-16', TODAY, 'en-US', enLabels)).toBe('Tmrw');
  });

  it('uses weekday names for today and tomorrow when relative labels are disabled', () => {
    expect(dayLabel('2026-03-15', TODAY, 'en-US', enLabels, false)).toBe('Sun');
    expect(dayLabel('2026-03-16', TODAY, 'en-US', enLabels, false)).toBe('Mon');
  });

  it('returns abbreviated day name for other dates', () => {
    // March 17, 2026 is a Tuesday
    expect(dayLabel('2026-03-17', TODAY, 'en-US', enLabels)).toBe('Tue');
  });

  it('returns abbreviated day for a date in the past', () => {
    // March 13, 2026 is a Friday
    expect(dayLabel('2026-03-13', TODAY, 'en-US', enLabels)).toBe('Fri');
  });

  it('follows the household day, not the machine clock', () => {
    // The machine is already on Monday (8 pm Sunday in Chicago on a UTC Pi);
    // the household is still on Sunday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T01:00:00Z'));
    expect(dayLabel('2026-03-15', TODAY, 'en-US', enLabels)).toBe('Today');
    expect(dayLabel('2026-03-16', TODAY, 'en-US', enLabels)).toBe('Tmrw');
  });

  it('handles month and year boundaries', () => {
    expect(dayLabel('2027-01-01', '2026-12-31', 'en-US', enLabels)).toBe('Tmrw');
    expect(dayLabel('2026-04-01', '2026-03-31', 'en-US', enLabels)).toBe('Tmrw');
  });

  it('honors localized labels', () => {
    const deLabels = { today: 'Heute', tomorrowShort: 'Morgen' };
    expect(dayLabel('2026-03-15', TODAY, 'en-US', deLabels)).toBe('Heute');
    expect(dayLabel('2026-03-16', TODAY, 'en-US', deLabels)).toBe('Morgen');
  });
});
