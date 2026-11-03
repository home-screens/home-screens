import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { dateInfoParts, dateInfoText, type DateInfoPart } from '@/lib/date-info';
import { localeWeekStart } from '@/lib/week-number';
import { clockDatePattern } from './date-pattern';

/** Translation keys (modules namespace) for the info line's two labels. */
export interface DateInfoLabelKeys {
  week: string;
  day: string;
}

/** The clock views' "Week" and "Day" labels. */
export const CLOCK_INFO_LABELS: DateInfoLabelKeys = { week: 'clock.weekShort', day: 'clock.dayShort' };

/** The date views' "Week" and "Day" labels; the Banner view has its own shorter pair. */
export const DATE_INFO_LABELS: DateInfoLabelKeys = { week: 'date.weekShort', day: 'date.dayShort' };

export interface DateInfoLine {
  /** The parts on their own, for a view that lays label and number out separately. */
  parts: DateInfoPart[];
  /** The parts joined, or null when the line has nothing to show. */
  text: string | null;
}

/**
 * The week-number and day-of-year line a clock or date view prints under
 * the date, numbered the way the formatting locale's calendar is (see
 * `localeWeekStart`) and labelled in the household's language.
 */
export function useDateInfoLine(
  config: { showWeekNumber?: boolean; showDayOfYear?: boolean },
  now: Date,
  labelKeys: DateInfoLabelKeys,
  separator?: string,
): DateInfoLine {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const parts = dateInfoParts(config, now, localeWeekStart(locale), { week: t(labelKeys.week), day: t(labelKeys.day) });
  return { parts, text: dateInfoText(parts, separator) };
}

/**
 * The clock's date line in the household's language and the clock's own
 * pattern, or null when the clock does not show a date.
 */
export function useClockDateLine(config: { showDate?: boolean; dateFormat?: string }, now: Date): string | null {
  const locale = useFormattingLocale();
  return config.showDate
    ? formatDateSync(now, clockDatePattern(config.dateFormat, locale), { locale })
    : null;
}
