import { describe, it, expect } from 'vitest';
import type { HourlyWeather, MinutelyPrecip } from '@/lib/weather';
import { nowcastVerdict, hoursWithin, hourLabel, isNightHour, type SunTimes } from '../weather-view-utils';

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

function minutes(intensities: number[]): MinutelyPrecip[] {
  return intensities.map((intensity, i) => ({ time: i * 60, intensity, probability: intensity > 0 ? 80 : 0 }));
}

describe('nowcastVerdict', () => {
  it('returns null with no minutely data, which hides the strip', () => {
    expect(nowcastVerdict([], 'imperial', t)).toBeNull();
  });

  it('normalises intensity against the unit the provider reports in', () => {
    // 0.5 mm/h is a light drizzle in metric and would saturate the bar if the
    // imperial threshold (0.4 in/h) were applied to it.
    const drizzle = minutes(Array(60).fill(0.5));
    const metric = nowcastVerdict(drizzle, 'metric', t)!;
    const imperial = nowcastVerdict(drizzle, 'imperial', t)!;
    expect(metric.series[0]).toBeCloseTo(0.05, 5);
    expect(imperial.series[0]).toBe(1);
  });

  it('caps the bar at a downpour in either unit', () => {
    expect(nowcastVerdict(minutes([25]), 'metric', t)!.series[0]).toBe(1);
    expect(nowcastVerdict(minutes([1]), 'imperial', t)!.series[0]).toBe(1);
  });

  it('says when rain starts and when it eases off', () => {
    const startsLater = minutes([...Array(20).fill(0), ...Array(40).fill(0.2)]);
    expect(nowcastVerdict(startsLater, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.startsIn:{"minutes":20}');

    const easesOff = minutes([...Array(15).fill(0.2), ...Array(45).fill(0)]);
    expect(nowcastVerdict(easesOff, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.stopsIn:{"minutes":15}');

    const allHour = minutes(Array(60).fill(0.2));
    expect(nowcastVerdict(allHour, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.continues');

    expect(nowcastVerdict(minutes(Array(60).fill(0)), 'metric', t)!.text).toBe('fullscreen-weather.nowcast.dry');
  });
});

function hourlyAt(stepHours: number, count: number): HourlyWeather[] {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(base + i * stepHours * 3600_000).toISOString(),
    temp: 50, feelsLike: 50, humidity: 50, icon: 'sun', description: '', windSpeed: 0, precipProbability: 0,
  }));
}

describe('hoursWithin', () => {
  it('takes twelve entries from an hourly source', () => {
    expect(hoursWithin(hourlyAt(1, 48), 12)).toHaveLength(12);
  });

  it('takes only the entries inside the window from a 3-hourly source', () => {
    // 0h, 3h, 6h, 9h fall inside [0h, 12h); 12h does not.
    expect(hoursWithin(hourlyAt(3, 40), 12)).toHaveLength(4);
  });

  it('prefers timeEpoch over the wall-clock string when present', () => {
    const rows = hourlyAt(1, 5).map((h, i) => ({ ...h, time: 'not a date', timeEpoch: 1_700_000_000 + i * 3600 }));
    expect(hoursWithin(rows, 3)).toHaveLength(3);
  });

  it('is empty for an empty source', () => {
    expect(hoursWithin([], 12)).toEqual([]);
  });
});

describe('hourLabel', () => {
  it('formats 12-hour labels compactly', () => {
    expect(hourLabel(0)).toBe('12a');
    expect(hourLabel(9)).toBe('9a');
    expect(hourLabel(12)).toBe('12p');
    expect(hourLabel(13)).toBe('1p');
  });

  it('follows the household 24-hour setting', () => {
    expect(hourLabel(0, '24h')).toBe('00');
    expect(hourLabel(13, '24h')).toBe('13');
  });
});

describe('isNightHour', () => {
  const day = (sunriseHour: number, sunsetHour: number): SunTimes => ({
    sunrise: new Date(), sunset: new Date(), sunriseHour, sunsetHour, isNight: false, dayLengthMs: 1,
  });

  it('marks hours outside the daylight window as night', () => {
    const sun = day(6.5, 20);
    expect(isNightHour(3, sun)).toBe(true);
    expect(isNightHour(6.5, sun)).toBe(false);
    expect(isNightHour(19.9, sun)).toBe(false);
    expect(isNightHour(20, sun)).toBe(true);
  });

  it('holds the whole day when the sun never crosses the horizon', () => {
    const polarNight: SunTimes = { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: true, dayLengthMs: 0 };
    const polarDay: SunTimes = { ...polarNight, isNight: false, dayLengthMs: 86_400_000 };
    expect(isNightHour(12, polarNight)).toBe(true);
    expect(isNightHour(0, polarDay)).toBe(false);
  });
});
