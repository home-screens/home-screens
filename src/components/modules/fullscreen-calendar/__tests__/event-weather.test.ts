import { describe, it, expect } from 'vitest';
import { buildHourlyIndex, hourlyForTime, dailyForDay, weatherForEvent } from '../event-weather';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';

function hour(time: string, temp: number, extra: Partial<HourlyWeather> = {}): HourlyWeather {
  return { time, temp, icon: 'sun', description: 'Clear', ...extra };
}

const HOURLY: HourlyWeather[] = [
  hour('2026-08-19T15:00:00Z', 70),
  hour('2026-08-19T16:00:00Z', 72),
  hour('2026-08-19T17:00:00Z', 74, { description: 'Rain' }),
];

const FORECAST: ForecastDay[] = [
  { date: '2026-08-19', high: 78, low: 61, icon: 'sun', description: 'Sunny' },
  { date: '2026-08-22', high: 81, low: 62, icon: 'sun', description: 'Hot' },
];

describe('buildHourlyIndex / hourlyForTime', () => {
  it('resolves the entry nearest the requested time', () => {
    const index = buildHourlyIndex(HOURLY);
    expect(hourlyForTime(index, new Date('2026-08-19T17:10:00Z'))?.temp).toBe(74);
    expect(hourlyForTime(index, new Date('2026-08-19T15:25:00Z'))?.temp).toBe(70);
  });

  it('returns null beyond the 90-minute horizon', () => {
    const index = buildHourlyIndex(HOURLY);
    expect(hourlyForTime(index, new Date('2026-08-19T19:00:00Z'))).toBeNull();
    expect(hourlyForTime(index, new Date('2026-08-20T12:00:00Z'))).toBeNull();
  });

  it('prefers timeEpoch over the time string when present', () => {
    // WeatherAPI's `time` is a zone-less location-local wall time; parsing
    // it shifts by the OS↔location offset. timeEpoch is the real instant.
    const entry = hour('2026-08-19 10:00', 68, {
      timeEpoch: Date.parse('2026-08-19T16:00:00Z') / 1000,
    });
    const index = buildHourlyIndex([entry]);
    expect(hourlyForTime(index, new Date('2026-08-19T16:05:00Z'))?.temp).toBe(68);
  });

  it('skips unparseable entries instead of throwing', () => {
    const index = buildHourlyIndex([hour('not a date', 50), ...HOURLY]);
    expect(hourlyForTime(index, new Date('2026-08-19T16:00:00Z'))?.temp).toBe(72);
  });

  it('handles an empty or missing hourly list', () => {
    expect(hourlyForTime(buildHourlyIndex([]), new Date())).toBeNull();
    expect(hourlyForTime(buildHourlyIndex(undefined), new Date())).toBeNull();
  });
});

describe('dailyForDay', () => {
  it('matches the forecast entry for the local day', () => {
    expect(dailyForDay(FORECAST, new Date(2026, 7, 19, 15, 0))?.high).toBe(78);
    expect(dailyForDay(FORECAST, new Date(2026, 7, 22))?.high).toBe(81);
  });

  it('returns null for uncovered days and empty forecasts', () => {
    expect(dailyForDay(FORECAST, new Date(2026, 7, 20))).toBeNull();
    expect(dailyForDay([], new Date(2026, 7, 19))).toBeNull();
    expect(dailyForDay(undefined, new Date(2026, 7, 19))).toBeNull();
  });
});

describe('weatherForEvent', () => {
  const index = buildHourlyIndex(HOURLY);

  it('uses the hourly entry inside the horizon', () => {
    const wx = weatherForEvent(index, FORECAST, new Date('2026-08-19T17:00:00Z'));
    expect(wx).toEqual({ temp: 74, icon: 'sun', description: 'Rain' });
  });

  it('falls back to the daily forecast past the hourly horizon', () => {
    // The 22nd has no hourly data — a gap would read as "no weather worth
    // mentioning", so the daily high must stand in.
    const wx = weatherForEvent(index, FORECAST, new Date(2026, 7, 22, 11, 0));
    expect(wx).toEqual({ temp: 81, icon: 'sun', description: 'Hot' });
  });

  it('returns null when neither source covers the start', () => {
    expect(weatherForEvent(index, FORECAST, new Date(2026, 7, 25, 11, 0))).toBeNull();
  });
});
