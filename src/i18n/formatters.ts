/**
 * Locale-aware date / number / relative-time formatters.
 *
 * date-fns drives `formatDateSync` with the shipped languages' date-fns
 * locales bundled up front (about 2 KB each, gzipped). They used to load on
 * demand, which meant the first render on any surface (a wall above all)
 * formatted in English until the import landed, and anything memoized from
 * that render (the month grid's title) stayed English until midnight.
 * `formatNumber` and `formatRelativeTime` use `Intl.NumberFormat` /
 * `Intl.RelativeTimeFormat` directly.
 */

import { format as dfFormat } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { de } from 'date-fns/locale/de';
import { fr } from 'date-fns/locale/fr';
import { es } from 'date-fns/locale/es';
import { nl } from 'date-fns/locale/nl';
import { ptBR } from 'date-fns/locale/pt-BR';
import { da } from 'date-fns/locale/da';

interface DateFormatOpts {
  locale: string;
}

interface NumberFormatOpts extends Intl.NumberFormatOptions {
  locale: string;
}

interface RelativeTimeOpts {
  locale: string;
  numeric?: 'always' | 'auto';
  style?: 'long' | 'short' | 'narrow';
  /** Force one unit instead of picking the largest that fits ("70 min. ago"). */
  unit?: Intl.RelativeTimeFormatUnit;
}

// Intl.RelativeTimeFormat construction is expensive enough to matter on a
// Pi when a label re-renders on an animation loop, so formatters are kept
// per (locale, numeric, style).
const RTF_CACHE = new Map<string, Intl.RelativeTimeFormat>();
function relativeTimeFormatter(locale: string, numeric: 'always' | 'auto', style: 'long' | 'short' | 'narrow'): Intl.RelativeTimeFormat {
  const key = `${locale}|${numeric}|${style}`;
  let rtf = RTF_CACHE.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric, style });
    RTF_CACHE.set(key, rtf);
  }
  return rtf;
}

/**
 * The date-fns locale for a language tag. Any region of a shipped language
 * reads with that language's day and month names (`de-AT` in German), like
 * the rest of the app; anything else reads in US English.
 */
function dateFnsLocale(tag: string): DateFnsLocale {
  switch (tag.split('-')[0]) {
    case 'de': return de;
    case 'fr': return fr;
    case 'es': return es;
    case 'nl': return nl;
    case 'pt': return ptBR;
    case 'da': return da;
    default: return enUS;
  }
}

/**
 * Format `date` against a date-fns `pattern` in the language `opts.locale`
 * names. Synchronous on every path: the shipped languages are bundled.
 */
export function formatDateSync(
  date: Date | number,
  pattern: string,
  opts: DateFormatOpts,
): string {
  return dfFormat(date, pattern, { locale: dateFnsLocale(opts.locale) });
}

/**
 * The date the probe below is read on. Which date it is does not matter, since
 * the day is found by name among the formatted parts rather than by looking
 * for its digits; a day past the twelfth simply keeps the two apart for
 * anyone printing the parts while working on this.
 */
const DAY_PROBE = new Date(Date.UTC(2024, 10, 12));

const DAY_PATTERN_CACHE = new Map<string, string>();

/**
 * The date-fns pattern that writes a day of the month the way `locale` does.
 *
 * Some languages write the day as an ordinal with a point after the number
 * ("Montag, 2. November", "mandag 2. november") and others write the bare
 * number ("Monday, November 2", "lundi 2 novembre"). Rather than keep a list
 * of which language does which, this asks Intl how the locale spells a day
 * beside a month and copies the point when there is one, so a locale nobody
 * here speaks still comes out right.
 *
 * Returns a fragment to compose into a larger pattern: `d` or `d.`.
 */
export function dayOfMonthPattern(locale: string): string {
  const cached = DAY_PATTERN_CACHE.get(locale);
  if (cached) return cached;
  const pattern = probeDayOfMonthPattern(locale);
  DAY_PATTERN_CACHE.set(locale, pattern);
  return pattern;
}

