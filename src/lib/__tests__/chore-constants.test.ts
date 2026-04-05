import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTimeAgo } from '@/lib/chore-constants';

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
});
