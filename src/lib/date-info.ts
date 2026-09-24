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

/** A time of day as plain numbers: hours 0 to 23, minutes, seconds. */
export interface ClockTime {
  hours: number;
  minutes: number;
  seconds: number;
}

const clockTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * What a clock in `timezone` reads at `instant`, straight from Intl. Without a
 * zone (or with one this runtime does not know) it reads the Date's own local
 * clock.
 *
 * Clocks read this, not the local getters of a shifted Date. A shifted Date is
 * rebuilt in the machine's own zone, so a household time inside the machine's
 * spring-forward gap came back an hour late: 02:30 in London on 2026-03-08
 * read as 3:30 on a Chicago laptop, because Chicago skips that hour that night.
 */
export function clockTimeInTZ(instant: Date, timezone?: string): ClockTime {
  if (timezone && !isNaN(instant.getTime())) {
    try {
      let formatter = clockTimeFormatters.get(timezone);
      if (!formatter) {
        // 'en-US' for ASCII digits: these parts are parsed, never shown.
        formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        });
        clockTimeFormatters.set(timezone, formatter);
      }
      const parts = formatter.formatToParts(instant);
      const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
      return { hours: get('hour') % 24, minutes: get('minute'), seconds: get('second') };
    } catch {
      // Unknown zone: read the Date's own clock below.
    }
  }
  return { hours: instant.getHours(), minutes: instant.getMinutes(), seconds: instant.getSeconds() };
}

/**
 * Turn a clock reading into display-ready values.
 */
export function parseClockTime(format24h: boolean, time: ClockTime): ParsedClockTime {
  const { hours, minutes, seconds } = time;

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
