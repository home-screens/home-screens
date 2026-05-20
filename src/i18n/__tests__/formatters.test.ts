import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatDate,
  formatDateSync,
  formatNumber,
  formatRelativeTime,
  preloadDateLocale,
  __resetFormatterLocaleCacheForTests,
} from '@/i18n/formatters';

describe('formatDate', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  // Use a fixed timestamp so the test is deterministic regardless of TZ.
  // 2024-03-04 10:30 UTC is a Monday — keeps weekday strings stable.
  const fixed = new Date('2024-03-04T10:30:00Z');

  it('en-US: "EEEE, MMMM d" → "Monday, March 4"', async () => {
    const out = await formatDate(fixed, 'EEEE, MMMM d', { locale: 'en-US' });
    expect(out).toBe('Monday, March 4');
  });

  it('de-DE: weekday names are German', async () => {
    const out = await formatDate(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Montag');
  });

  it('fr-FR: weekday names are French', async () => {
    const out = await formatDate(fixed, 'EEEE', { locale: 'fr-FR' });
    expect(out).toBe('lundi');
  });
});

describe('formatDateSync', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  const fixed = new Date('2024-03-04T10:30:00Z');

  it('falls back to en-US when the locale isn\'t loaded yet', () => {
    // Cache is empty after reset; sync call should still work.
    const out = formatDateSync(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Monday');
  });

  it('uses the cached locale once preloaded', async () => {
    await preloadDateLocale('de-DE');
    const out = formatDateSync(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Montag');
  });
});

describe('formatNumber', () => {
  it('en-US uses comma grouping and period decimals', () => {
    expect(formatNumber(1234567.89, { locale: 'en-US' })).toBe('1,234,567.89');
  });

  it('de-DE uses period grouping and comma decimals', () => {
    // The narrow no-break space character (U+202F) sometimes shows up in
    // de-DE output; either works at the structural level we care about.
    const out = formatNumber(1234567.89, { locale: 'de-DE' });
    expect(out).toMatch(/^1\.234\.567,89$/);
  });

  it('fr-FR uses (narrow no-break) space grouping and comma decimals', () => {
    const out = formatNumber(1234567.89, { locale: 'fr-FR' });
    // Replace any whitespace variant with a regular space for the assertion.
    expect(out.replace(/\s/g, ' ')).toBe('1 234 567,89');
  });

  it('forwards Intl.NumberFormatOptions through', () => {
    const out = formatNumber(0.42, { locale: 'en-US', style: 'percent' });
    expect(out).toBe('42%');
  });
});

describe('formatRelativeTime', () => {
  it('returns "now" for the same instant (en-US, numeric: auto)', () => {
    const t = Date.now();
    expect(formatRelativeTime(t, t, { locale: 'en-US' })).toBe('now');
  });

  it('returns the German "jetzt" for the same instant in de-DE', async () => {
    // Preload so the test is deterministic regardless of where it runs in
    // the suite. `Intl.RelativeTimeFormat` is part of the platform — no
    // date-fns dependency needed — but the preload also covers any future
    // formatter that does need the locale bundle warmed up.
    await preloadDateLocale('de-DE');
    const t = Date.now();
    expect(formatRelativeTime(t, t, { locale: 'de-DE' })).toBe('jetzt');
  });

  it('+1h returns "in 1 hour" (en-US, numeric: always)', () => {
    const from = new Date('2024-01-01T00:00:00Z').getTime();
    const to = from + 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'always' });
    expect(out).toBe('in 1 hour');
  });

  it('-1d returns "yesterday" with numeric: auto', () => {
    const to = new Date('2024-01-02T12:00:00Z').getTime();
    const from = to + 24 * 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'auto' });
    expect(out).toBe('yesterday');
  });

  it('-1d returns "1 day ago" with numeric: always', () => {
    const to = new Date('2024-01-02T12:00:00Z').getTime();
    const from = to + 24 * 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'always' });
    expect(out).toBe('1 day ago');
  });
});
