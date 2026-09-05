import { describe, it, expect } from 'vitest';
import { deriveWeatherConditions, deriveWeatherAlerts, reconcileTodayRange } from '../derive';
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

describe('reconcileTodayRange', () => {
  const day = (high: number, low: number) => ({ date: '2026-09-04', high, low, icon: 'clear-day', description: 'Clear' });
  const now = (temp: number) => ({ time: '2026-09-04T19:00:00', temp, icon: 'clear-night', description: 'Clear' });

  it('raises a post-sunset "tonight" range to the current temperature', () => {
    // NOAA and Environment Canada report the night's low as both numbers.
    const out = reconcileTodayRange([day(66, 66), day(82, 61)], [now(80)]);
    expect(out[0]).toMatchObject({ high: 80, low: 66 });
    expect(out[1]).toMatchObject({ high: 82, low: 61 });
  });

  it('lowers the low when it is colder now than the model expected', () => {
    expect(reconcileTodayRange([day(70, 50)], [now(45)])[0]).toMatchObject({ high: 70, low: 45 });
  });

  it('returns the same array when the range already holds the current reading', () => {
    const forecast = [day(78, 61)];
    expect(reconcileTodayRange(forecast, [now(72)])).toBe(forecast);
  });

  it('widens the range to what the hub recorded earlier today', () => {
    // By evening the afternoon's 86° is gone from the feed; the record still has it.
    const out = reconcileTodayRange([day(66, 66)], [now(80)], { date: '2026-09-04', high: 86, low: 58 });
    expect(out[0]).toMatchObject({ high: 86, low: 58 });
  });

  it('ignores a record from another day', () => {
    // The provider rolled over to a new day since the last poll: yesterday's peak is not today's.
    const out = reconcileTodayRange([day(66, 66)], [now(80)], { date: '2026-09-03', high: 96, low: 40 });
    expect(out[0]).toMatchObject({ high: 80, low: 66 });
  });

  it('leaves the forecast alone without a current reading', () => {
    const forecast = [day(66, 66)];
    expect(reconcileTodayRange(forecast, [])).toBe(forecast);
    expect(reconcileTodayRange([], [now(80)])).toEqual([]);
  });
});
