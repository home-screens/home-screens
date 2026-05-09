import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimeAgo, formatTimeAgoLocalized } from '@/lib/chore-constants';
import type { TranslateFn } from '@/i18n/types';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatTimeAgo', () => {
  function setNow(ms: number) {
    vi.useFakeTimers();
    vi.setSystemTime(ms);
  }

  const BASE = new Date('2026-04-04T12:00:00Z').getTime();

  it('returns "just now" for < 5 seconds ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 3_000))).toBe('just now');
    expect(formatTimeAgo(new Date(BASE))).toBe('just now');
  });

  it('returns seconds for 5-59 seconds ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 5_000))).toBe('5s ago');
    expect(formatTimeAgo(new Date(BASE - 30_000))).toBe('30s ago');
    expect(formatTimeAgo(new Date(BASE - 59_000))).toBe('59s ago');
  });

  it('returns minutes for 1-59 minutes ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 60_000))).toBe('1m ago');
    expect(formatTimeAgo(new Date(BASE - 30 * 60_000))).toBe('30m ago');
  });

  it('returns hours for 1-23 hours ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 3_600_000))).toBe('1h ago');
    expect(formatTimeAgo(new Date(BASE - 12 * 3_600_000))).toBe('12h ago');
  });

  it('returns days for 1-6 days ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 24 * 3_600_000))).toBe('1d ago');
    expect(formatTimeAgo(new Date(BASE - 5 * 24 * 3_600_000))).toBe('5d ago');
  });

  it('returns weeks for 7+ days ago', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 7 * 24 * 3_600_000))).toBe('1w ago');
    expect(formatTimeAgo(new Date(BASE - 21 * 24 * 3_600_000))).toBe('3w ago');
  });

  it('accepts ISO string input', () => {
    setNow(BASE);
    const tenMinAgo = new Date(BASE - 10 * 60_000).toISOString();
    expect(formatTimeAgo(tenMinAgo)).toBe('10m ago');
  });

  it('accepts Date input', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 120_000))).toBe('2m ago');
  });

  // Boundary cases — guard against off-by-one threshold drift (e.g. `< 5` → `<= 5`).
  it('boundary: 4_999ms is still "just now"', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 4_999))).toBe('just now');
  });

  it('boundary: 5_000ms tips into seconds bucket', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 5_000))).toBe('5s ago');
  });

  it('boundary: 59_000ms is still seconds', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 59_000))).toBe('59s ago');
  });

  it('boundary: 60_000ms tips into minutes bucket', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 60_000))).toBe('1m ago');
  });

  it('boundary: just under 7 days is still days', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - (7 * 86_400_000 - 1)))).toBe('6d ago');
  });

  it('boundary: exactly 7 days tips into weeks bucket', () => {
    setNow(BASE);
    expect(formatTimeAgo(new Date(BASE - 7 * 86_400_000))).toBe('1w ago');
  });
});

// ── Localized variant ──────────────────────────────────────────────

/**
 * Tiny stub `TranslateFn` that drives the localized helper from a flat
 * dictionary, mirroring how the real `useTranslate('core')` resolves
 * `relativeTime.*` keys with `{n}` interpolation.
 */
function makeT(strings: Record<string, string>): TranslateFn {
  return (key, vars) => {
    const raw = strings[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
  };
}

const EN_RELATIVE = {
  'relativeTime.justNow': 'just now',
  'relativeTime.secondsAgo': '{n}s ago',
  'relativeTime.minutesAgo': '{n}m ago',
  'relativeTime.hoursAgo': '{n}h ago',
  'relativeTime.daysAgo': '{n}d ago',
  'relativeTime.weeksAgo': '{n}w ago',
};

const DE_RELATIVE = {
  'relativeTime.justNow': 'gerade eben',
  'relativeTime.secondsAgo': 'vor {n} Sek.',
  'relativeTime.minutesAgo': 'vor {n} Min.',
  'relativeTime.hoursAgo': 'vor {n} Std.',
  'relativeTime.daysAgo': 'vor {n} T.',
  'relativeTime.weeksAgo': 'vor {n} W.',
};

describe('formatTimeAgoLocalized', () => {
  const NOW = new Date('2026-05-07T12:00:00Z');
  const NOW_MS = NOW.getTime();
  const tEn = makeT(EN_RELATIVE);
  const tDe = makeT(DE_RELATIVE);

  it('en-US: covers every threshold branch', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 2_000), tEn, NOW)).toBe('just now');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 30_000), tEn, NOW)).toBe('30s ago');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 5 * 60_000), tEn, NOW)).toBe('5m ago');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 3 * 3_600_000), tEn, NOW)).toBe('3h ago');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 2 * 24 * 3_600_000), tEn, NOW)).toBe('2d ago');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 14 * 24 * 3_600_000), tEn, NOW)).toBe('2w ago');
  });

  it('de-DE: covers every threshold branch (short-form, kid-friendly)', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 2_000), tDe, NOW)).toBe('gerade eben');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 30_000), tDe, NOW)).toBe('vor 30 Sek.');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 5 * 60_000), tDe, NOW)).toBe('vor 5 Min.');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 3 * 3_600_000), tDe, NOW)).toBe('vor 3 Std.');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 2 * 24 * 3_600_000), tDe, NOW)).toBe('vor 2 T.');
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 14 * 24 * 3_600_000), tDe, NOW)).toBe('vor 2 W.');
  });

  it('accepts an ISO-string input', () => {
    const iso = new Date(NOW_MS - 10 * 60_000).toISOString();
    expect(formatTimeAgoLocalized(iso, tEn, NOW)).toBe('10m ago');
  });

  it('falls back to system clock when `now` is omitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 60_000), tEn)).toBe('1m ago');
  });

  // Boundary cases — keep localized helper in lockstep with legacy formatTimeAgo thresholds.
  it('boundary: 4_999ms is still "just now"', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 4_999), tEn, NOW)).toBe('just now');
  });

  it('boundary: 5_000ms tips into seconds bucket', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 5_000), tEn, NOW)).toBe('5s ago');
  });

  it('boundary: 59_000ms is still seconds', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 59_000), tEn, NOW)).toBe('59s ago');
  });

  it('boundary: 60_000ms tips into minutes bucket', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 60_000), tEn, NOW)).toBe('1m ago');
  });

  it('boundary: just under 7 days is still days', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - (7 * 86_400_000 - 1)), tEn, NOW)).toBe('6d ago');
  });

  it('boundary: exactly 7 days tips into weeks bucket', () => {
    expect(formatTimeAgoLocalized(new Date(NOW_MS - 7 * 86_400_000), tEn, NOW)).toBe('1w ago');
  });
});
