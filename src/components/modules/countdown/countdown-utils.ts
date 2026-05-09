import { parseDateInTZ } from '@/lib/timezone';
import type { CountdownEvent } from '@/types/config';
import type { TimeRemaining, ProcessedEvent } from './types';

export function getTimeRemaining(targetDate: string, timezone?: string): TimeRemaining {
  const diff = parseDateInTZ(targetDate, timezone).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const past = diff < 0;

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, past, totalMs: diff };
}

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * For recurring yearly events, resolve the date to the next occurrence.
 * If the stored month/day has already passed this year, advance to next year.
 * Resolution is at render time — the stored date is never mutated.
 *
 * We parse month/day/time directly from the stored date string (not from a
 * Date object) to avoid timezone-dependent extraction. The string contains the
 * user's intended calendar values; timezone only matters for the "has it
 * passed" check, which getTimeRemaining handles via parseDateInTZ.
 *
 * When `stayUntilEndOfDay` is true and today's calendar date in the configured
 * timezone matches the recurring event's month/day, we keep this year's date
 * even after the moment has passed — so the event stays visible through the
 * rest of the day instead of jumping forward to next year.
 */
export function resolveEventDate(
  event: CountdownEvent,
  timezone?: string,
  stayUntilEndOfDay = false,
): string {
  if (event.recurring !== 'yearly') return event.date;

  // Extract month/day/time from the stored string (e.g. "2025-12-25T00:00")
  const match = event.date.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return event.date;

  const month = parseInt(match[2], 10); // 1-12
  const day = parseInt(match[3], 10);
  const hours = parseInt(match[4] ?? '0', 10);
  const minutes = parseInt(match[5] ?? '0', 10);

  // Determine the current year in the configured timezone
  const now = timezone ? createTZDateFromTimezone(timezone) : new Date();
  const currentYear = now.getFullYear();

  // Build candidate date for this year and check if it's still upcoming
  const thisYearStr = formatDateStr(currentYear, month, day, hours, minutes);
  const thisYearMs = parseDateInTZ(thisYearStr, timezone).getTime();
  if (thisYearMs >= Date.now()) {
    return thisYearStr;
  }

  // Already passed this year — but if it's still the same calendar day in the
  // configured timezone and the user opted into "stay until end of day", keep it.
  if (stayUntilEndOfDay) {
    const today = getDatePartsInTZ(new Date(), timezone);
    if (today.month === month && today.day === day) {
      return thisYearStr;
    }
  }

  // Otherwise advance to next year
  return formatDateStr(currentYear + 1, month, day, hours, minutes);
}

/** Extract calendar year/month/day for a Date as observed in `timezone`. */
function getDatePartsInTZ(date: Date, timezone?: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** True if the YYYY-MM-DD prefix of `targetDate` matches today's date in `timezone`. */
function isSameLocalDay(targetDate: string, timezone?: string): boolean {
  const m = targetDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const today = getDatePartsInTZ(new Date(), timezone);
  return (
    today.year === parseInt(m[1], 10) &&
    today.month === parseInt(m[2], 10) &&
    today.day === parseInt(m[3], 10)
  );
}

/** Get the current date/time in a specific timezone */
function createTZDateFromTimezone(timezone: string): Date {
  try {
    // 'en-US' here is locale-INDEPENDENT machine extraction — the
    // values are immediately parsed back to integers, so an Arabic-Indic
    // numeral output would break parseInt. This is not user-facing
    // formatting; do not localize this string.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    const hour = get('hour') === 24 ? 0 : get('hour');
    return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'));
  } catch {
    return new Date();
  }
}

function formatDateStr(year: number, month: number, day: number, hours: number, minutes: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const min = String(minutes).padStart(2, '0');
  return `${year}-${m}-${d}T${h}:${min}`;
}

export function processEvents(
  events: CountdownEvent[],
  showPastEvents: boolean,
  timezone?: string,
  stayUntilEndOfDay = false,
): ProcessedEvent[] {
  return events
    .map((event) => {
      const resolved = resolveEventDate(event, timezone, stayUntilEndOfDay);
      const time = getTimeRemaining(resolved, timezone);
      const stayingForToday = stayUntilEndOfDay && time.past && isSameLocalDay(resolved, timezone);
      return { ...event, time, stayingForToday };
    })
    .filter((event) => showPastEvents || !event.time.past || event.stayingForToday)
    .sort((a, b) => {
      // Today-but-passed events sort first — they're the most relevant thing on screen the day-of.
      if (a.stayingForToday !== b.stayingForToday) return a.stayingForToday ? -1 : 1;
      if (a.time.past !== b.time.past) return a.time.past ? 1 : -1;
      return a.time.totalMs - b.time.totalMs;
    });
}
