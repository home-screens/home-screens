import type { ModuleSchedule, TimeFormat } from '@/types/config';
import { householdTimeFormat } from '@/lib/clock-time';
import { resolveSpanDays } from '@/lib/schedule';
import type { TranslateFn } from '@/i18n/types';
import { getLocalizedDayNames } from '@/lib/meal-constants';
import { formatEventTime } from '@/lib/calendar-utils';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && b.every((d) => a.includes(d));
}

/**
 * "every day" / "Mon to Fri" / "Sat and Sun" / "Mon, Wed, Fri".
 *
 * The three named shapes read better than a list and are the ones people
 * actually pick; anything else falls back to the short day names joined in
 * week order, using the formatting locale's own abbreviations.
 */
export function formatScheduleDays(
  schedule: ModuleSchedule | undefined,
  t: TranslateFn,
  formattingLocale: string,
): string {
  const days = [...(schedule?.daysOfWeek ?? ALL_DAYS)].sort((a, b) => a - b);
  if (sameSet(days, ALL_DAYS)) return t('scheduleEditor.summary.everyDay');
  if (sameSet(days, WEEKDAYS)) return t('scheduleEditor.summary.weekdays');
  if (sameSet(days, WEEKEND)) return t('scheduleEditor.summary.weekends');
  const names = getLocalizedDayNames(formattingLocale, 'short');
  return days.map((d) => names[d]).join(', ');
}

/**
 * "all day" only when BOTH ends are unset, else "7:00 AM to 9:00 AM",
 * "from 6:00 PM" or "until 9:00 AM".
 *
 * One open end is a real gate, not all day: the matcher fills a missing start
 * with midnight and a missing end with the end of the day, so "From 6:00 PM,
 * Until empty" hides the module for eighteen hours. Saying "all day" there
 * described the opposite of what the display does.
 *
 * A window that closes on a later day says so: "4:00 PM until 8:00 AM the next
 * day", "8:00 AM until 8:00 PM 3 days later". The editor shows this only to
 * screen readers, since the week strip draws the same fact, but the canvas
 * status chips have no strip and rely on it entirely.
 */
export function formatScheduleTime(
  schedule: ModuleSchedule | undefined,
  t: TranslateFn,
  formattingLocale: string,
  timeFormat: TimeFormat | undefined,
): string {
  const start = schedule?.startTime;
  const end = schedule?.endTime;
  if (!start && !end) return t('scheduleEditor.summary.allDay');

  const span = resolveSpanDays(schedule);

  // A one-sided window that stays inside its own day reads best open-ended:
  // "from 6:00 PM" already says it runs to midnight, and "until 9:00 AM" that
  // it starts there.
  if (span === 0 && !end) {
    return t('scheduleEditor.summary.fromOnly', {
      start: formatClock(start as string, formattingLocale, timeFormat),
    });
  }
  if (span === 0 && !start) {
    return t('scheduleEditor.summary.untilOnly', {
      end: formatClock(end as string, formattingLocale, timeFormat),
    });
  }

  // Once days are involved the open end has to be named, or the reader cannot
  // tell which midnight it closes on. A missing end is the end of its day,
  // which is the next day's midnight, so it counts one more day than the
  // stored span.
  const parts = {
    start: formatClock(start ?? '00:00', formattingLocale, timeFormat),
    end: formatClock(end ?? '00:00', formattingLocale, timeFormat),
  };
  const spanDays = end ? span : span + 1;
  if (spanDays === 0) return t('scheduleEditor.summary.window', parts);
  return t('scheduleEditor.summary.windowSpanned', {
    ...parts,
    span:
      spanDays === 1
        ? t('scheduleEditor.endsNextDay')
        : t('scheduleEditor.endsDaysLater', { count: spanDays }),
  });
}


/**
 * "07:00" → "7:00 AM" (or "07:00" under a 24-hour household). Delegates to
 * `formatEventTime` — the calendar surfaces' own 12h/24h formatter — so the
 * two never drift and this gets its locale-empty-day-period `.trim()` fix
 * for free.
 */
function formatClock(hhmm: string, formattingLocale: string, timeFormat: TimeFormat | undefined): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const anchor = new Date(2024, 0, 7, h, m);
  return formatEventTime(anchor, householdTimeFormat(timeFormat, formattingLocale), formattingLocale);
}

export interface ScheduleSummary {
  /** "Mon to Fri, 7:00 AM to 9:00 AM" — the chip on the canvas and in the panel. */
  short: string;
  /** The same, as a sentence, honouring `invert`. */
  sentence: string;
}

/**
 * One description of a schedule, shared by the schedule editor's summary line
 * and the status chips on the canvas and in the property panel, so the two
 * can never disagree about what a schedule does.
 */
export function describeSchedule(
  schedule: ModuleSchedule | undefined,
  t: TranslateFn,
  formattingLocale: string,
  timeFormat: TimeFormat | undefined,
): ScheduleSummary {
  const short = t('scheduleEditor.summary.short', {
    days: formatScheduleDays(schedule, t, formattingLocale),
    time: formatScheduleTime(schedule, t, formattingLocale, timeFormat),
  });
  return {
    short,
    sentence: schedule?.invert
      ? t('scheduleEditor.summary.hides', { when: short })
      : t('scheduleEditor.summary.shows', { when: short }),
  };
}
