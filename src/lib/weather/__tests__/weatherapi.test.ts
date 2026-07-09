import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherAPIProvider } from '../weatherapi';

// WeatherAPI returns temps/wind in both C/F and kph/mph in a single payload;
// the provider selects by unit. Hourly entries are filtered to time_epoch >= now,
// so pin `Date.now` and place fixtures at/after it.

const NOW = Date.parse('2026-04-18T12:00:00Z');
const NOW_EPOCH = Math.floor(NOW / 1000);

function mockWa(body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
}

function waHour(overrides: Record<string, unknown> = {}) {
  return {
    time: '2026-04-18 12:00',
    time_epoch: NOW_EPOCH,
    temp_c: 12,
    temp_f: 53.6,
    feelslike_c: 10,
    feelslike_f: 50,
    humidity: 60,
    wind_kph: 18,
    wind_mph: 11.2,
    condition: { text: 'Sunny', code: 1000 },
    chance_of_rain: 20,
    ...overrides,
  };
}

function waDay(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-04-18',
    day: {
      maxtemp_c: 16,
      maxtemp_f: 60.8,
      mintemp_c: 6,
      mintemp_f: 42.8,
      avghumidity: 55,
      maxwind_kph: 24,
      maxwind_mph: 14.9,
      totalprecip_mm: 3.2,
      totalprecip_in: 0.13,
      daily_chance_of_rain: 40,
      condition: { text: 'Partly cloudy', code: 1003 },
    },
    hour: [],
    ...overrides,
  };
}

describe('WeatherAPIProvider', () => {
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
    expect(() => new WeatherAPIProvider()).toThrow(/key is not configured/i);
  });

  it('getHourly picks Celsius/kph fields and maps the condition code by daytime', async () => {
    spy = mockWa({
      current: { is_day: 1 },
      forecast: { forecastday: [{ date: '2026-04-18', day: {}, hour: [waHour()] }] },
    });

    const out = await new WeatherAPIProvider('key').getHourly(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18 12:00',
      temp: 12,
      feelsLike: 10,
      humidity: 60,
      windSpeed: 18, // kph in metric
      icon: 'sun', // code 1000, is_day=1
      description: 'Sunny',
      precipProbability: 20,
    });
  });

  it('getHourly picks Fahrenheit/mph fields and the night icon variant when is_day=0', async () => {
    spy = mockWa({
      current: { is_day: 0 },
      forecast: { forecastday: [{ date: '2026-04-18', day: {}, hour: [waHour()] }] },
    });

    const out = await new WeatherAPIProvider('key').getHourly(44.71, -93.42, 'imperial');

    expect(out[0].temp).toBe(53.6);
    expect(out[0].windSpeed).toBe(11.2);
    expect(out[0].icon).toBe('moon'); // code 1000, is_day=0
  });

  it('getHourly drops hours before now', async () => {
    spy = mockWa({
      current: { is_day: 1 },
      forecast: {
        forecastday: [{
          date: '2026-04-18',
          day: {},
          hour: [
            waHour({ time_epoch: NOW_EPOCH - 3600 }), // past — filtered out
            waHour({ time_epoch: NOW_EPOCH + 3600, temp_c: 14 }),
          ],
        }],
      },
    });

    const out = await new WeatherAPIProvider('key').getHourly(44.71, -93.42, 'metric');
    expect(out).toHaveLength(1);
    expect(out[0].temp).toBe(14);
  });

  it('getForecast maps day summaries with metric units and code 1003 → cloud-sun', async () => {
    spy = mockWa({ current: { is_day: 1 }, forecast: { forecastday: [waDay()] } });

    const out = await new WeatherAPIProvider('key').getForecast(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 16,
      low: 6,
      icon: 'cloud-sun', // 1003 with isDay=true
      description: 'Partly cloudy',
      precipProbability: 40,
      precipAmount: 3.2, // mm in metric
      humidity: 55,
      windSpeed: 24, // kph in metric
    });
  });

  it('getForecast uses imperial precip/wind/temp fields in imperial units', async () => {
    spy = mockWa({ current: { is_day: 1 }, forecast: { forecastday: [waDay()] } });
    const out = await new WeatherAPIProvider('key').getForecast(44.71, -93.42, 'imperial');
    expect(out[0].high).toBe(60.8);
    expect(out[0].low).toBe(42.8);
    expect(out[0].windSpeed).toBe(14.9);
    expect(out[0].precipAmount).toBe(0.13); // inches
  });
});
