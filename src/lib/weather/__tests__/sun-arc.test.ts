import { describe, it, expect } from 'vitest';
import { dayLengthText, shortUnitParts, sunArcModel } from '../sun-arc';
import type { SunTimes } from '../sun-times';

const HOUR = 3_600_000;
const day = (extra: Partial<SunTimes> = {}): SunTimes => ({
  sunrise: new Date('2026-06-01T11:00:00Z'), sunset: new Date('2026-06-02T01:00:00Z'),
  sunriseHour: 6, sunsetHour: 20, isNight: false, dayLengthMs: 14 * HOUR, ...extra,
});

describe('sunArcModel', () => {
  it('places the sun between sunrise and sunset', () => {
    expect(sunArcModel(day(), 13)).toMatchObject({ hasArc: true, showSun: true, progress: 0.5, polar: null });
  });

  it('takes the sun away at night rather than parking it on the horizon', () => {
    expect(sunArcModel(day({ isNight: true }), 22)).toMatchObject({ hasArc: true, showSun: false, progress: 1 });
    expect(sunArcModel(day({ isNight: true }), 3)).toMatchObject({ showSun: false, progress: 0 });
  });

  it('never rounds the minutes up to sixty', () => {
    // 11 h 59.6 min used to read "11h 60m" where the minutes were rounded.
    expect(sunArcModel(day({ dayLengthMs: 11 * HOUR + 59.6 * 60_000 }), 13).dayLength).toEqual({ hours: 11, minutes: 59 });
  });

  it('names the polar day and the polar night', () => {
    const noArc = { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24 };
    expect(sunArcModel(day({ ...noArc, isNight: false, dayLengthMs: 24 * HOUR }), 13)).toMatchObject({ hasArc: false, showSun: false, polar: 'day' });
    expect(sunArcModel(day({ ...noArc, isNight: true, dayLengthMs: 0 }), 13)).toMatchObject({ hasArc: false, showSun: false, polar: 'night' });
  });
});

describe('shortUnitParts', () => {
  it('keeps the number and its unit apart, in the formatting language', () => {
    expect(shortUnitParts(9, 'hour', 'en-US')).toEqual({ value: '9', unit: 'h' });
    expect(shortUnitParts(14, 'minute', 'en-US')).toEqual({ value: '14', unit: 'm' });
    expect(shortUnitParts(9, 'hour', 'nl-NL')).toEqual({ value: '9', unit: 'u' });
    expect(shortUnitParts(14, 'minute', 'de-DE')).toEqual({ value: '14', unit: 'Min.' });
  });
});

describe('dayLengthText', () => {
  it('reads as before in English and in its own words elsewhere', () => {
    expect(dayLengthText({ hours: 15, minutes: 0 }, 'en-US')).toBe('15h 0m');
    expect(dayLengthText({ hours: 15, minutes: 0 }, 'nl-NL')).toMatch(/^15\su 0\sm$/);
  });
});
