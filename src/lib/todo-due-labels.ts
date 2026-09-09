/**
 * Due-date chips for to-do items ("Today", "Tomorrow", "Overdue", "Sat",
 * "Oct 3"). Shared by the phone remote and the wall module so both agree on
 * what a date means. Dates are `YYYY-MM-DD` local calendar days, the same
 * shape `TodoListItem.dueDate` stores.
 */

export type DueKind = 'today' | 'tomorrow' | 'overdue' | 'weekday' | 'date';

export { localISODate } from './timezone';

/** Parse `YYYY-MM-DD` as local midnight. Returns null for anything else. */
export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole calendar days from `fromISO` to `toISO` (negative when `toISO` is earlier). */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return null;
  // Both are local midnights; rounding absorbs a DST hour either way.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * How a due date should read next to an item today.
 *
 * A done item is never "overdue": once it is checked off the date is just
 * the day it was for. Within the coming week the weekday is enough; further
 * out the short date says more.
 */
export function classifyDue(dueDate: string, todayISO: string, completed = false): DueKind {
  const diff = daysBetween(todayISO, dueDate);
  if (diff === null) return 'date';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 0) return completed ? 'date' : 'overdue';
  if (diff <= 6) return 'weekday';
  return 'date';
}

export interface DueWords {
  today: string;
  tomorrow: string;
  overdue: string;
}

/** The chip text for a due date, localized words supplied by the caller. */
export function formatDueLabel(
  dueDate: string,
  todayISO: string,
  locale: string,
  words: DueWords,
  completed = false,
): string {
  const kind = classifyDue(dueDate, todayISO, completed);
  if (kind === 'today') return words.today;
  if (kind === 'tomorrow') return words.tomorrow;
  if (kind === 'overdue') return words.overdue;
  const d = parseISODate(dueDate);
  if (!d) return dueDate;
  if (kind === 'weekday') return d.toLocaleDateString(locale, { weekday: 'short' });
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
