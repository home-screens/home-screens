/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings, the one home for it.
 *
 * A day spelled this way has no clock and no zone, so the sums here are done
 * on the calendar alone (through UTC, which has no daylight saving). Nothing
 * in this file reads "now" or a time zone: callers get today from
 * `isoDateInTZ` in `./timezone` and pass it in.
 *
 * No function here throws. Given something that is not a day, the string
 * helpers answer `NaN-NaN-NaN`, which equals no day and sorts after every
 * real one, and the number helpers answer `NaN` or `null` as documented.
 */

/** The length of a day that has no daylight-saving change in it. */
export const DAY_MS = 86_400_000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day spelled `YYYY-MM-DD` (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The day as UTC midnight in milliseconds, for sums between days. `NaN` for anything that is not a day. */
export function isoUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoOfUtcMs(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** `iso` moved by `days`, counted on the calendar (no clock, so no daylight-saving drift). Negative counts move backwards. */
export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOfUtcMs(Date.UTC(y, m - 1, d + days));
}

/** The day of the week: 0 = Sunday through 6 = Saturday. */
export function isoWeekday(iso: string): number {
  return new Date(isoUtcMs(iso)).getUTCDay();
}

/** The Monday of this day's week. Weeks run Monday to Sunday, so Saturday and Sunday belong to the week that just ended. */
export function mondayOf(iso: string): string {
  return addIsoDays(iso, -((isoWeekday(iso) + 6) % 7));
}

/** The seven days of the week holding `iso`, first day first, for a week that starts on Sunday or Monday. */
export function weekDatesContaining(iso: string, weekStartDay: 'sunday' | 'monday'): string[] {
  const back = (isoWeekday(iso) - (weekStartDay === 'monday' ? 1 : 0) + 7) % 7;
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(addIsoDays(iso, i - back));
  return dates;
}

/**
 * The day as a `Date` at local midnight, for reading its weekday or handing
 * it to a formatter that prints local fields. Not checked: anything that is
 * not a day gives an Invalid Date. Use `parseIsoDate` for text a person or
 * another service supplied.
 */
export function localDateFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` as local midnight, or null for anything not spelled that way. */
export function parseIsoDate(iso: string): Date | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days from `fromIso` to `toIso` (negative when `toIso` is earlier), or null when either is not spelled `YYYY-MM-DD`. */
export function isoDaysBetween(fromIso: string, toIso: string): number | null {
  if (!ISO_DATE.test(fromIso) || !ISO_DATE.test(toIso)) return null;
  return Math.round((isoUtcMs(toIso) - isoUtcMs(fromIso)) / DAY_MS);
}
