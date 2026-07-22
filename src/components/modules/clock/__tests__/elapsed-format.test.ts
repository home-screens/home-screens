import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatElapsed } from '../elapsed-format';
import type { ElapsedFormat, ElapsedPrecision } from '@/types/config';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const f = (
  diffMs: number,
  format: ElapsedFormat = 'units',
  precision: ElapsedPrecision = 'auto',
  locale = 'en-US',
) => formatElapsed(diffMs, format, precision, locale);

describe('formatElapsed — units/auto regression (must match the pre-existing formatter byte-for-byte)', () => {
  it('renders days/hours/minutes for a duration over 1h, omitting seconds', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE + 42 * SECOND;
    expect(f(diff)).toBe('50d 20h 13m');
  });

  it('renders minutes+seconds for a duration under 1h', () => {
    expect(f(3 * MINUTE + 5 * SECOND)).toBe('3m 5s');
  });

  it('shows "0h" once days is active even when hours is exactly 0', () => {
    expect(f(DAY)).toBe('1d 0h 0m');
  });

  it('omits hours entirely when days is 0 and hours is 0', () => {
    expect(f(3 * MINUTE)).toBe('3m 0s');
  });

  it('renders "0m 0s" for a diff of exactly 0', () => {
    expect(f(0)).toBe('0m 0s');
  });

  it('treats negative diffs the same as positive (abs semantics)', () => {
    expect(f(-(3 * MINUTE + 5 * SECOND))).toBe('3m 5s');
  });

  it('crosses the 1h boundary exactly (3600s includes hours, excludes seconds)', () => {
    expect(f(HOUR)).toBe('1h 0m');
    expect(f(HOUR - SECOND)).toBe('59m 59s');
  });
});

describe('formatElapsed — unitsUpper format', () => {
  it('renders the same shape as units but with capitalized letters', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'unitsUpper', 'daysHoursMinutes')).toBe('50D 20H 13M');
  });
});

describe('formatElapsed — unitsShort format', () => {
  it('renders the same shape as units but with short-word suffixes, no pluralization', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'unitsShort', 'daysHoursMinutes')).toBe('50day 20hr 13min');
  });
});

describe('formatElapsed — colon format', () => {
  it('zero-pads all segments after the first', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'colon')).toBe('50:20:13');
  });

  it('pads a single-digit leading minute value under an hour', () => {
    expect(f(3 * MINUTE + 5 * SECOND, 'colon')).toBe('3:05');
  });

  it('rolls over a full hour cleanly', () => {
    expect(f(HOUR, 'colon', 'daysHours')).toBe('0:01');
  });

  it('drops a leading zero days segment', () => {
    const diff = 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'colon')).toBe('20:13');
  });
});

describe('formatElapsed — named precision presets: fixed unit sets, shown unconditionally', () => {
  const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE + 42 * SECOND;

  it('days only', () => {
    expect(f(diff, 'units', 'days')).toBe('50d');
  });

  it('days + hours', () => {
    expect(f(diff, 'units', 'daysHours')).toBe('50d 20h');
  });

  it('days + hours + minutes', () => {
    expect(f(diff, 'units', 'daysHoursMinutes')).toBe('50d 20h 13m');
  });

  it('every unit', () => {
    expect(f(diff, 'units', 'daysHoursMinutesSeconds')).toBe('50d 20h 13m 42s');
  });

  it('always floors rather than rounds (50d 23h59m59s stays 50 days at days-only precision)', () => {
    const almostFiftyOne = 50 * DAY + 23 * HOUR + 59 * MINUTE + 59 * SECOND;
    expect(f(almostFiftyOne, 'units', 'days')).toBe('50d');
  });

  it('shows a preset unit unconditionally even when its value is 0 — no leading-zero suppression', () => {
    expect(f(3 * MINUTE, 'units', 'days')).toBe('0d');
    expect(f(3 * MINUTE, 'units', 'daysHours')).toBe('0d 0h');
  });
});

describe('formatElapsed — words format', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses Intl.DurationFormat for English long-form output', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'words', 'daysHoursMinutes')).toBe('50 days, 20 hours, 13 minutes');
  });

  it('shows the "0 hours" quirk under auto precision once days is active, matching units/auto', () => {
    expect(f(DAY, 'words')).toBe('1 day, 0 hours, 0 minutes');
  });

  it('renders a single days-only value', () => {
    expect(f(50 * DAY + HOUR, 'words', 'days')).toBe('50 days');
  });

  it('localizes unit words for a non-English locale (de-DE)', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    const result = f(diff, 'words', 'daysHoursMinutes', 'de-DE');
    expect(result).toContain('Tage');
  });
});

describe('formatElapsed — wordsTitle format', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('capitalizes only the unit words, keeping locale punctuation and connectors untouched', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'wordsTitle', 'daysHoursMinutes')).toBe('50 Days, 20 Hours, 13 Minutes');
  });

  it('capitalizes unit words for a non-English locale while preserving its connector word (de-DE "und")', () => {
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    const result = f(diff, 'wordsTitle', 'daysHoursMinutes', 'de-DE');
    expect(result).toBe('50 Tage, 20 Stunden und 13 Minuten');
  });

  it('falls back to capitalized English words when Intl.DurationFormat is unavailable', () => {
    vi.stubGlobal('Intl', { ...Intl, DurationFormat: undefined });
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'wordsTitle', 'daysHoursMinutes')).toBe('50 Days 20 Hours 13 Minutes');
  });

  it('falls back to English words when Intl.DurationFormat is unavailable', () => {
    vi.stubGlobal('Intl', { ...Intl, DurationFormat: undefined });
    const diff = 50 * DAY + 20 * HOUR + 13 * MINUTE;
    expect(f(diff, 'words', 'daysHoursMinutes')).toBe('50 days 20 hours 13 minutes');
  });

  it('renders zeroed units for a diff of exactly 0, never an empty string', () => {
    expect(f(0, 'words')).toBe('0 minutes, 0 seconds');
  });
});
