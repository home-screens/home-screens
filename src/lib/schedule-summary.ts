import { DEFAULT_TIME_FORMAT, type ModuleSchedule, type TimeFormat } from '@/types/config';
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

/** "all day" when either end of the window is unset, else "7:00 AM to 9:00 AM". */
export function formatScheduleTime(
  schedule: ModuleSchedule | undefined,
  t: TranslateFn,
  formattingLocale: string,
  timeFormat: TimeFormat | undefined,
): string {
  const start = schedule?.startTime;
  const end = schedule?.endTime;
  if (!start || !end) return t('scheduleEditor.summary.allDay');
  return t('scheduleEditor.summary.window', {
    start: formatClock(start, formattingLocale, timeFormat),
    end: formatClock(end, formattingLocale, timeFormat),
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
  return formatEventTime(anchor, timeFormat ?? DEFAULT_TIME_FORMAT, formattingLocale);
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