function probeDayOfMonthPattern(locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).formatToParts(DAY_PROBE);
    const dayAt = parts.findIndex((part) => part.type === 'day');
    const after = dayAt < 0 ? undefined : parts[dayAt + 1];
    return after?.type === 'literal' && after.value.startsWith('.') ? 'd.' : 'd';
  } catch {
    // An unusable tag: the bare number is the safe reading in any language.
    return 'd';
  }
}

const DAY_MONTH_PATTERN_CACHE = new Map<string, string>();
const FULL_DATE_PATTERN_CACHE = new Map<string, string>();

/**
 * Literal text, safe to drop into a date-fns pattern.
 *
 * Every letter is a potential token to date-fns, and the separators Intl hands
 * back are full of them: Spanish writes "2 de noviembre", where an unquoted
 * "de" would format as a day of the month followed by a local day of week.
 * Single quotes escape a run, and a literal quote doubles.
 */
function quoteLiteral(text: string): string {
  if (text === '') return '';
  // Only letters mean anything to date-fns, so a space or a comma is carried
  // through as it is. Quoting those too worked but read as `MMMM' 'd`, which is
  // noise in a pattern somebody may have to debug.
  if (!/[a-zA-Z]/.test(text)) return text.replace(/'/g, "''");
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Build a date-fns pattern by asking Intl how `locale` lays these fields out,
 * and copying its order, separators and connecting words across.
 *
 * This is the whole reason neither of the two patterns below is composed by
 * hand. Which half leads is the language's business (English puts the month
 * first, German the day), and so is the punctuation: English and Spanish put a
 * comma after the weekday and French does not, Spanish and Portuguese join the
 * day to the month with "de". Picking any of that ourselves got some locale
 * wrong, and the one it got wrong was the default.
 */
function patternFromParts(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  monthToken: string,
  fallback: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(DAY_PROBE);
    if (!parts.some((part) => part.type === 'day') || !parts.some((part) => part.type === 'month')) {
      return fallback;
    }
    // The day token carries the locale's trailing point when it has one, which
    // Intl reports as the start of the following literal rather than as the day.
    const dayToken = dayOfMonthPattern(locale);
    let out = '';
    for (const part of parts) {
      if (part.type === 'weekday') out += 'EEEE';
      else if (part.type === 'month') out += monthToken;
      else if (part.type === 'day') out += dayToken;
      else if (part.type === 'literal') {
        const literal = dayToken.endsWith('.') && part.value.startsWith('.') ? part.value.slice(1) : part.value;
        out += quoteLiteral(literal);
      }
    }
    return out === '' ? fallback : out;
  } catch {
    return fallback;
  }
}

/**
 * The date-fns pattern that writes a day *and its month* the way `locale` does.
 *
 * `dayOfMonthPattern` above settles the trailing point and nothing else, so a
 * caller composing `${dayOfMonthPattern(locale)} MMMM` is choosing day-first for
 * every language - right for most of the ones we ship and wrong for English,
 * which renders "Monday, 2 November" that way.
 *
 * `month` picks the long or the short month name, and it changes more than the
 * name: Spanish writes "2 de noviembre" but "2 nov", so the connector is probed
 * at the width being asked for. Returns a fragment such as `MMMM d`, `d. MMMM`
 * or `d 'de' MMMM`.
 */
export function dayMonthPattern(locale: string, month: 'long' | 'short' = 'long'): string {
  const token = month === 'long' ? 'MMMM' : 'MMM';
  const key = `${locale}\u0000${token}`;
  const cached = DAY_MONTH_PATTERN_CACHE.get(key);
  if (cached) return cached;
  const pattern = patternFromParts(
    locale,
    { day: 'numeric', month },
    token,
    `${dayOfMonthPattern(locale)} ${token}`,
  );
  DAY_MONTH_PATTERN_CACHE.set(key, pattern);
  return pattern;
}

/**
 * The same, with the weekday in front: a whole "Monday, November 2" or
 * "Montag, 2. November", separators and connecting words included.
 */
