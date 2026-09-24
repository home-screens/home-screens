import { describe, expect, it } from 'vitest';
import SunCalc from 'suncalc';
import { moonTimesForDay } from '../moon-times';
import { isoDateInTZ, parseDateInTZ } from '../timezone';

const PRIOR_LAKE = { lat: 44.7133, lon: -93.4227 };
const BERLIN = { lat: 52.52, lon: 13.405 };
const AUCKLAND = { lat: -36.8485, lon: 174.7633 };

/** Wall clock reading of an instant in a zone, "HH:MM". */
const wall = (d: Date | undefined, timeZone: string) =>
  d?.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * Independent reference: walk the household day a minute at a time and note
 * where the moon's altitude crosses SunCalc's horizon (0.133 degrees).
 */
function scanDay(dayISO: string, timeZone: string, lat: number, lon: number): { rise?: Date; set?: Date } {
  const start = parseDateInTZ(`${dayISO}T00:00:00`, timeZone).getTime();
  const hc = (0.133 * Math.PI) / 180;
  const alt = (ms: number) => SunCalc.getMoonPosition(new Date(ms), lat, lon).altitude - hc;
  const out: { rise?: Date; set?: Date } = {};
  let prev = alt(start);
  for (let ms = start + 60_000; isoDateInTZ(new Date(ms), timeZone) === dayISO; ms += 60_000) {
    const cur = alt(ms);
    if (prev < 0 && cur >= 0 && !out.rise) out.rise = new Date(ms);
    if (prev >= 0 && cur < 0 && !out.set) out.set = new Date(ms);
    prev = cur;
  }
  return out;
}

describe('moonTimesForDay', () => {
  it('shows tonight\'s rise, not tomorrow\'s, on a Chicago evening', () => {
    // Tuesday Sep 22, 8 PM in Chicago; the UTC calendar is already Wednesday.
    const now = new Date('2026-09-23T01:00:00Z');
    const times = moonTimesForDay(now, PRIOR_LAKE.lat, PRIOR_LAKE.lon, 'America/Chicago');
    expect(isoDateInTZ(times.rise!, 'America/Chicago')).toBe('2026-09-22');
    expect(isoDateInTZ(times.set!, 'America/Chicago')).toBe('2026-09-22');
    expect(wall(times.rise, 'America/Chicago')).toBe('17:27');
    expect(wall(times.set, 'America/Chicago')).toBe('02:24');
  });

  it('gives the same answer at any hour of the household day', () => {
    const tz = 'America/Chicago';
    const morning = moonTimesForDay(new Date('2026-09-22T06:00:00Z'), PRIOR_LAKE.lat, PRIOR_LAKE.lon, tz); // 1 AM
    const evening = moonTimesForDay(new Date('2026-09-23T04:59:00Z'), PRIOR_LAKE.lat, PRIOR_LAKE.lon, tz); // 11:59 PM
    expect(morning).toEqual(evening);
  });

  it.each([
    ['Europe/Berlin', BERLIN, new Date('2026-09-22T23:30:00Z')], // 1:30 AM Wednesday
    ['Pacific/Auckland', AUCKLAND, new Date('2026-09-22T11:00:00Z')], // 11 PM Tuesday
    ['America/Chicago', PRIOR_LAKE, new Date('2026-11-01T12:00:00Z')], // clock-change day
  ])('matches a minute-by-minute scan of the %s day', (tz, place, now) => {
    const times = moonTimesForDay(now, place.lat, place.lon, tz);
    const ref = scanDay(isoDateInTZ(now, tz), tz, place.lat, place.lon);
    for (const key of ['rise', 'set'] as const) {
      if (!ref[key]) {
        expect(times[key]).toBeUndefined();
        continue;
      }
      expect(Math.abs(times[key]!.getTime() - ref[key]!.getTime())).toBeLessThan(3 * 60_000);
    }
  });

  it('leaves out a rise that does not happen that day', () => {
    // Find a Chicago day with no moonrise (one comes about once a month).
    const tz = 'America/Chicago';
    let day = new Date('2026-09-01T17:00:00Z');
    let ref = scanDay(isoDateInTZ(day, tz), tz, PRIOR_LAKE.lat, PRIOR_LAKE.lon);
    for (let i = 0; i < 31 && ref.rise; i++) {
      day = new Date(day.getTime() + 86_400_000);
      ref = scanDay(isoDateInTZ(day, tz), tz, PRIOR_LAKE.lat, PRIOR_LAKE.lon);
    }
    expect(ref.rise).toBeUndefined();
    expect(moonTimesForDay(day, PRIOR_LAKE.lat, PRIOR_LAKE.lon, tz).rise).toBeUndefined();
  });
});
