import { formatDayRange } from '@/i18n/formatters';
import { dateToDayIndex, fromISODate, getLocalizedDayNames, toISODate } from './meal-constants';

/**
 * How the meal planner's questions and notices name the days they act on.
 *
 * The planner pages through weeks, and its words used to say "this week"
 * for whichever one was on screen: a family planning ahead read "This will
 * remove all planned meals for this week" as the week they were living in,
 * just before a delete.
 */

/** The week on screen, as a message names it. */
export interface ShownWeek {
  /** It is the household's own week, so a message may say "this week". */
  thisWeek: boolean;
  /** Its first to last day, short: "Nov 16 – 22", "16.–22. Nov.", with the year when it is not this one. */
  range: string;
}

/**
 * The week `weekDates` (its seven `YYYY-MM-DD` days, in order) as seen from
 * `todayISO`. Callers choose between two whole sentences with `thisWeek`
 * rather than splicing a phrase into one: the words around a week change
 * with it in most of the shipped languages ("dieser Woche", "vom 16. bis
 * 22. Nov.").
 */
export function shownWeek(weekDates: readonly string[], todayISO: string, locale: string): ShownWeek {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  return {
    thisWeek: weekDates.includes(todayISO),
    range: formatDayRange(fromISODate(first), fromISODate(last), locale, {
      month: 'short',
      year: last.slice(0, 4) !== todayISO.slice(0, 4),
    }),
  };
}

const DAY_MONTH = new Map<string, Intl.DateTimeFormat>();

/**
 * The days from `todayISO` on among `dates`, for a question that says where
 * a meal is planned before it goes ("Monday, Thursday and Nov 12"). A day in
 * the coming week is its weekday, one further out its date; days gone by are
 * left out, since nobody plans around them. The first `max` are named and
 * the rest counted with `more` ("and 2 more days"). Null when none are left.
 */
export function formatPlannedDays(
  dates: readonly string[],
  todayISO: string,
  locale: string,
  more: (count: number) => string,
  max = 3,
): string | null {
  const weekOut = fromISODate(todayISO);
  weekOut.setDate(weekOut.getDate() + 7);
  const nextWeek = toISODate(weekOut);
  const upcoming = [...new Set(dates)].filter((d) => d >= todayISO).sort();
  if (upcoming.length === 0) return null;

  const weekdays = getLocalizedDayNames(locale, 'full');
  let dayMonth = DAY_MONTH.get(locale);
  if (!dayMonth) {
    dayMonth = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
    DAY_MONTH.set(locale, dayMonth);
  }
  const shown = upcoming.length > max ? upcoming.slice(0, max) : upcoming;
  const names = shown.map((d) => (d < nextWeek ? weekdays[dateToDayIndex(d)] : dayMonth.format(fromISODate(d))));
  const rest = upcoming.length - shown.length;
  if (rest > 0) names.push(more(rest));
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}
