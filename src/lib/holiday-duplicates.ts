import { isAllDayEvent } from './calendar-utils';

/**
 * A family with Google's holiday calendar (or any other calendar that lists
 * holidays) who also turns on Public Holidays gets every public holiday
 * twice: "Veterans Day" from the calendar and "Veterans Day" from the
 * feature. One of the two is enough.
 */

type DayEvent = { start: string; end: string; title: string; allDay?: boolean; kind?: string };

/**
 * A holiday's name with what two calendars spell differently taken out: case,
 * accents, punctuation and spacing, and an English "Day" at the end. So
 * "Martin Luther King, Jr. Day" matches "Martin Luther King Jr Day",
 * "Thanksgiving Day" matches "Thanksgiving", and "New Year’s Day" matches
 * "New Years Day".
 */
export function holidayNameKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length > 1 && words[words.length - 1] === 'day') words.pop();
  return words.join('');
}

/** The days an all-day event covers (date-only strings, end exclusive) and its loose name. */
function dayKey(ev: DayEvent): string {
  return `${ev.start.slice(0, 10)}/${ev.end.slice(0, 10)}/${holidayNameKey(ev.title)}`;
}

/**
 * Drops another calendar's all-day copy of a public holiday that the Public
 * Holidays feature (`kind: 'holiday'`) also lists for the same day under
 * nearly the same name. The feature's copy stays: it is the one marked as a
 * holiday, with its own look and label, and it shows for everyone whatever
 * "Show only these people" says. Run on the events a calendar is about to
 * draw, after its own filters and rules, so a calendar that leaves the
 * feature out (or hides it with a rule) still gets the other copy.
 */
export function dropDuplicateHolidays<T extends DayEvent>(events: readonly T[]): T[] {
  const holidays = new Set<string>();
  for (const ev of events) {
    if (ev.kind === 'holiday') holidays.add(dayKey(ev));
  }
  if (holidays.size === 0) return events.slice();
  return events.filter((ev) => ev.kind === 'holiday' || ev.kind === 'birthday' || !isAllDayEvent(ev) || !holidays.has(dayKey(ev)));
}
