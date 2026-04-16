import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatLastSeen, formatUptime, formatAge } from '../time-format';

/**
 * These formatters render heartbeat freshness, uptime, and per-client age on
 * the Defaults/Displays index, the Stats section, and the /remote
 * SettingsSheet. The kiosk runs in a single language and every consumer
 * expects these exact compact strings — no locale, no Intl. Regressions
 * here show up as broken UI in several places at once, so pin the shape.
 */

describe('formatLastSeen', () => {
  // formatLastSeen compares against Date.now(); stub it so the boundaries
  // are exact and don't flake from test timing.
  const FIXED_NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns em-dash for null', () => {
    expect(formatLastSeen(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatLastSeen(undefined)).toBe('—');
  });

  it('returns em-dash for 0 (treated as "never")', () => {
    // Callers pass `status?.lastSeen ?? null`, but some upstreams send a
    // literal 0 for "not yet reported". Treating it as "never" matches the
    // null/undefined branch and keeps the UI placeholder consistent.
    expect(formatLastSeen(0)).toBe('—');
  });

  it('formats sub-minute ages in seconds with a 1s floor', () => {
    // diff of 0 ms would round to 0s; the Math.max(1, ...) keeps the
    // label from flashing as "0s ago" between polls.
    expect(formatLastSeen(FIXED_NOW)).toBe('1s ago');
    expect(formatLastSeen(FIXED_NOW - 500)).toBe('1s ago');
    expect(formatLastSeen(FIXED_NOW - 5_000)).toBe('5s ago');
    expect(formatLastSeen(FIXED_NOW - 59_000)).toBe('59s ago');
  });

  it('switches to minutes at 60s exactly', () => {
    // 60_000 ms is NOT < 60_000, so the <60_000 branch is skipped and the
    // minutes branch fires. This is the boundary that would flicker if
    // the comparison used `<=` by mistake.
    expect(formatLastSeen(FIXED_NOW - 60_000)).toBe('1m ago');
    expect(formatLastSeen(FIXED_NOW - 120_000)).toBe('2m ago');
    expect(formatLastSeen(FIXED_NOW - 30 * 60_000)).toBe('30m ago');
  });

  it('switches to hours at 60m exactly', () => {
    expect(formatLastSeen(FIXED_NOW - 3_600_000)).toBe('1h ago');
    expect(formatLastSeen(FIXED_NOW - 2 * 3_600_000)).toBe('2h ago');
    expect(formatLastSeen(FIXED_NOW - 23 * 3_600_000)).toBe('23h ago');
  });

  it('switches to days at 24h exactly', () => {
    expect(formatLastSeen(FIXED_NOW - 86_400_000)).toBe('1d ago');
    expect(formatLastSeen(FIXED_NOW - 3 * 86_400_000)).toBe('3d ago');
    expect(formatLastSeen(FIXED_NOW - 30 * 86_400_000)).toBe('30d ago');
  });

  it('rounds minute values (30s → 30m boundary snapping)', () => {
    // 90s should round to "2m" because 90_000 / 60_000 = 1.5 rounds up.
    expect(formatLastSeen(FIXED_NOW - 90_000)).toBe('2m ago');
  });
});

describe('formatUptime', () => {
  it('returns "0m" for 0 seconds (minutes part is always shown)', () => {
    // The docstring says "42m" is the minimum shape — the minute part is
    // never elided even when the count is zero.
    expect(formatUptime(0)).toBe('0m');
  });

  it('returns just minutes when under an hour', () => {
    expect(formatUptime(60)).toBe('1m');
    expect(formatUptime(42 * 60)).toBe('42m');
    expect(formatUptime(59 * 60)).toBe('59m');
  });

  it('drops seconds entirely (integer minute floor)', () => {
    // 119 seconds is 1m 59s, but the formatter shows whole minutes only.
    // Locking this in so a future "be precise for short uptimes" change
    // doesn't silently break the compact layout.
    expect(formatUptime(119)).toBe('1m');
  });

  it('shows hours and minutes together when above an hour', () => {
    expect(formatUptime(3600)).toBe('1h 0m');
    expect(formatUptime(3600 + 12 * 60)).toBe('1h 12m');
    expect(formatUptime(5 * 3600 + 12 * 60)).toBe('5h 12m');
  });

  it('shows days and minutes past a day (hours elided when zero)', () => {
    // "1d 0m" not "1d 0h 0m" — both `d` and `h` segments are gated on
    // `> 0`, so only the minute part (which is always shown) fills the
    // middle when intermediate segments happen to be zero. Document the
    // quirk so a future "always show all three" tweak has to consciously
    // decide to change table alignment.
    expect(formatUptime(86400)).toBe('1d 0m');
    expect(formatUptime(2 * 86400 + 3 * 3600 + 15 * 60)).toBe('2d 3h 15m');
  });

  it('drops a zero-hour segment even when days are present', () => {
    // Same gate: `if (h > 0)` — so "1d 0m" with no "0h" in between. This
    // keeps the docstring's "2d 3h 15m" / "5h 12m" / "42m" set honest.
    expect(formatUptime(86400 + 5 * 60)).toBe('1d 5m');
  });
});

describe('formatAge', () => {
  it('renders sub-second as "<1s"', () => {
    // Different shape than formatLastSeen — this one is for "age" labels
    // where the caller appends context, and bursty polling regularly
    // produces sub-second ages.
    expect(formatAge(0)).toBe('<1s');
    expect(formatAge(999)).toBe('<1s');
  });

  it('renders whole seconds under a minute', () => {
    expect(formatAge(1000)).toBe('1s');
    expect(formatAge(42_000)).toBe('42s');
    expect(formatAge(59_999)).toBe('59s');
  });

  it('renders whole minutes under an hour', () => {
    expect(formatAge(60_000)).toBe('1m');
    expect(formatAge(12 * 60_000)).toBe('12m');
    expect(formatAge(59 * 60_000)).toBe('59m');
  });

  it('renders hours and remainder minutes together above an hour', () => {
    expect(formatAge(60 * 60_000)).toBe('1h 0m');
    expect(formatAge(3 * 60 * 60_000 + 15 * 60_000)).toBe('3h 15m');
  });

  it('keeps the shape "Nh Mm" for very long ages (no day rollover)', () => {
    // formatAge intentionally never rolls over to days — the contexts
    // that use it (recent viewport reports, status freshness) don't
    // meaningfully span multi-day intervals. Locking in the shape so a
    // future "cleaner for long ages" tweak doesn't silently switch the
    // UI to "Xd Yh" and break layout.
    expect(formatAge(50 * 60 * 60_000)).toBe('50h 0m');
  });

  it('floors sub-second partials in the seconds band', () => {
    // 1999 ms is Math.floor(1999/1000) = 1s. This matters because status
    // polls happen every few seconds and a `1.something` second label
    // would flicker between "1s" and "2s".
    expect(formatAge(1999)).toBe('1s');
  });
});
