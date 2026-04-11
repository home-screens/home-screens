import { describe, it, expect } from 'vitest';
import { deriveWeatherConditions, deriveWeatherAlerts } from '../derive';
import type { HourlyWeather, WeatherAlert } from '../types';

describe('deriveWeatherConditions', () => {
  function makeHourly(overrides: Partial<HourlyWeather> = {}): HourlyWeather {
    return {
      time: '2026-04-10T08:00:00',
      temp: 62,
      icon: '10d',
      description: 'Light rain',
      ...overrides,
    };
  }

  it('returns null for empty hourly array', () => {
    expect(deriveWeatherConditions([], 'imperial')).toBeNull();
  });

  it('derives condition from first hourly entry', () => {
    const result = deriveWeatherConditions([makeHourly()], 'imperial');
    expect(result).toEqual(expect.objectContaining({
      condition: 'rain',
      temp: 62,
      units: 'imperial',
      summary: 'Light rain',
    }));
  });

  it('maps thunderstorm descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Thunderstorm with heavy rain' })],
      'metric',
    );
    expect(result?.condition).toBe('thunderstorm');
  });

  it('maps "snowstorm" to snow, not thunderstorm', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Heavy Snowstorm' })],
      'imperial',
    );
    expect(result?.condition).toBe('snow');
  });

  it('maps drizzle descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Light drizzle' })],
      'imperial',
    );
    expect(result?.condition).toBe('drizzle');
  });

  it('maps snow descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Heavy snow' })],
      'metric',
    );
    expect(result?.condition).toBe('snow');
  });

  it('maps fog/mist descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Mist' })],
      'imperial',
    );
    expect(result?.condition).toBe('fog');
  });

  it('maps cloudy descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Overcast clouds' })],
      'imperial',
    );
    expect(result?.condition).toBe('clouds');
  });

  it('defaults to clear for unrecognized descriptions', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ description: 'Fair' })],
      'imperial',
    );
    expect(result?.condition).toBe('clear');
  });

  it('includes optional humidity and feelsLike', () => {
    const result = deriveWeatherConditions(
      [makeHourly({ humidity: 80, feelsLike: 58 })],
      'imperial',
    );
    expect(result?.humidity).toBe(80);
    expect(result?.feelsLike).toBe(58);
  });
});

describe('deriveWeatherAlerts', () => {
  it('returns null for undefined alerts', () => {
    expect(deriveWeatherAlerts(undefined)).toBeNull();
  });

  it('returns null for empty alerts array', () => {
    expect(deriveWeatherAlerts([])).toBeNull();
  });

  it('maps alerts with severity normalization', () => {
    const alerts: WeatherAlert[] = [
      {
        title: 'Winter Storm Warning',
        severity: 'Severe',
        description: 'Heavy snow expected',
        expires: 1712800000000,
      },
      {
        title: 'Wind Advisory',
        severity: 'Minor',
        description: 'Gusty winds',
        expires: 1712750000000,
      },
    ];
    const result = deriveWeatherAlerts(alerts);
    expect(result).not.toBeNull();
    expect(result!.alerts).toHaveLength(2);
    expect(result!.alerts[0]).toEqual(expect.objectContaining({
      headline: 'Winter Storm Warning',
      severity: 'severe',
      event: 'Winter Storm Warning',
    }));
    expect(result!.alerts[1].severity).toBe('minor');
  });

  it('handles alerts without expires', () => {
    const alerts: WeatherAlert[] = [
      {
        title: 'Heat Advisory',
        severity: 'Moderate',
        description: 'Hot',
        expires: 0,
      },
    ];
    const result = deriveWeatherAlerts(alerts);
    expect(result!.alerts[0].severity).toBe('moderate');
  });
});
