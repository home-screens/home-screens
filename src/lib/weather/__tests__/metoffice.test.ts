import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetOfficeProvider, weatherCodeToIcon, weatherCodeDescription } from '../metoffice';

// UK Met Office Weather DataHub returns SI units (°C, m/s, Pa, mm). The provider
// hits separate hourly and daily endpoints, converts units, maps significant
// weather codes (which self-encode day/night) to icons, and — for daily — merges
// hourly wind/precip in by date. Static caches must be cleared between tests.

const NOW = Date.parse('2026-04-18T12:00:00Z');

function feature(timeSeries: unknown[]) {
  return { features: [{ properties: { timeSeries } }] };
}

function mockMet(bodies: { hourly?: unknown[]; daily?: unknown[] }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const series = url.includes('/daily') ? (bodies.daily ?? []) : (bodies.hourly ?? []);
    return new Response(JSON.stringify(feature(series)), { status: 200 });
  });
}

function clearCaches() {
  // @ts-expect-error - private static cache, intentionally reached in tests
  MetOfficeProvider.cache?.clear();
  // @ts-expect-error - private static inFlight map, intentionally reached in tests
  MetOfficeProvider.inFlight?.clear();
}

describe('weatherCodeToIcon / weatherCodeDescription', () => {
  it('maps self-encoded day/night codes', () => {
    expect(weatherCodeToIcon(1)).toBe('sun'); // Sunny day
    expect(weatherCodeToIcon(0)).toBe('moon'); // Clear night
    expect(weatherCodeToIcon(3)).toBe('cloud-sun'); // Partly cloudy day
    expect(weatherCodeToIcon(2)).toBe('cloud-moon'); // Partly cloudy night
    expect(weatherCodeToIcon(15)).toBe('cloud-rain');
    expect(weatherCodeToIcon(27)).toBe('snowflake');
    expect(weatherCodeToIcon(30)).toBe('cloud-lightning');
  });

  it('falls back for missing or unknown codes', () => {
    expect(weatherCodeToIcon(undefined)).toBe('thermometer');
    expect(weatherCodeToIcon(-1)).toBe('thermometer');
    expect(weatherCodeToIcon(999)).toBe('thermometer');
    expect(weatherCodeDescription(1)).toBe('Sunny');
    expect(weatherCodeDescription(undefined)).toBe('');
  });
});

describe('MetOfficeProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    clearCaches();
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
    clearCaches();
  });

  it('throws when constructed without an API key', () => {
    expect(() => new MetOfficeProvider()).toThrow(/API key/i);
  });

  it('getHourly converts units, maps the code icon, and derives hPa from Pascals', async () => {
    spy = mockMet({
      hourly: [
        {
          time: '2026-04-18T12:00:00Z',
          screenTemperature: 12,
          feelsLikeTemperature: 10,
          screenDewPointTemperature: 5,
          screenRelativeHumidity: 60,
          windSpeed10m: 5, // m/s
          mslp: 101200, // Pa
          significantWeatherCode: 3, // partly cloudy day
          probOfPrecipitation: 20,
        },
      ],
    });

    const out = await new MetOfficeProvider('key').getHourly(51.5, -0.12, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00Z',
      temp: 12,
      feelsLike: 10,
      humidity: 60,
      icon: 'cloud-sun', // code 3
      description: 'Partly cloudy',
      windSpeed: 18, // round(5 * 3.6)
      precipProbability: 20,
      pressure: 1012, // 101200 Pa → hPa
      dewPoint: 5,
    });
  });

  it('getHourly converts temperature to °F and wind to mph in imperial', async () => {
    spy = mockMet({
      hourly: [
        { time: '2026-04-18T12:00:00Z', screenTemperature: 0, windSpeed10m: 10, significantWeatherCode: 1 },
      ],
    });
    const out = await new MetOfficeProvider('key').getHourly(51.5, -0.12, 'imperial');
    expect(out[0].temp).toBe(32);
    expect(out[0].windSpeed).toBe(22); // round(10 * 2.23694)
  });

  it('getHourly returns [] when no features are present', async () => {
    spy = mockMet({ hourly: [] });
    // Override to return an empty features array
    spy.mockImplementation(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    const out = await new MetOfficeProvider('key').getHourly(51.5, -0.12, 'metric');
    expect(out).toEqual([]);
  });

  it('getForecast splits day/night temps and merges hourly wind/precip by date', async () => {
    spy = mockMet({
      daily: [
        {
          time: '2026-04-18T00:00:00Z',
          dayMaxScreenTemperature: 16,
          nightMinScreenTemperature: 6,
          daySignificantWeatherCode: 15, // heavy rain
          nightSignificantWeatherCode: 7,
          dayProbabilityOfPrecipitation: 70,
          nightProbabilityOfPrecipitation: 40,
          screenRelativeHumidity: 65,
        },
      ],
      hourly: [
        { time: '2026-04-18T09:00:00Z', windSpeed10m: 4, totalPrecipAmount: 1.2 },
        { time: '2026-04-18T12:00:00Z', windSpeed10m: 6, totalPrecipAmount: 0.8 },
      ],
    });

    const out = await new MetOfficeProvider('key').getForecast(51.5, -0.12, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 16,
      low: 6,
      icon: 'cloud-rain', // day code 15
      description: 'Heavy rain',
      precipProbability: 70, // max(70, 40)
      humidity: 65,
      windSpeed: 18, // round(avg(4, 6) m/s * 3.6)
      precipAmount: 2, // 1.2 + 0.8 mm
    });
  });

  it('getForecast falls back to the night weather code when the day code is absent', async () => {
    spy = mockMet({
      daily: [
        {
          time: '2026-04-18T00:00:00Z',
          dayMaxScreenTemperature: 10,
          nightMinScreenTemperature: 2,
          nightSignificantWeatherCode: 27, // heavy snow
          nightProbabilityOfPrecipitation: 55,
        },
      ],
      hourly: [],
    });

    const out = await new MetOfficeProvider('key').getForecast(51.5, -0.12, 'metric');
    expect(out[0].icon).toBe('snowflake'); // night code 27
    expect(out[0].precipProbability).toBe(55);
  });
});
