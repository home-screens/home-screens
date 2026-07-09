import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PirateWeatherProvider } from '../pirateweather';

// Pirate Weather returns humidity/precipProbability as 0–1 fractions (scaled to
// percentages by the provider) and a single payload covering currently/hourly/
// daily/minutely/alerts. Each provider instance caches its first fetch, so use a
// fresh instance per test. Hourly is filtered to time >= now-1h; pin Date.now.

const NOW = Date.parse('2026-04-18T12:00:00Z');
const NOW_EPOCH = Math.floor(NOW / 1000);

function mockPw(body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
}

describe('PirateWeatherProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
  });

  it('throws when constructed without an API key', () => {
    expect(() => new PirateWeatherProvider()).toThrow(/API key is not configured/i);
  });

  it('getHourly scales fractional humidity/precip and maps the icon slug', async () => {
    spy = mockPw({
      hourly: {
        data: [
          {
            time: NOW_EPOCH,
            summary: 'Rain',
            icon: 'rain',
            temperature: 9,
            apparentTemperature: 7,
            humidity: 0.82,
            windSpeed: 5.5,
            precipProbability: 0.4,
          },
        ],
      },
    });

    const out = await new PirateWeatherProvider('key').getHourly(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00.000Z',
      temp: 9,
      feelsLike: 7,
      humidity: 82, // 0.82 * 100
      icon: 'cloud-rain',
      description: 'Rain',
      windSpeed: 5.5,
      precipProbability: 40, // 0.4 * 100
    });
  });

  it('getHourly returns [] when the hourly block is absent', async () => {
    spy = mockPw({ currently: { time: NOW_EPOCH } });
    const out = await new PirateWeatherProvider('key').getHourly(44.71, -93.42, 'metric');
    expect(out).toEqual([]);
  });

  it('getForecast maps daily highs/lows and clear-day → sun', async () => {
    spy = mockPw({
      daily: {
        data: [
          {
            time: NOW_EPOCH,
            summary: 'Clear',
            icon: 'clear-day',
            temperatureHigh: 15.4,
            temperatureLow: 4.6,
            precipProbability: 0.1,
            precipAccumulation: 0,
            humidity: 0.55,
            windSpeed: 3.2,
          },
        ],
      },
    });

    const out = await new PirateWeatherProvider('key').getForecast(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 15, // rounded
      low: 5, // rounded
      icon: 'sun',
      description: 'Clear',
      precipProbability: 10,
      humidity: 55,
      windSpeed: 3, // rounded
    });
  });

  it('getMinutely maps precip intensity/probability, defaulting missing values', async () => {
    spy = mockPw({
      minutely: {
        data: [
          { time: NOW_EPOCH, precipIntensity: 0.5, precipProbability: 0.9, precipType: 'rain' },
          { time: NOW_EPOCH + 60 }, // sparse entry
        ],
      },
    });

    const out = await new PirateWeatherProvider('key').getMinutely(44.71, -93.42, 'metric');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ time: NOW_EPOCH, intensity: 0.5, probability: 90, type: 'rain' });
    expect(out[1]).toMatchObject({ time: NOW_EPOCH + 60, intensity: 0, probability: 0 });
  });

  it('getAlerts normalizes unknown severities to "Unknown"', async () => {
    spy = mockPw({
      alerts: [
        { title: 'Flood Warning', severity: 'Severe', description: 'Rising water', expires: NOW_EPOCH + 3600, uri: 'https://x' },
        { title: 'Advisory', severity: 'bogus', description: 'n/a', expires: NOW_EPOCH + 7200 },
      ],
    });

    const out = await new PirateWeatherProvider('key').getAlerts(44.71, -93.42, 'metric');

    expect(out[0]).toMatchObject({ title: 'Flood Warning', severity: 'Severe', uri: 'https://x' });
    expect(out[1].severity).toBe('Unknown');
  });

  it('getAlerts returns [] when no alerts array is present', async () => {
    spy = mockPw({ currently: { time: NOW_EPOCH } });
    const out = await new PirateWeatherProvider('key').getAlerts(44.71, -93.42, 'metric');
    expect(out).toEqual([]);
  });

  it('requests US units for imperial', async () => {
    spy = mockPw({ daily: { data: [] } });
    await new PirateWeatherProvider('key').getForecast(44.71, -93.42, 'imperial');
    const calledUrl = (spy.mock.calls[0][0] as string).toString();
    expect(calledUrl).toContain('units=us');
  });
});
