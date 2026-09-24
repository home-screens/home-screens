/**
 * Wall-clock time formatting shared by every surface that shows a time of day
 * as text: meal serving times, school bell schedules, and anything else that
 * stores a plain 'HH:MM' string rather than a real instant.
 *
 * Deliberately NOT localized. The day period renders as the English 'AM' /
 * 'PM' in every locale, which is what these surfaces have always shipped and
 * what their layouts are sized for. A surface that formats a real `Date` and
 * wants the locale's own day period should use `formatEventTime` from
 * `@/lib/calendar-utils` instead, which goes through date-fns.
 *
 * This is separate from `@/lib/time-format`, which handles durations and
 * relative ages ("5s ago", "2h 30m") rather than clock times.
 */

import type { TimeFormat } from '@/types/config';
import { DEFAULT_LOCALE } from '@/i18n/manifest';

/** Minutes in a day. A valid time of day is 0 up to but not including this. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse an 'HH:MM' 24-hour string to minutes from midnight, or null when it is
 * missing or malformed. Range-checks both parts, so '25:00' and '12:60' are
 * rejected rather than silently wrapping.
 *
 * Internal: the exported entry points are the two formatters. Callers that
 * need the number for arithmetic (window membership, sorting a bell schedule)
 * use `parseTimeToMinutes` from `@/lib/sleep-timeline`, which accepts the same
 * strings.
 */
function toMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Format minutes from midnight for display. Returns an empty string for
 * anything outside a single day, so callers can render the result directly.
 *
 * Examples:
 *   formatClockMinutes(1110, '12h') -> '6:30 PM'
 *   formatClockMinutes(1110, '24h') -> '18:30'
 *   formatClockMinutes(0, '12h')    -> '12:00 AM'
 */
export function formatClockMinutes(
  minutes: number | undefined | null,
  format: TimeFormat,
): string {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return '';
  if (minutes < 0 || minutes >= MINUTES_PER_DAY) return '';

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mm = String(m).padStart(2, '0');

  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${mm}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Format an 'HH:MM' 24-hour string for display, honoring the household's
 * clock preference. Returns an empty string for missing or invalid input.
 *
 * Examples:
 *   formatClockTime('18:30', '12h') -> '6:30 PM'
 *   formatClockTime('18:30', '24h') -> '18:30'
 *   formatClockTime('07:00', '12h') -> '7:00 AM'
 */
export function formatClockTime(
  time: string | undefined | null,
  format: TimeFormat,
): string {
  return formatClockMinutes(toMinutes(time), format);
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
