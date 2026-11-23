import { addDays, startOfDay } from 'date-fns';
import { compareEventStarts, formatEventTime, isAllDayEvent, isEventOnDay, parseEventWallTime } from '@/lib/calendar-utils';
import type { TimeFormat } from '@/types/config';
import { dayMonthPattern, formatDateSync, fullDatePattern } from '@/i18n';

/**
 * The rules behind a calendar's day sheet: the panel a tap on "+N more" (or a
 * grid's day number) opens with every event that day. Both calendar modules
 * draw it, so what it lists and in which order lives here, once.
 */

type SheetEvent = { id: string; title: string; start: string; end: string; allDay?: boolean };

export interface DaySheetRow<T extends SheetEvent> {
  event: T;
  /**
   * Drawn as "All day": an all-day event, or a timed one that started before
   * this day and runs past its end, so it fills the whole day.
   */
  allDay: boolean;
  /** Wall-clock start and end, in the display's time zone. */
  start: Date;
  end: Date;
  /** The start is on an earlier day, so its time is shown with its weekday. */
  startsEarlier: boolean;
  /** The end is on a later day, so its time is shown with its weekday. */
  endsLater: boolean;
}

/**
 * One row per event on `day`, in the order the sheet lists them: all-day rows
 * first, then timed rows by start, then by end, then by title. The events are
 * the ones the tapped cell had (already through the source, people, title and
 * rule filters); an event listed twice (a day header that gathers several
 * rows of a family grid) is kept once, and one that no longer falls on the day
 * after a refresh is left out.
 *
 * `day` may be any moment of the day: the rows are worked out from its local
 * midnight. The phone hands it noon (the time it formats days with), and
 * comparing from noon put an all-day event on the day before as well.
 */
export function daySheetRows<T extends SheetEvent>(events: readonly T[], moment: Date, timezone?: string): DaySheetRow<T>[] {
  const day = startOfDay(moment);
  const dayEnd = addDays(day, 1);
  const seen = new Set<string>();
  const rows: DaySheetRow<T>[] = [];
  for (const event of events) {
    if (seen.has(event.id) || !isEventOnDay(event, day, timezone)) continue;
    seen.add(event.id);
    const start = parseEventWallTime(event.start, timezone);
    const end = parseEventWallTime(event.end, timezone);
    if (isAllDayEvent(event)) {
      rows.push({ event, allDay: true, start, end, startsEarlier: false, endsLater: false });
      continue;
    }
    const startsEarlier = start < day;
    const endsLater = end > dayEnd;
    rows.push({ event, allDay: startsEarlier && endsLater, start, end, startsEarlier, endsLater });
  }
  return rows.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return compareEventStarts(a.event.start, b.event.start, timezone)
      || a.end.getTime() - b.end.getTime()
      || a.event.title.localeCompare(b.event.title);
  });
}

/**
 * A row's start or end as the sheet prints it: the clock time, with its
 * weekday when it falls on another day than the row's ("Fri 4:00 PM"), so a
 * camping trip listed on Sunday does not read as 4 PM to 11 AM that day.
 * The wall's sheet and the phone's Calendar tab both say it this way.
 */
export function daySheetTime(d: Date, otherDay: boolean, timeFormat: TimeFormat, locale: string): string {
  const clock = formatEventTime(d, timeFormat, locale);
  return otherDay ? `${formatDateSync(d, 'EEE', { locale })} ${clock}` : clock;
}

export interface DaySheetHeading {
  /** "Friday": the small capitals line before the count. */
  weekday: string;
  /** "November 6", "6. November": the big serif line, first letter capitalized. */
  date: string;
  /** "Friday, November 6", "vendredi 6 novembre": the whole day mid-sentence, for labels. */
  full: string;
}

/** The words at the top of a day sheet, in the language's own date order. */
export function daySheetHeading(day: Date, locale: string): DaySheetHeading {
  const date = formatDateSync(day, dayMonthPattern(locale, 'long'), { locale });
  return {
    weekday: formatDateSync(day, 'EEEE', { locale }),
    date: date.charAt(0).toLocaleUpperCase(locale) + date.slice(1),
    full: formatDateSync(day, fullDatePattern(locale, 'long'), { locale }),
  };
}
