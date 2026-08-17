import { describe, expect, it } from 'vitest';
import SunCalc from 'suncalc';
import {
  astroDarkWindow,
  circleAngle,
  circleArcPath,
  circlePoint,
  hoursInTZ,
} from '../sun-astro';

const FRANKFURT = { lat: 50.1109, lon: 8.6821 };
const COPENHAGEN = { lat: 55.676, lon: 12.568 };

describe('astroDarkWindow', () => {
  it('returns tonight’s window pairing today’s night with next day’s nightEnd', () => {
    const times = SunCalc.getTimes(new Date('2026-08-16T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const next = SunCalc.getTimes(new Date('2026-08-17T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const w = astroDarkWindow(times, next);
    expect(w).not.toBeNull();
    // ~5h05m dark that night (computed with suncalc; sanity band, not exact ms)
    expect(w!.lengthMs).toBeGreaterThan(4.5 * 3600_000);
    expect(w!.lengthMs).toBeLessThan(5.5 * 3600_000);
    expect(w!.begins.getTime()).toBe(times.night.getTime());
    expect(w!.ends.getTime()).toBe(next.nightEnd.getTime());
    expect(w!.ends.getTime()).toBeGreaterThan(w!.begins.getTime());
  });

  it('handles a dark window that begins after midnight', () => {
    const times = SunCalc.getTimes(new Date('2026-07-25T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const next = SunCalc.getTimes(new Date('2026-07-26T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const w = astroDarkWindow(times, next);
    expect(w).not.toBeNull();
    // dark 12:13 AM → 2:56 AM, ~2h43m
    expect(w!.lengthMs).toBeGreaterThan(2 * 3600_000);
    expect(w!.lengthMs).toBeLessThan(3 * 3600_000);
  });

  it('returns null when there is no astrodark (high-latitude summer)', () => {
    const times = SunCalc.getTimes(new Date('2026-06-21T10:00:00Z'), COPENHAGEN.lat, COPENHAGEN.lon);
    const next = SunCalc.getTimes(new Date('2026-06-22T10:00:00Z'), COPENHAGEN.lat, COPENHAGEN.lon);
    expect(astroDarkWindow(times, next)).toBeNull();
  });
});

describe('circle geometry (250×250 viewBox, center 125,125)', () => {
  it('maps clock hours clockwise from top: noon top, midnight bottom, 06:00 left, 18:00 right', () => {
    expect(circleAngle(12)).toBeCloseTo(0);
    expect(circleAngle(18)).toBeCloseTo(90);
    expect(circleAngle(0)).toBeCloseTo(180);
    expect(circleAngle(6)).toBeCloseTo(270);
    expect(circleAngle(24)).toBeCloseTo(180); // wraps
    expect(circleAngle(28.5)).toBeCloseTo(247.5); // post-midnight wrap (4:30 AM next day)
  });

  it('places points at the cardinal spots for r=82', () => {
    expect(circlePoint(0, 82)).toEqual([125, 43]);
    expect(circlePoint(90, 82)).toEqual([207, 125]);
    expect(circlePoint(180, 82)).toEqual([125, 207]);
    expect(circlePoint(270, 82)).toEqual([43, 125]);
  });

  it('builds arc paths with the right large-arc flag', () => {
    // Frankfurt Aug 16 daylight spans ~217° → large arc
    const sr = hoursInTZ(new Date('2026-08-16T04:17:00Z'), 'Europe/Berlin'); // 06:17
    const ss = hoursInTZ(new Date('2026-08-16T18:44:00Z'), 'Europe/Berlin'); // 20:44
    expect(circleArcPath(sr, ss, 82)).toBe('M 43.2 118.9 A 82 82 0 1 1 186.9 178.8');
    // a short twilight arc (sunset → dark begins) → small arc
    const db = hoursInTZ(new Date('2026-08-16T20:59:00Z'), 'Europe/Berlin'); // 22:59
    expect(circleArcPath(ss, db, 82)).toBe('M 186.9 178.8 A 82 82 0 0 1 146.6 204.1');
  });
});

describe('hoursInTZ', () => {
  it('converts an instant to decimal local hours', () => {
    expect(hoursInTZ(new Date('2026-08-16T13:00:00Z'), 'Europe/Berlin')).toBeCloseTo(15);
    expect(hoursInTZ(new Date('2026-08-16T13:00:00Z'), 'UTC')).toBeCloseTo(13);
  });
});