export function fullDatePattern(locale: string, month: 'long' | 'short' = 'long'): string {
  const token = month === 'long' ? 'MMMM' : 'MMM';
  const key = `${locale}\u0000${token}`;
  const cached = FULL_DATE_PATTERN_CACHE.get(key);
  if (cached) return cached;
  const pattern = patternFromParts(
    locale,
    { weekday: 'long', day: 'numeric', month },
    token,
    `EEEE, ${dayMonthPattern(locale, month)}`,
  );
  FULL_DATE_PATTERN_CACHE.set(key, pattern);
  return pattern;
}

/**
 * Locale-aware number formatting. Forwards every Intl.NumberFormatOptions
 * field through, so callers can do `{ style: 'currency', currency: 'EUR' }`
 * etc. without the helper getting in the way.
 */
export function formatNumber(n: number, opts: NumberFormatOpts): string {
  const { locale, ...rest } = opts;
  return new Intl.NumberFormat(locale, rest).format(n);
}

/**
 * Render a relative time difference (`from` → `to`) — "in 2 days", "5 hours
 * ago", etc. Picks the largest unit that fits, mirroring how MDN's example
 * works. Defaults to `numeric: 'auto'` so en-US shows "yesterday" instead of
 * "1 day ago".
 */
export function formatRelativeTime(
  from: Date | number,
  to: Date | number,
  opts: RelativeTimeOpts,
): string {
  const fromMs = typeof from === 'number' ? from : from.getTime();
  const toMs = typeof to === 'number' ? to : to.getTime();
  const deltaSec = Math.round((toMs - fromMs) / 1000);

  const rtf = relativeTimeFormatter(opts.locale, opts.numeric ?? 'auto', opts.style ?? 'long');
  const abs = Math.abs(deltaSec);

  // Threshold table — picks the largest sensible unit. Numbers come from
  // average lengths so "in 30 days" rolls over to "next month" cleanly.
  const sec = 1;
  const min = 60;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (opts.unit) {
    const per: Record<string, number> = { second: sec, seconds: sec, minute: min, minutes: min, hour, hours: hour, day, days: day, week, weeks: week, month, months: month, year, years: year, quarter: 3 * month, quarters: 3 * month };
    return rtf.format(Math.round(deltaSec / (per[opts.unit] ?? sec)), opts.unit);
  }

  if (abs < min) return rtf.format(Math.round(deltaSec / sec), 'second');
  if (abs < hour) return rtf.format(Math.round(deltaSec / min), 'minute');
  if (abs < day) return rtf.format(Math.round(deltaSec / hour), 'hour');
  if (abs < week) return rtf.format(Math.round(deltaSec / day), 'day');
  if (abs < month) return rtf.format(Math.round(deltaSec / week), 'week');
  if (abs < year) return rtf.format(Math.round(deltaSec / month), 'month');
  return rtf.format(Math.round(deltaSec / year), 'year');
}

/**
 * A day as a heading in the language's own order and with its first letter
 * capitalized: "Monday, November 2", "Montag, 2. November", "Lundi 2 novembre"
 * (`month: 'short'` for "Monday, Nov 2").
 */
export function fullDateHeading(date: Date | number, locale: string, month: 'long' | 'short' = 'long'): string {
  const text = formatDateSync(date, fullDatePattern(locale, month), { locale });
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * A run of days in the language's own order, collapsing what the ends share:
 * "October 25 – 31, 2026", "25.–31. Oktober 2026", "October 30 – November 3,
 * 2026". `month: 'short'` and `year: false` for tighter labels.
 */
export function formatDayRange(start: Date, end: Date, locale: string, opts: { month?: 'long' | 'short'; year?: boolean } = {}): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: opts.month ?? 'long',
    day: 'numeric',
    ...(opts.year === false ? {} : { year: 'numeric' }),
  });
  // Intl spaces the dash with thin spaces; the app's titles use plain ones.
  return fmt.formatRange(start, end).replace(/[\u2009\u202f]/g, ' ');
}

/** @internal For tests: reset the pattern caches. */
export function __resetFormatterLocaleCacheForTests(): void {
  DAY_PATTERN_CACHE.clear();
  DAY_MONTH_PATTERN_CACHE.clear();
  FULL_DATE_PATTERN_CACHE.clear();
}
