import { getWeek, getDayOfYear } from 'date-fns';

/**
 * Shared time-parsing and date-info utilities used by clock and date view components.
 */

/** Parsed clock time values for rendering */
interface ParsedClockTime {
  hours: number;
  minutes: number;
  seconds: number;
  /** Display hour (12h or 24h depending on config) */
  h: number;
  /** Hours string — zero-padded in 24h mode, unpadded in 12h mode */
  hStr: string;
  /** Minutes string — always zero-padded */
  mStr: string;
  /** Seconds string — always zero-padded */
  sStr: string;
  /** AM/PM period with leading space (' AM' / ' PM'), or empty string in 24h mode */
  period: string;
}

/**
 * Parse a Date into display-ready clock values.
 *
 * @param format24h - Whether to use 24-hour format
 * @param now - The current Date
 */
export function parseClockTime(format24h: boolean, now: Date): ParsedClockTime {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const h = format24h ? hours : hours % 12 || 12;
  const hStr = format24h ? String(h).padStart(2, '0') : String(h);
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');
  const period = format24h ? '' : hours >= 12 ? ' PM' : ' AM';

  return { hours, minutes, seconds, h, hStr, mStr, sStr, period };
}

/** Raw week-number and day-of-year values */
interface DateInfoValues {
  weekNumber: number;
  dayOfYear: number;
}

/**
 * Get raw week number and day-of-year values for a given date.
 */
export function getDateInfoValues(now: Date): DateInfoValues {
  return {
    weekNumber: getWeek(now),
    dayOfYear: getDayOfYear(now),
  };
}

/**
 * Build the info-parts array (week number, day of year) used by clock and date views.
 *
 * @param config - Object with showWeekNumber and showDayOfYear flags
 * @param now - The current Date
 * @returns Array of info strings like "Week 12", "Day 85"
 */
export function buildInfoParts(
  config: { showWeekNumber?: boolean; showDayOfYear?: boolean },
  now: Date,
): string[] {
  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const parts: string[] = [];
  if (config.showWeekNumber) parts.push(`Week ${weekNumber}`);
  if (config.showDayOfYear) parts.push(`Day ${dayOfYear}`);
  return parts;
}
