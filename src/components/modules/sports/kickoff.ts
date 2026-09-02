import { differenceInCalendarDays } from 'date-fns';
import { toTZWallTime } from '@/lib/timezone';
import type { TimeFormat } from '@/types/config';

export interface KickoffFormatOptions {
  /** Display wall clock (the shifted Date from `useTZClock`). */
  now: Date;
  timezone: string | undefined;
  locale: string;
  timeFormat: TimeFormat;
  today: string;
  tomorrow: string;
}

const SEPARATOR = ' · ';

/**
 * A scheduled game's kickoff in the display's own timezone and locale:
 * "Today · 7:20 PM", "Tomorrow · 7:20 PM", else "Sun, 9/13 · 12:00 PM".
 * No zone abbreviation: every other module shows local time, so this one
 * does too. Returns null for an unparseable instant so the caller can fall
 * back to ESPN's status word.
 */
export function formatKickoff(startTime: string, opts: KickoffFormatOptions): string | null {
  const instant = new Date(startTime);
  if (!startTime || Number.isNaN(instant.getTime())) return null;

  const timeZone = opts.timezone;
  const format = (options: Intl.DateTimeFormatOptions): string | null => {
    try {
      return new Intl.DateTimeFormat(opts.locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(instant);
    } catch {
      // An invalid timezone in settings must not blank the card.
      try {
        return new Intl.DateTimeFormat(opts.locale, options).format(instant);
      } catch {
        return null;
      }
    }
  };

  const time = format({ hour: 'numeric', minute: '2-digit', hourCycle: opts.timeFormat === '24h' ? 'h23' : 'h12' });
  if (!time) return null;

  // Both sides are wall-clock readings in the display timezone, so the
  // calendar-day difference is the one a person in that room would count.
  const dayDelta = differenceInCalendarDays(toTZWallTime(instant, timeZone), opts.now);
  const day = dayDelta === 0
    ? opts.today
    : dayDelta === 1
      ? opts.tomorrow
      : format({ weekday: 'short', month: 'numeric', day: 'numeric' });
  if (!day) return time;
  return `${day}${SEPARATOR}${time}`;
}
