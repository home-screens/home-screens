/**
 * Wall-clock time formatting shared by every surface that shows a time of day
 * as text: meal serving times, school bell schedules, and anything else that
 * stores a plain 'HH:MM' string rather than a real instant.
 *
 * These write the time the way the household's formatting language does,
 * through `formatTimeOfDay`, so a serving time reads the same as a calendar
 * event beside it (`18.30` in Danish, `6:30 p. m.` in Spanish 12-hour).
 *
 * This is separate from `@/lib/time-format`, which handles durations and
 * relative ages ("5s ago", "2h 30m") rather than clock times.
 */

import type { TimeFormat } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import { formatTimeOfDay, type TimeOfDayFormat } from './timezone';

/** Minutes in a day. A valid time of day is 0 up to but not including this. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse an 'HH:MM' 24-hour string to minutes from midnight, or null when it is
 * missing or malformed. Range-checks both parts, so '25:00' and '12:60' are
 * rejected rather than silently wrapping. That includes the empty string a
 * cleared `<input type="time">` can save, so callers treat a bad window as no
 * window instead of letting NaN into a comparison.
 *
 * The one parser for a clock time: the formatters below use it, and so does
 * anything that needs the number for arithmetic (window membership, sorting a
 * bell schedule).
 */
export function parseTimeToMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Format minutes from midnight for display in `locale`. Returns an empty
 * string for anything outside a single day, so callers can render the result
 * directly. `shape` asks for the hour alone or the numbers alone (see
 * `formatTimeOfDay`).
 *
 * Examples:
 *   formatClockMinutes(1110, '12h', 'en-US') -> '6:30 PM'
 *   formatClockMinutes(1110, '24h', 'en-US') -> '18:30'
 *   formatClockMinutes(1110, '24h', 'da-DK') -> '18.30'
 *   formatClockMinutes(0, '12h', 'en-US')    -> '12:00 AM'
 */
export function formatClockMinutes(
  minutes: number | undefined | null,
  format: TimeFormat,
  locale: string,
  shape: Pick<TimeOfDayFormat, 'hourOnly' | 'bare'> = {},
): string {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return '';
  if (minutes < 0 || minutes >= MINUTES_PER_DAY) return '';
  // The minute as a UTC instant, read in UTC: no zone's clock change can move it.
  return formatTimeOfDay(new Date(minutes * 60_000), { ...shape, timeFormat: format, locale, timezone: 'UTC' });
}

/**
 * Format an 'HH:MM' 24-hour string for display in `locale`, honoring the
 * household's clock preference. Returns an empty string for missing or
 * invalid input.
 *
 * Examples:
 *   formatClockTime('18:30', '12h', 'en-US') -> '6:30 PM'
 *   formatClockTime('18:30', '24h', 'en-US') -> '18:30'
 *   formatClockTime('07:00', '24h', 'es-ES') -> '7:00'
 */
export function formatClockTime(
  time: string | undefined | null,
  format: TimeFormat,
  locale: string,
): string {
  return formatClockMinutes(parseTimeToMinutes(time), format, locale);
}

/**
 * The same, with a 12-hour time's day period left off ('13:20' -> '1:20'), for a
 * place too narrow for it where the hour cannot be mistaken, such as the
 * period gutter of a school timetable. A 24-hour time has none to leave off.
 */
export function formatClockTimeBare(
  time: string | undefined | null,
  format: TimeFormat,
  locale: string,
): string {
  return formatClockMinutes(parseTimeToMinutes(time), format, locale, { bare: true });
}

/**
 * An hour mark on a ruler or down a time grid: the time in 24-hour mode
 * (`07:00`, `07.00` in Danish) and the hour alone in 12-hour mode (`7 AM`,
 * `7 a. m.` in Spanish). `minutes` is minutes from midnight, on the hour.
 */
export function formatHourMark(minutes: number, format: TimeFormat, locale: string): string {
  return formatClockMinutes(minutes, format, locale, { hourOnly: format === '12h' });
}

const LOCALE_TIME_FORMATS = new Map<string, TimeFormat>();

/**
 * The 12/24-hour clock a language writes by default: en-US 12-hour, en-GB,
 * de-DE, da-DK and pt-BR 24-hour. Read from Intl's hour cycle rather than
 * guessed from the language tag (`h11`/`h12` are 12-hour, `h23`/`h24`
 * 24-hour), which also gets en-GB and fr-CA right.
 */
export function localeTimeFormat(locale: string): TimeFormat {
  const cached = LOCALE_TIME_FORMATS.get(locale);
  if (cached) return cached;
  let format: TimeFormat = '12h';
  try {
    const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    format = cycle === 'h11' || cycle === 'h12' ? '12h' : '24h';
  } catch {
    // Not a locale this runtime knows: keep the 12-hour clock.
  }
  LOCALE_TIME_FORMATS.set(locale, format);
  return format;
}

/**
 * The household's 12/24-hour clock: the one it picked, or its formatting
 * language's own while it has picked none. The one place an absent
 * `settings.timeFormat` gets its meaning; pass the formatting locale
 * (`useFormattingLocale()` on the client, `settingsTimeFormat` on the server).
 */
export function householdTimeFormat(timeFormat: TimeFormat | undefined | null, locale: string): TimeFormat {
  return timeFormat ?? localeTimeFormat(locale);
}

/** `householdTimeFormat` from a settings object, for code that holds the whole of it. */
export function settingsTimeFormat(
  settings: { timeFormat?: TimeFormat; locale?: string; formattingLocale?: string } | undefined | null,
): TimeFormat {
  return householdTimeFormat(settings?.timeFormat, settings?.formattingLocale || settings?.locale || DEFAULT_LOCALE);
}
