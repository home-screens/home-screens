/**
 * Moonrise and moonset for the household's calendar day.
 *
 * `SunCalc.getMoonTimes` searches the 24 hours after midnight of the day it is
 * handed, and it finds that midnight with the machine's own clock (or UTC).
 * On a Pi left on UTC showing a Chicago household, that window ran from 7 PM
 * yesterday to 7 PM today: tonight's 9 PM moonrise was never found and
 * yesterday's was shown instead. Here the window is the household's own day.
 */
import SunCalc from 'suncalc';
import { isoDateInTZ, parseDateInTZ } from './timezone';

export interface MoonTimes {
  rise?: Date;
  set?: Date;
}

const HOUR_MS = 3_600_000;

/** The real instant a household day starts, midnight on its wall clock. */
function householdMidnight(instant: Date, timezone: string | undefined): Date {
  return parseDateInTZ(`${isoDateInTZ(instant, timezone)}T00:00:00`, timezone);
}

/**
 * The first rise and first set that fall on the household day containing
 * `now`. Either is absent on days the moon does not cross the horizon (about
 * once a month for each, and for weeks near the poles).
 */
export function moonTimesForDay(now: Date, latitude: number, longitude: number, timezone?: string): MoonTimes {
  const start = householdMidnight(now, timezone);
  // Next midnight, found from a point well inside tomorrow, so a 23 or 25 hour
  // day around a clock change still ends at the right instant.
  const end = householdMidnight(new Date(start.getTime() + 36 * HOUR_MS), timezone);

  // Each UTC day holds at most one rise and one set (the moon's day is about
  // 24h50m), so the UTC days the household day overlaps cover every candidate.
  // UTC rather than the machine's zone keeps the search the same on any Pi.
  const candidates: MoonTimes[] = [];
  for (let day = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()); day < end.getTime(); day += 24 * HOUR_MS) {
    candidates.push(SunCalc.getMoonTimes(new Date(day), latitude, longitude, true));
  }

  const within = (d: Date | undefined): d is Date =>
    !!d && !Number.isNaN(d.getTime()) && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  const first = (key: 'rise' | 'set') =>
    candidates
      .map((c) => c[key])
      .filter(within)
      .sort((a, b) => a.getTime() - b.getTime())[0];

  const result: MoonTimes = {};
  const rise = first('rise');
  const set = first('set');
  if (rise) result.rise = rise;
  if (set) result.set = set;
  return result;
}
