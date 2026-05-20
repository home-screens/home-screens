import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimeAgoLocalized } from '@/lib/chore-constants';
import type { TranslateFn } from '@/i18n/types';

afterEach(() => {
  vi.useRealTimers();
});

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

  // Boundary cases — guard against off-by-one threshold drift (e.g. `< 5` → `<= 5`).
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
