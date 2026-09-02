import { describe, it, expect } from 'vitest';
import { toTZWallTime } from '@/lib/timezone';
import { formatKickoff } from '../kickoff';

const TZ = 'America/Chicago';
// 2026-09-09 19:00 in Chicago (CDT, UTC-5).
const NOW = toTZWallTime(new Date('2026-09-10T00:00:00Z'), TZ);

const base = { now: NOW, timezone: TZ, locale: 'en-US', timeFormat: '12h' as const, today: 'Today', tomorrow: 'Tomorrow' };

describe('formatKickoff', () => {
  it('formats a same-day kickoff as Today plus the local time, no zone abbreviation', () => {
    // 8:20 PM EDT = 7:20 PM CDT, still Sept 9 in Chicago.
    expect(formatKickoff('2026-09-10T00:20:00Z', base)).toBe('Today · 7:20 PM');
  });

  it('uses Tomorrow for the next calendar day in the display timezone', () => {
    expect(formatKickoff('2026-09-11T00:20:00Z', base)).toBe('Tomorrow · 7:20 PM');
  });

  it('falls back to the short weekday and numeric date further out', () => {
    expect(formatKickoff('2026-09-13T17:00:00Z', base)).toBe('Sun, 9/13 · 12:00 PM');
  });

  it('counts the day in the display timezone, not UTC', () => {
    // 11:30 PM Chicago on Sept 9 is already Sept 10 in UTC: still Today.
    expect(formatKickoff('2026-09-10T04:30:00Z', base)).toBe('Today · 11:30 PM');
  });

  it('honors the 24-hour household preference and the locale', () => {
    expect(formatKickoff('2026-09-10T00:20:00Z', { ...base, timeFormat: '24h', locale: 'de-DE', today: 'Heute', tomorrow: 'Morgen' }))
      .toBe('Heute · 19:20');
  });

  it('returns null for an unparseable instant', () => {
    expect(formatKickoff('', base)).toBeNull();
    expect(formatKickoff('TBD', base)).toBeNull();
  });
});
