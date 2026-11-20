import { describe, it, expect } from 'vitest';
import { formatAgo } from '../news/feed-display';
import { formatNewsAge } from '@/components/modules/news/news-shared';
import type { TranslateFn } from '@/i18n';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Prints the key's last word and its count, so the two dictionaries compare as one rule. */
const t = ((key: string, vars?: Record<string, unknown>) => `${key.split('.').pop()}${vars?.count === undefined ? '' : `:${vars.count}`}`) as TranslateFn;

describe('formatAgo', () => {
  it('counts whole minutes, hours and days', () => {
    expect(formatAgo(NOW - 30_000, NOW, t)).toBe('justNow');
    expect(formatAgo(NOW - 59_000, NOW, t)).toBe('justNow');
    expect(formatAgo(NOW - 90_000, NOW, t)).toBe('minutes:1');
    expect(formatAgo(NOW - 100 * MIN, NOW, t)).toBe('hours:1');
    expect(formatAgo(NOW - 36 * HOUR, NOW, t)).toBe('days:1');
  });

  it('gives a story the age the wall gives it, up to the week the wall turns to a date', () => {
    const fmt = { locale: 'en-US', timezone: 'UTC' };
    for (const age of [0, 29_000, 31_000, 89_000, 91_000, 45 * MIN, 89 * MIN, 91 * MIN, 23.6 * HOUR, 35 * HOUR, 37 * HOUR, 6.9 * DAY]) {
      expect(formatAgo(NOW - age, NOW, t), `${age} ms`).toBe(formatNewsAge(NOW - age, t, fmt, NOW));
    }
  });

  it('never reads a clock that is behind as a negative age', () => {
    expect(formatAgo(NOW + 5_000, NOW, t)).toBe('justNow');
  });
});
