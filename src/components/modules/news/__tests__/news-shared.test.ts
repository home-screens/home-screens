import { describe, it, expect } from 'vitest';
import type { TranslateFn } from '@/i18n';
import { formatNewsAge } from '../news-shared';

const t: TranslateFn = (key, vars) => (vars?.count !== undefined ? `${key}:${vars.count}` : key);

describe('formatNewsAge', () => {
  it('counts recent stories in minutes, hours and days', () => {
    const now = Date.parse('2026-09-23T01:00:00Z');
    const fmt = { locale: 'en-US', timezone: 'America/Chicago' };
    expect(formatNewsAge(now - 30_000, t, fmt, now)).toBe('news.timeAgo.justNow');
    expect(formatNewsAge(now - 12 * 60_000, t, fmt, now)).toBe('news.timeAgo.minutes:12');
    expect(formatNewsAge(now - 3 * 3_600_000, t, fmt, now)).toBe('news.timeAgo.hours:3');
    expect(formatNewsAge(now - 2 * 86_400_000, t, fmt, now)).toBe('news.timeAgo.days:2');
  });

  it('dates a week-old story on the household calendar, not the Pi\'s', () => {
    // Published 9 PM Sep 10 in Chicago, which is already Sep 11 in UTC.
    const published = Date.parse('2026-09-11T02:00:00Z');
    const now = Date.parse('2026-09-20T15:00:00Z');
    expect(formatNewsAge(published, t, { locale: 'en-US', timezone: 'America/Chicago' }, now)).toBe('Sep 10');
    expect(formatNewsAge(published, t, { locale: 'en-US', timezone: 'Europe/Berlin' }, now)).toBe('Sep 11');
  });

  it('is empty for an undated story', () => {
    expect(formatNewsAge(null, t, { locale: 'en-US', timezone: undefined })).toBe('');
  });
});
