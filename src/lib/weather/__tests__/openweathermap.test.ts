import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenWeatherMapProvider } from '../openweathermap';

// ── Fetch mock ───────────────────────────────────────────────────────
// OWM hits two endpoints: `/data/2.5/weather` (current conditions) and
// `/data/2.5/forecast` (3-hourly list). Route by path so getHourly, which
// fetches both in parallel, gets the right body for each.

function mockOwm(handlers: { current?: unknown; forecast?: unknown }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const body = url.includes('/forecast?') ? handlers.forecast : handlers.current;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

const T0 = Date.parse('2026-04-18T12:00:00Z') / 1000;

function owmEntry(overrides: Record<string, unknown> = {}) {
  return {
    dt: T0,
    main: { temp: 12, feels_like: 10, humidity: 60, temp_min: 8, temp_max: 14, pressure: 1012 },
    weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
    wind: { speed: 3.5, deg: 180 },
    pop: 0.2,
    ...overrides,
  };
}

describe('OpenWeatherMapProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  afterEach(() => spy?.mockRestore());

  it('throws when constructed without an API key', () => {
    expect(() => new OpenWeatherMapProvider()).toThrow(/API key is not configured/i);
  });

  it('getHourly returns current conditions first, then the forecast list', async () => {
    spy = mockOwm({
      current: owmEntry({ weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }] }),
      forecast: {
        list: [
          owmEntry({ dt: T0 + 3600, main: { temp: 13, feels_like: 11, humidity: 55, temp_min: 12, temp_max: 14, pressure: 1011 }, weather: [{ id: 802, main: 'Clouds', description: 'scattered clouds', icon: '02d' }], pop: 0.5 }),
        ],
      },
    });

    const out = await new OpenWeatherMapProvider('key').getHourly(44.71, -93.42, 'metric');

    expect(out).toHaveLength(2);
    // Current (index 0)
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00.000Z',
      temp: 12,
      feelsLike: 10,
      humidity: 60,
      icon: 'sun', // 01d
      description: 'clear sky',
      windSpeed: 12.6, // 3.5 m/s -> km/h under metric
      precipProbability: 0, // current is always 0
    });
    // Forecast (index 1) — pop scaled to a percentage
    expect(out[1]).toMatchObject({
      time: '2026-04-18T13:00:00.000Z',
      temp: 13,
      icon: 'cloud-sun', // 02d
      precipProbability: 50,
    });
  });

  it('getHourly falls back to the thermometer icon and empty description when weather[] is empty', async () => {
    spy = mockOwm({
      current: owmEntry({ weather: [] }),
      forecast: { list: [] },
    });
    const out = await new OpenWeatherMapProvider('key').getHourly(44.71, -93.42, 'metric');
    expect(out[0].icon).toBe('thermometer');
    expect(out[0].description).toBe('');
  });

  it('getForecast aggregates 3-hourly entries into per-day highs/lows and a midday icon', async () => {
    // Two same-day entries: high=max, low=min, midday icon = icons[floor(len/2)].
    spy = mockOwm({
      forecast: {
        list: [
          owmEntry({ dt: T0, main: { temp: 8, feels_like: 6, humidity: 70, temp_min: 8, temp_max: 8, pressure: 1010 }, weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }], pop: 0.1, rain: { '3h': 0 } }),
          owmEntry({ dt: T0 + 3 * 3600, main: { temp: 16, feels_like: 15, humidity: 50, temp_min: 14, temp_max: 16, pressure: 1008 }, weather: [{ id: 500, main: 'Rain', description: 'light rain', icon: '10d' }], pop: 0.6, rain: { '3h': 12.7 } }),
        ],
      },
    });

    const out = await new OpenWeatherMapProvider('key').getForecast(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 16,
      low: 8,
      icon: 'cloud-drizzle', // icons[1] = '10d'
      description: 'light rain',
      precipProbability: 60, // max(10, 60)
      humidity: 60, // avg(70, 50)
      windSpeed: 13, // round(avg(3.5, 3.5) m/s * 3.6)
      precipAmount: 12.7, // metric mm summed
    });
  });

  it('getForecast converts summed precipitation to inches in imperial units', async () => {
    spy = mockOwm({
      forecast: {
        list: [owmEntry({ dt: T0, rain: { '3h': 25.4 } })],
      },
    });
    const out = await new OpenWeatherMapProvider('key').getForecast(44.71, -93.42, 'imperial');
    expect(out[0].precipAmount).toBe(1); // 25.4mm / 25.4 = 1.00in
  });
});
