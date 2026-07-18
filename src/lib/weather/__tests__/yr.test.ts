import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YrProvider, symbolToIcon, symbolDescription } from '../yr';

// Yr.no / MET Norway returns a single timeseries in SI units (°C, m/s, mm). The
// provider converts to the requested unit, maps symbol_code strings (e.g.
// "partlycloudy_night") to icons, and aggregates next_6_hours symbols into daily
// forecasts. Hourly is filtered to time >= now-1h; the provider also has a static
// 10-min cache that must be cleared between tests.

const NOW = Date.parse('2026-04-18T12:00:00Z');

function mockYr(timeseries: unknown[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ properties: { timeseries } }), { status: 200 }),
  );
}

function clearCache() {
  // @ts-expect-error - private static cache, intentionally reached in tests
  YrProvider.cache?.clear();
}

describe('symbolToIcon', () => {
  it('maps base symbols and swaps day/night variants', () => {
    expect(symbolToIcon('clearsky_day')).toBe('sun');
    expect(symbolToIcon('clearsky_night')).toBe('moon');
    expect(symbolToIcon('partlycloudy_day')).toBe('cloud-sun');
    expect(symbolToIcon('partlycloudy_night')).toBe('cloud-moon');
    expect(symbolToIcon('rain')).toBe('cloud-rain');
    expect(symbolToIcon('lightsnow')).toBe('snowflake');
    expect(symbolToIcon('heavyrainandthunder')).toBe('cloud-lightning');
  });

  it('falls back to thermometer for unknown or missing codes', () => {
    expect(symbolToIcon(undefined)).toBe('thermometer');
    expect(symbolToIcon('made_up')).toBe('thermometer');
  });
});

describe('symbolDescription', () => {
  it('humanizes compound symbol codes', () => {
    expect(symbolDescription('clearsky_day')).toBe('Clear sky');
    expect(symbolDescription('partlycloudy_night')).toBe('Partly cloudy');
    expect(symbolDescription('heavyrainshowersandthunder_day')).toBe('Heavy rain showers and thunder');
    expect(symbolDescription(undefined)).toBe('');
  });
});

describe('YrProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    clearCache();
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
    clearCache();
  });

  it('getHourly reads instant details and the next_1_hours symbol (metric passthrough)', async () => {
    spy = mockYr([
      {
        time: '2026-04-18T12:00:00Z',
        data: {
          instant: { details: { air_temperature: 11, relative_humidity: 62, wind_speed: 5, air_pressure_at_sea_level: 1012.6 } },
          next_1_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { probability_of_precipitation: 20 } },
        },
      },
    ]);

    const out = await new YrProvider().getHourly(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00Z',
      temp: 11,
      humidity: 62,
      icon: 'cloud-sun',
      description: 'Partly cloudy',
      windSpeed: 18, // round(5 m/s * 3.6)
      precipProbability: 20,
      pressure: 1013, // rounded
    });
  });

  it('getHourly converts temperature to °F and wind to mph in imperial', async () => {
    spy = mockYr([
      {
        time: '2026-04-18T12:00:00Z',
        data: {
          instant: { details: { air_temperature: 0, wind_speed: 10 } },
          next_1_hours: { summary: { symbol_code: 'clearsky_day' } },
        },
      },
    ]);
    const out = await new YrProvider().getHourly(44.71, -93.42, 'imperial');
    expect(out[0].temp).toBe(32); // 0°C
    expect(out[0].windSpeed).toBe(22); // round(10 m/s * 2.23694)
  });

  it('getHourly drops timeseries entries older than one hour', async () => {
    spy = mockYr([
      { time: '2026-04-18T09:00:00Z', data: { instant: { details: { air_temperature: 5 } } } },
      { time: '2026-04-18T12:00:00Z', data: { instant: { details: { air_temperature: 11 } }, next_1_hours: { summary: { symbol_code: 'clearsky_day' } } } },
    ]);
    const out = await new YrProvider().getHourly(44.71, -93.42, 'metric');
    expect(out).toHaveLength(1);
    expect(out[0].temp).toBe(11);
  });

  it('getForecast aggregates next_6_hours samples into a daily high/low and dominant symbol', async () => {
    spy = mockYr([
      {
        time: '2026-04-18T06:00:00Z',
        data: {
          instant: { details: { air_temperature: 6, relative_humidity: 70, wind_speed: 4 } },
          next_6_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { precipitation_amount: 0.5, probability_of_precipitation: 20 } },
        },
      },
      {
        time: '2026-04-18T12:00:00Z',
        data: {
          instant: { details: { air_temperature: 15, relative_humidity: 55, wind_speed: 6 } },
          next_6_hours: { summary: { symbol_code: 'partlycloudy_day' }, details: { precipitation_amount: 1.5, probability_of_precipitation: 40 } },
        },
      },
    ]);

    const out = await new YrProvider().getForecast(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 15,
      low: 6,
      icon: 'cloud-sun',
      description: 'Partly cloudy',
      precipProbability: 40, // max of the two
      precipAmount: 2, // 0.5 + 1.5 mm
    });
  });
});
