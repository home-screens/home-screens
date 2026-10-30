import { describe, it, expect, beforeEach } from 'vitest';
import {
  dayMonthPattern,
  dayOfMonthPattern,
  fullDatePattern,
  formatDateSync,
  formatDayRange,
  formatNumber,
  fullDateHeading,
  formatRelativeTime,
  __resetFormatterLocaleCacheForTests,
} from '@/i18n/formatters';

describe('formatDateSync', () => {
  // Use a fixed timestamp so the test is deterministic regardless of TZ.
  // 2024-03-04 10:30 UTC is a Monday — keeps weekday strings stable.
  const fixed = new Date('2024-03-04T10:30:00Z');

  it('en-US: "EEEE, MMMM d" → "Monday, March 4"', () => {
    expect(formatDateSync(fixed, 'EEEE, MMMM d', { locale: 'en-US' })).toBe('Monday, March 4');
  });

  it('writes every shipped language on the very first call, with nothing loaded first', () => {
    // The locales used to load on demand, and a first render (a wall's)
    // formatted in English until the import landed.
    expect(formatDateSync(fixed, 'EEEE', { locale: 'de-DE' })).toBe('Montag');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'fr-FR' })).toBe('lundi');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'es-ES' })).toBe('lunes');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'nl-NL' })).toBe('maandag');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'pt-BR' })).toBe('segunda-feira');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'da-DK' })).toBe('mandag');
  });

  it('reads a region of a shipped language in that language, and anything else in US English', () => {
    expect(formatDateSync(fixed, 'EEEE', { locale: 'de-AT' })).toBe('Montag');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'pt-PT' })).toBe('segunda-feira');
    expect(formatDateSync(fixed, 'EEEE', { locale: 'ja-JP' })).toBe('Monday');
  });
});

describe('dayOfMonthPattern', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  // 2 November 2026 is the date the school-timetable frames end a holiday on,
  // and a day the locales disagree about how to write.
  const backToSchool = new Date('2026-11-02T12:00:00Z');

  it('gives German and Danish the ordinal point their dates carry', () => {
    expect(dayOfMonthPattern('de-DE')).toBe('d.');
    expect(dayOfMonthPattern('da-DK')).toBe('d.');
  });

  it('leaves the day a bare number where the language writes one', () => {
    for (const locale of ['en-US', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR']) {
      expect(dayOfMonthPattern(locale)).toBe('d');
    }
  });

  it('reads the language rather than a list, so an unshipped locale is right too', () => {
    // Czech writes "2. listopadu"; nothing in this repo says so.
    expect(dayOfMonthPattern('cs-CZ')).toBe('d.');
  });

  it('falls back to the bare number for a tag Intl cannot read', () => {
    expect(dayOfMonthPattern('not a locale')).toBe('d');
  });

  it('composes into a pattern each language spells its own way', async () => {
    const de = formatDateSync(backToSchool, `EEEE, ${dayOfMonthPattern('de-DE')} MMMM`, {
      locale: 'de-DE',
    });
    expect(de).toBe('Montag, 2. November');
    const en = formatDateSync(backToSchool, `EEEE, ${dayOfMonthPattern('en-US')} MMMM`, {
      locale: 'en-US',
    });
    expect(en).toBe('Monday, 2 November');
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

describe('dayMonthPattern and fullDatePattern', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  const fixed = new Date('2026-11-02T12:00:00Z');

  /** What the locale itself would write, which is the answer to match. */
  const intl = (locale: string, weekday: boolean) =>
    new Intl.DateTimeFormat(locale, {
      ...(weekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(fixed);

  // Composing `${dayOfMonthPattern(locale)} MMMM` by hand chose day-first for
  // every language, so the default locale rendered "Monday, 2 November".
  // Which half leads, the separator after the weekday, and the "de" some
  // languages join with are all the language's own business.
  for (const locale of ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR', 'da-DK']) {
    it(`${locale}: writes the day and month the way the locale does`, async () => {
      expect(formatDateSync(fixed, dayMonthPattern(locale), { locale })).toBe(intl(locale, false));
    });

    it(`${locale}: writes the weekday, day and month the way the locale does`, async () => {
      expect(formatDateSync(fixed, fullDatePattern(locale), { locale })).toBe(intl(locale, true));
    });
  }

  it('puts the month first for English and the day first for German', () => {
    expect(dayMonthPattern('en-US')).toBe('MMMM d');
    expect(dayMonthPattern('de-DE')).toBe('d. MMMM');
  });

  it('takes a short month too', () => {
    expect(dayMonthPattern('en-US', 'short')).toBe('MMM d');
    expect(dayMonthPattern('de-DE', 'short')).toBe('d. MMM');
  });

  it('falls back to the bare day and month for a tag Intl cannot read', () => {
    expect(dayMonthPattern('not a locale')).toBe('d MMMM');
    expect(fullDatePattern('not a locale')).toBe('EEEE, d MMMM');
  });
});

describe('fullDateHeading', () => {
  const sunday = new Date(2026, 9, 25);

  it('writes the weekday and date the way each language does, starting with a capital', () => {
    expect(fullDateHeading(sunday, 'en-US')).toBe('Sunday, October 25');
    expect(fullDateHeading(sunday, 'de-DE')).toBe('Sonntag, 25. Oktober');
    expect(fullDateHeading(sunday, 'fr-FR')).toBe('Dimanche 25 octobre');
  });
});

describe('formatDayRange', () => {
  const start = new Date(2026, 9, 25);
  const end = new Date(2026, 9, 31);

  it('names a month once when the range stays inside it, in each language\'s order', () => {
    expect(formatDayRange(start, end, 'en-US')).toBe('October 25 – 31, 2026');
    expect(formatDayRange(start, end, 'de-DE')).toBe('25.–31. Oktober 2026');
  });

  it('names both months across a month end, and leaves the year off when asked', () => {
    const opts = { month: 'short', year: false } as const;
    expect(formatDayRange(end, new Date(2026, 10, 6), 'en-US', opts)).toBe('Oct 31 – Nov 6');
    expect(formatDayRange(end, new Date(2026, 10, 6), 'de-DE', opts)).toBe('31. Okt. – 6. Nov.');
  });

  it('spaces the dash with plain spaces, never the thin ones Intl uses', () => {
    expect(formatDayRange(end, new Date(2027, 0, 2), 'en-US', { month: 'short' })).toBe('Oct 31, 2026 – Jan 2, 2027');
  });
});
