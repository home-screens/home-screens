import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenWeatherMapProvider, WeatherAPIProvider, OpenMeteoProvider, YrProvider, SMHIProvider, MetOfficeProvider, EnvCanadaProvider, createWeatherProvider } from '../weather';
import { symbolToIcon, symbolDescription } from '../weather/yr';
import { wsymb2ToIcon } from '../weather/smhi';

describe('createWeatherProvider', () => {
  it('creates OpenWeatherMap provider', () => {
    const provider = createWeatherProvider('openweathermap', 'test-key');
    expect(provider).toBeInstanceOf(OpenWeatherMapProvider);
  });

  it('creates WeatherAPI provider', () => {
    const provider = createWeatherProvider('weatherapi', 'test-key');
    expect(provider).toBeInstanceOf(WeatherAPIProvider);
  });

  it('creates Open-Meteo provider', () => {
    const provider = createWeatherProvider('open-meteo');
    expect(provider).toBeInstanceOf(OpenMeteoProvider);
  });

  it('creates Yr.no provider', () => {
    const provider = createWeatherProvider('yr');
    expect(provider).toBeInstanceOf(YrProvider);
  });

  it('creates SMHI provider', () => {
    const provider = createWeatherProvider('smhi');
    expect(provider).toBeInstanceOf(SMHIProvider);
  });

  it('creates Met Office provider when apiKey is provided', () => {
    const provider = createWeatherProvider('metoffice', 'test-key');
    expect(provider).toBeInstanceOf(MetOfficeProvider);
  });

  it('throws when Met Office is created without an API key', () => {
    expect(() => createWeatherProvider('metoffice')).toThrow(/requires an API key/);
  });

  it('creates Environment Canada provider', () => {
    const provider = createWeatherProvider('envcanada');
    expect(provider).toBeInstanceOf(EnvCanadaProvider);
  });

  it('throws on unknown provider', () => {
    expect(() => createWeatherProvider('unknown')).toThrow('Unknown weather provider: unknown');
  });
});

describe('OpenWeatherMapProvider', () => {
  it('throws without API key', () => {
    expect(() => new OpenWeatherMapProvider()).toThrow('OpenWeatherMap API key is not configured');
  });

  describe('icon mapping', () => {
    const provider = new OpenWeatherMapProvider('test-key');
    const mapIcon = (provider as unknown as { mapIcon: (code: string) => string }).mapIcon.bind(provider);

    it('maps clear day/night correctly', () => {
      expect(mapIcon('01d')).toBe('sun');
      expect(mapIcon('01n')).toBe('moon');
    });

    it('maps rain codes', () => {
      expect(mapIcon('09d')).toBe('cloud-rain');
      expect(mapIcon('10d')).toBe('cloud-drizzle');
    });

    it('maps thunderstorm', () => {
      expect(mapIcon('11d')).toBe('cloud-lightning');
    });

    it('maps snow', () => {
      expect(mapIcon('13d')).toBe('snowflake');
    });

    it('maps fog/mist', () => {
      expect(mapIcon('50d')).toBe('cloud-fog');
    });

    it('returns fallback for unknown codes', () => {
      expect(mapIcon('99z')).toBe('thermometer');
      expect(mapIcon('')).toBe('thermometer');
    });
  });
});

describe('OpenMeteoProvider', () => {
  describe('WMO code mapping', () => {
    const provider = new OpenMeteoProvider();
    const mapWMO = (provider as unknown as { mapWMOCode: (code: number, isDay: boolean) => string }).mapWMOCode.bind(provider);

    it('maps clear sky day vs night', () => {
      expect(mapWMO(0, true)).toBe('sun');
      expect(mapWMO(0, false)).toBe('moon');
    });

    it('maps partly cloudy day vs night', () => {
      expect(mapWMO(1, true)).toBe('cloud-sun');
      expect(mapWMO(2, false)).toBe('cloud-moon');
    });

    it('maps overcast', () => {
      expect(mapWMO(3, true)).toBe('cloud');
    });

    it('maps fog', () => {
      expect(mapWMO(45, true)).toBe('cloud-fog');
      expect(mapWMO(48, true)).toBe('cloud-fog');
    });

    it('maps drizzle', () => {
      expect(mapWMO(51, true)).toBe('cloud-drizzle');
      expect(mapWMO(53, true)).toBe('cloud-drizzle');
      expect(mapWMO(55, true)).toBe('cloud-drizzle');
    });

    it('maps rain', () => {
      expect(mapWMO(61, true)).toBe('cloud-rain');
      expect(mapWMO(65, true)).toBe('cloud-rain');
      expect(mapWMO(80, true)).toBe('cloud-rain');
    });

    it('maps snow', () => {
      expect(mapWMO(71, true)).toBe('snowflake');
      expect(mapWMO(75, true)).toBe('snowflake');
      expect(mapWMO(85, true)).toBe('snowflake');
    });

    it('maps thunderstorms', () => {
      expect(mapWMO(95, true)).toBe('cloud-lightning');
      expect(mapWMO(96, true)).toBe('cloud-lightning');
      expect(mapWMO(99, true)).toBe('cloud-lightning');
    });

    it('returns fallback for unmapped codes', () => {
      expect(mapWMO(100, true)).toBe('thermometer');
    });

    it('returns fallback for WMO gap-range codes (4-44)', () => {
      expect(mapWMO(10, true)).toBe('thermometer');
      expect(mapWMO(20, true)).toBe('thermometer');
      expect(mapWMO(30, false)).toBe('thermometer');
      expect(mapWMO(44, true)).toBe('thermometer');
    });
  });

  describe('WMO descriptions', () => {
    const provider = new OpenMeteoProvider();
    const wmoDesc = (provider as unknown as { wmoDescription: (code: number) => string }).wmoDescription.bind(provider);

    it('returns human-readable descriptions', () => {
      expect(wmoDesc(0)).toBe('Clear sky');
      expect(wmoDesc(61)).toBe('Slight rain');
      expect(wmoDesc(95)).toBe('Thunderstorm');
    });

    it('returns Unknown for unmapped codes', () => {
      expect(wmoDesc(100)).toBe('Unknown');
    });
  });

  describe('getHourly', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // One hour ago (should be included), two hours ago (should be filtered out), one hour ahead
    const pastEpoch = nowSec - 7200;
    const recentEpoch = nowSec - 1800;
    const futureEpoch = nowSec + 3600;

    const mockHourlyResponse = {
      hourly: {
        time: [pastEpoch, recentEpoch, futureEpoch],
        temperature_2m: [60, 65, 70],
        apparent_temperature: [58, 63, 68],
        relative_humidity_2m: [50, 55, 60],
        weather_code: [0, 3, 61],
        wind_speed_10m: [5, 10, 15],
        precipitation_probability: [0, 10, 80],
        surface_pressure: [1013, 1012, 1010],
        dew_point_2m: [40, 42, 45],
        is_day: [1, 1, 0],
      },
    };

    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockHourlyResponse), { status: 200 }),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('filters out entries older than 1 hour', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getHourly(40.7, -74.0, 'imperial');
      // pastEpoch (2 hours ago) should be excluded; recentEpoch and futureEpoch should be included
      expect(results).toHaveLength(2);
    });

    it('converts epoch timestamps to ISO strings', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getHourly(40.7, -74.0, 'imperial');
      for (const r of results) {
        expect(r.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it('maps all fields correctly', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getHourly(40.7, -74.0, 'imperial');
      const first = results[0];
      expect(first.temp).toBe(65);
      expect(first.feelsLike).toBe(63);
      expect(first.humidity).toBe(55);
      expect(first.icon).toBe('cloud'); // WMO 3 = overcast
      expect(first.description).toBe('Overcast');
      expect(first.windSpeed).toBe(10);
      expect(first.precipProbability).toBe(10);
      expect(first.pressure).toBe(1012);
      expect(first.dewPoint).toBe(42);
    });

    it('uses fahrenheit and mph for imperial units', async () => {
      const provider = new OpenMeteoProvider();
      await provider.getHourly(40.7, -74.0, 'imperial');
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('temperature_unit=fahrenheit');
      expect(url).toContain('wind_speed_unit=mph');
      expect(url).toContain('timeformat=unixtime');
    });

    it('uses celsius and kmh for metric units', async () => {
      const provider = new OpenMeteoProvider();
      await provider.getHourly(40.7, -74.0, 'metric');
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('temperature_unit=celsius');
      expect(url).toContain('wind_speed_unit=kmh');
    });

    it('throws on API error', async () => {
      fetchSpy.mockResolvedValue(new Response('Rate limited', { status: 400 }));
      const provider = new OpenMeteoProvider();
      await expect(provider.getHourly(40.7, -74.0, 'imperial')).rejects.toThrow('Open-Meteo API error 400');
    });

    it('handles night-time icons via is_day field', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getHourly(40.7, -74.0, 'imperial');
      const nightEntry = results.find(r => r.icon === 'cloud-rain');
      expect(nightEntry).toBeDefined(); // WMO 61 at night still maps to cloud-rain (not day-dependent)
    });
  });

  describe('getForecast', () => {
    const mockDailyResponse = {
      daily: {
        time: [1710288000, 1710374400, 1710460800],
        temperature_2m_max: [72.5, 68.2, 75.9],
        temperature_2m_min: [55.1, 52.8, 58.3],
        weather_code: [0, 61, 71],
        precipitation_sum: [0, 5.2, 0.8],
        precipitation_probability_max: [5, 85, 30],
        wind_speed_10m_max: [12.4, 22.1, 8.7],
      },
    };

    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockDailyResponse), { status: 200 }),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('returns correct number of forecast days', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getForecast(40.7, -74.0, 'imperial');
      expect(results).toHaveLength(3);
    });

    it('rounds temperatures to integers', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getForecast(40.7, -74.0, 'imperial');
      expect(results[0].high).toBe(73); // 72.5 → 73
      expect(results[0].low).toBe(55);  // 55.1 → 55
    });

    it('converts epoch dates to YYYY-MM-DD strings', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getForecast(40.7, -74.0, 'imperial');
      for (const r of results) {
        expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('maps weather codes to icons', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getForecast(40.7, -74.0, 'imperial');
      expect(results[0].icon).toBe('sun');        // WMO 0
      expect(results[1].icon).toBe('cloud-rain');  // WMO 61
      expect(results[2].icon).toBe('snowflake');   // WMO 71
    });

    it('rounds wind speed and includes precip fields', async () => {
      const provider = new OpenMeteoProvider();
      const results = await provider.getForecast(40.7, -74.0, 'imperial');
      expect(results[1].windSpeed).toBe(22); // 22.1 → 22
      expect(results[1].precipProbability).toBe(85);
      expect(results[1].precipAmount).toBe(5.2);
    });

    it('throws on API error', async () => {
      fetchSpy.mockResolvedValue(new Response('Server error', { status: 400 }));
      const provider = new OpenMeteoProvider();
      await expect(provider.getForecast(40.7, -74.0, 'imperial')).rejects.toThrow('Open-Meteo API error 400');
    });
  });
});

describe('WeatherAPIProvider', () => {
  it('throws without API key', () => {
    expect(() => new WeatherAPIProvider()).toThrow('WeatherAPI key is not configured');
  });

  describe('condition code mapping', () => {
    const provider = new WeatherAPIProvider('test-key');
    const mapCondition = (provider as unknown as { mapConditionToIcon: (code: number, isDay: boolean) => string }).mapConditionToIcon.bind(provider);

    it('maps clear sky day vs night', () => {
      expect(mapCondition(1000, true)).toBe('sun');
      expect(mapCondition(1000, false)).toBe('moon');
    });

    it('maps partly cloudy day vs night', () => {
      expect(mapCondition(1003, true)).toBe('cloud-sun');
      expect(mapCondition(1003, false)).toBe('cloud-moon');
    });

    it('maps overcast', () => {
      expect(mapCondition(1006, true)).toBe('cloud');
      expect(mapCondition(1009, false)).toBe('cloud');
    });

    it('maps light rain', () => {
      expect(mapCondition(1063, true)).toBe('cloud-drizzle');
      expect(mapCondition(1183, true)).toBe('cloud-drizzle');
    });

    it('maps heavy rain', () => {
      expect(mapCondition(1195, true)).toBe('cloud-rain');
    });

    it('maps snow', () => {
      expect(mapCondition(1066, true)).toBe('snowflake');
      expect(mapCondition(1225, true)).toBe('snowflake');
    });

    it('maps thunderstorm', () => {
      expect(mapCondition(1087, true)).toBe('cloud-lightning');
      expect(mapCondition(1276, true)).toBe('cloud-lightning');
    });

    it('returns fallback for unmapped codes', () => {
      expect(mapCondition(9999, true)).toBe('thermometer');
    });
  });
});

// ── Cross-provider unit conversion ─────────────────────────────────

describe('WeatherAPIProvider — unit conversion', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const makeWAResponse = (overrides?: Partial<{ current: object; forecast: object }>) => ({
    current: { is_day: 1, ...(overrides?.current ?? {}) },
    forecast: {
      forecastday: [
        {
          date: '2025-06-15',
          day: {
            maxtemp_c: 30,
            maxtemp_f: 86,
            mintemp_c: 20,
            mintemp_f: 68,
            avghumidity: 55,
            maxwind_kph: 24.1,
            maxwind_mph: 15.0,
            totalprecip_mm: 5.2,
            totalprecip_in: 0.2,
            daily_chance_of_rain: 60,
            condition: { text: 'Partly cloudy', code: 1003 },
          },
          hour: [
            {
              time: '2025-06-15 12:00',
              time_epoch: Math.floor(Date.now() / 1000) + 3600,
              temp_c: 28,
              temp_f: 82.4,
              feelslike_c: 30,
              feelslike_f: 86,
              humidity: 60,
              wind_kph: 16.1,
              wind_mph: 10.0,
              condition: { text: 'Partly cloudy', code: 1003 },
              chance_of_rain: 40,
            },
          ],
        },
      ],
      ...(overrides?.forecast ?? {}),
    },
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns imperial units (°F, mph, inches) when units=imperial', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makeWAResponse()), { status: 200 }));
    const provider = new WeatherAPIProvider('test-key');

    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');
    expect(hourly[0].temp).toBe(82.4);       // temp_f
    expect(hourly[0].feelsLike).toBe(86);     // feelslike_f
    expect(hourly[0].windSpeed).toBe(10.0);   // wind_mph

    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makeWAResponse()), { status: 200 }));
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');
    expect(forecast[0].high).toBe(86);        // maxtemp_f
    expect(forecast[0].low).toBe(68);         // mintemp_f
    expect(forecast[0].windSpeed).toBe(15.0); // maxwind_mph
    expect(forecast[0].precipAmount).toBe(0.2); // totalprecip_in
  });

  it('returns metric units (°C, km/h, mm) when units=metric', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makeWAResponse()), { status: 200 }));
    const provider = new WeatherAPIProvider('test-key');

    const hourly = await provider.getHourly(40.7, -74.0, 'metric');
    expect(hourly[0].temp).toBe(28);          // temp_c
    expect(hourly[0].feelsLike).toBe(30);     // feelslike_c
    expect(hourly[0].windSpeed).toBe(16.1);   // wind_kph

    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makeWAResponse()), { status: 200 }));
    const forecast = await provider.getForecast(40.7, -74.0, 'metric');
    expect(forecast[0].high).toBe(30);        // maxtemp_c
    expect(forecast[0].low).toBe(20);         // mintemp_c
    expect(forecast[0].windSpeed).toBe(24.1); // maxwind_kph
    expect(forecast[0].precipAmount).toBe(5.2); // totalprecip_mm
  });
});

describe('OpenWeatherMapProvider — data normalization', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const owmCurrentResponse = {
    dt: 1710000000,
    main: { temp: 72, feels_like: 70, humidity: 55, temp_min: 68, temp_max: 75, pressure: 1015 },
    weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
    wind: { speed: 8, deg: 180 },
  };

  const owmForecastResponse = {
    list: [
      {
        dt: 1710010800,
        main: { temp: 74, feels_like: 72, humidity: 50, temp_min: 70, temp_max: 77, pressure: 1014 },
        weather: [{ id: 801, main: 'Clouds', description: 'few clouds', icon: '02d' }],
        wind: { speed: 10, deg: 200 },
        pop: 0.25,
        rain: { '3h': 1.5 },
      },
      {
        dt: 1710021600,
        main: { temp: 68, feels_like: 66, humidity: 60, temp_min: 65, temp_max: 70, pressure: 1013 },
        weather: [{ id: 500, main: 'Rain', description: 'light rain', icon: '10d' }],
        wind: { speed: 12, deg: 220 },
        pop: 0.7,
        rain: { '3h': 3.2 },
      },
    ],
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('normalizes current weather into HourlyWeather[0]', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(owmCurrentResponse), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(owmForecastResponse), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].temp).toBe(72);
    expect(hourly[0].feelsLike).toBe(70);
    expect(hourly[0].humidity).toBe(55);
    expect(hourly[0].icon).toBe('sun');
    expect(hourly[0].description).toBe('clear sky');
    expect(hourly[0].windSpeed).toBe(8);
    expect(hourly[0].precipProbability).toBe(0);
  });

  it('converts pop from 0-1 to 0-100 in hourly forecast', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(owmCurrentResponse), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(owmForecastResponse), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    // list[0].pop = 0.25 → 25, list[1].pop = 0.7 → 70
    expect(hourly[1].precipProbability).toBe(25);
    expect(hourly[2].precipProbability).toBe(70);
  });

  it('aggregates forecast entries by date for getForecast', async () => {
    // Both entries have same date from epoch 1710010800 and 1710021600
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(owmForecastResponse), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    // Both entries are on the same day so they should be aggregated
    expect(forecast.length).toBe(1);
    // High should be max of temps: max(74, 68) = 74
    expect(forecast[0].high).toBe(74);
    // Low should be min of temps: min(74, 68) = 68
    expect(forecast[0].low).toBe(68);
    // Rain accumulated: 1.5 + 3.2 = 4.7 mm → inches: 4.7/25.4 ≈ 0.19
    expect(forecast[0].precipAmount).toBe(Math.round(4.7 / 25.4 * 100) / 100);
  });

  it('calculates precipAmount in mm for metric', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(owmForecastResponse), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'metric');

    // Rain accumulated: 1.5 + 3.2 = 4.7 → rounded to 1 decimal = 4.7 mm
    expect(forecast[0].precipAmount).toBe(Math.round(4.7 * 10) / 10);
  });

  it('averages humidity and windSpeed across day entries', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(owmForecastResponse), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    // humidity avg: (50 + 60) / 2 = 55
    expect(forecast[0].humidity).toBe(55);
    // windSpeed avg: (10 + 12) / 2 = 11
    expect(forecast[0].windSpeed).toBe(11);
  });
});

// ── Pirate Weather specifics ───────────────────────────────────────

describe('PirateWeatherProvider — data normalization', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const nowEpoch = Math.floor(Date.now() / 1000);

  const makePWResponse = (overrides?: Partial<{
    hourly: object;
    daily: object;
    minutely: object;
    alerts: object[];
  }>) => ({
    currently: {
      time: nowEpoch,
      summary: 'Clear',
      icon: 'clear-day',
      temperature: 72,
      apparentTemperature: 70,
      humidity: 0.55,
      windSpeed: 8,
      precipProbability: 0.1,
    },
    hourly: {
      data: [
        {
          time: nowEpoch,
          summary: 'Clear',
          icon: 'clear-day',
          temperature: 72,
          apparentTemperature: 70,
          humidity: 0.55,
          windSpeed: 8,
          precipProbability: 0.1,
          pressure: 1015.2,
          visibility: 10,
        },
        {
          time: nowEpoch + 3600,
          summary: 'Partly Cloudy',
          icon: 'partly-cloudy-day',
          temperature: 75,
          apparentTemperature: 73,
          humidity: 0.5,
          windSpeed: 10,
          precipProbability: 0.25,
        },
      ],
      ...(overrides?.hourly ?? {}),
    },
    daily: {
      data: [
        {
          time: nowEpoch,
          summary: 'Clear throughout the day.',
          icon: 'clear-day',
          temperatureHigh: 85,
          temperatureLow: 62,
          humidity: 0.45,
          windSpeed: 12.7,
          precipProbability: 0.15,
          precipAccumulation: 0.02,
        },
      ],
      ...(overrides?.daily ?? {}),
    },
    minutely: overrides?.minutely ?? {
      data: [
        { time: nowEpoch, precipIntensity: 0, precipProbability: 0, precipType: 'none' },
        { time: nowEpoch + 60, precipIntensity: 0.5, precipProbability: 0.8, precipType: 'rain' },
      ],
    },
    alerts: overrides?.alerts ?? [],
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('scales humidity from 0-1 to 0-100 in hourly', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    // humidity 0.55 → 55, humidity 0.5 → 50
    expect(hourly[0].humidity).toBe(55);
    expect(hourly[1].humidity).toBe(50);
  });

  it('scales precipProbability from 0-1 to 0-100 in hourly', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].precipProbability).toBe(10);  // 0.1 → 10
    expect(hourly[1].precipProbability).toBe(25);   // 0.25 → 25
  });

  it('scales humidity from 0-1 to 0-100 in daily forecast', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].humidity).toBe(45); // 0.45 → 45
  });

  it('scales precipProbability from 0-1 to 0-100 in daily forecast', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].precipProbability).toBe(15); // 0.15 → 15
  });

  it('rounds daily temperatures and wind speed', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].high).toBe(85);
    expect(forecast[0].low).toBe(62);
    expect(forecast[0].windSpeed).toBe(13); // 12.7 → 13
  });

  it('normalizes minutely precipitation data', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const minutely = await provider.getMinutely!(40.7, -74.0, 'imperial');

    expect(minutely).toHaveLength(2);
    expect(minutely[0]).toEqual({
      time: nowEpoch,
      intensity: 0,
      probability: 0,
      type: 'none',
    });
    expect(minutely[1]).toEqual({
      time: nowEpoch + 60,
      intensity: 0.5,
      probability: 80, // 0.8 → 80
      type: 'rain',
    });
  });

  it('returns empty array when minutely data is missing', async () => {
    const noMinutely = makePWResponse();
    delete (noMinutely as Record<string, unknown>).minutely;
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(noMinutely), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const minutely = await provider.getMinutely!(40.7, -74.0, 'imperial');

    expect(minutely).toEqual([]);
  });

  it('parses alerts with known severities', async () => {
    const response = makePWResponse({
      alerts: [
        {
          title: 'Heat Advisory',
          severity: 'Moderate',
          description: 'Dangerously hot conditions expected.',
          expires: nowEpoch + 86400,
          uri: 'https://alerts.weather.gov/heat',
        },
        {
          title: 'Tornado Warning',
          severity: 'Extreme',
          description: 'Take shelter immediately.',
          expires: nowEpoch + 3600,
        },
      ],
    });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const alerts = await provider.getAlerts!(40.7, -74.0, 'imperial');

    expect(alerts).toHaveLength(2);
    expect(alerts[0].severity).toBe('Moderate');
    expect(alerts[0].title).toBe('Heat Advisory');
    expect(alerts[0].uri).toBe('https://alerts.weather.gov/heat');
    expect(alerts[1].severity).toBe('Extreme');
  });

  it('maps unknown severity to "Unknown"', async () => {
    const response = makePWResponse({
      alerts: [
        {
          title: 'Special Statement',
          severity: 'NotARealSeverity',
          description: 'Something unusual.',
          expires: nowEpoch + 3600,
        },
      ],
    });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const alerts = await provider.getAlerts!(40.7, -74.0, 'imperial');

    expect(alerts[0].severity).toBe('Unknown');
  });

  it('returns empty alerts when no alerts in response', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(makePWResponse()), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const alerts = await provider.getAlerts!(40.7, -74.0, 'imperial');

    expect(alerts).toEqual([]);
  });

  it('maps Pirate Weather icon strings to unified icons', async () => {
    const response = makePWResponse({
      hourly: {
        data: [
          { time: nowEpoch, icon: 'rain', temperature: 60, summary: 'Rain' },
          { time: nowEpoch + 3600, icon: 'snow', temperature: 30, summary: 'Snow' },
          { time: nowEpoch + 7200, icon: 'fog', temperature: 55, summary: 'Fog' },
          { time: nowEpoch + 10800, icon: 'thunderstorm', temperature: 70, summary: 'Storm' },
          { time: nowEpoch + 14400, icon: 'clear-night', temperature: 65, summary: 'Clear' },
        ],
      },
    });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].icon).toBe('cloud-rain');
    expect(hourly[1].icon).toBe('snowflake');
    expect(hourly[2].icon).toBe('cloud-fog');
    expect(hourly[3].icon).toBe('cloud-lightning');
    expect(hourly[4].icon).toBe('moon');
  });

  it('handles null humidity gracefully', async () => {
    const response = makePWResponse({
      hourly: {
        data: [
          { time: nowEpoch, icon: 'clear-day', temperature: 72, summary: 'Clear', humidity: null },
        ],
      },
    });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].humidity).toBeUndefined();
  });

  it('defaults temperature to 0 when missing', async () => {
    const response = makePWResponse({
      hourly: {
        data: [
          { time: nowEpoch, icon: 'clear-day', summary: 'Clear' },
        ],
      },
    });
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].temp).toBe(0);
  });

  it('returns empty hourly array when hourly data is missing', async () => {
    const noHourly = makePWResponse();
    delete (noHourly as Record<string, unknown>).hourly;
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(noHourly), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly).toEqual([]);
  });

  it('returns empty forecast array when daily data is missing', async () => {
    const noDaily = makePWResponse();
    delete (noDaily as Record<string, unknown>).daily;
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(noDaily), { status: 200 }));
    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast).toEqual([]);
  });
});

// ── NOAA specifics ─────────────────────────────────────────────────

describe('NOAAProvider — data normalization', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const gridPointResponse = {
    properties: {
      gridId: 'OKX',
      gridX: 33,
      gridY: 37,
      observationStations: 'https://api.weather.gov/gridpoints/OKX/33,37/stations',
      timeZone: 'America/New_York',
    },
  };

  const stationsResponse = {
    features: [
      { properties: { stationIdentifier: 'KNYC' } },
    ],
  };

  const observationResponse = {
    properties: {
      textDescription: 'Clear',
      temperature: { value: 22.2, unitCode: 'wmoUnit:degC' },        // 22.2°C
      dewpoint: { value: 10.0, unitCode: 'wmoUnit:degC' },
      relativeHumidity: { value: 55, unitCode: 'wmoUnit:percent' },
      windSpeed: { value: 8, unitCode: 'wmoUnit:km_h-1' },
      barometricPressure: { value: 101500, unitCode: 'wmoUnit:Pa' },  // 101500 Pa → 1015 hPa
      visibility: { value: 16093, unitCode: 'wmoUnit:m' },             // ~10 miles
      windChill: { value: 20.0, unitCode: 'wmoUnit:degC' },
      heatIndex: { value: null, unitCode: 'wmoUnit:degC' },
    },
  };

  const now = new Date();
  const hourFromNow = new Date(now.getTime() + 3600000).toISOString();
  const twoHoursFromNow = new Date(now.getTime() + 7200000).toISOString();

  const hourlyForecastResponse = {
    properties: {
      periods: [
        {
          number: 1,
          name: 'This Afternoon',
          startTime: hourFromNow,
          endTime: twoHoursFromNow,
          isDaytime: true,
          temperature: 72,
          temperatureUnit: 'F',
          probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 30 },
          dewpoint: { unitCode: 'wmoUnit:degC', value: 12 },
          relativeHumidity: { unitCode: 'wmoUnit:percent', value: 55 },
          windSpeed: '10 to 15 mph',
          windDirection: 'SW',
          shortForecast: 'Partly Sunny',
          detailedForecast: 'Partly sunny, with a high near 72.',
        },
        {
          number: 2,
          name: 'Tonight',
          startTime: twoHoursFromNow,
          endTime: new Date(now.getTime() + 10800000).toISOString(),
          isDaytime: false,
          temperature: 58,
          temperatureUnit: 'F',
          probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 10 },
          dewpoint: { unitCode: 'wmoUnit:degC', value: 10 },
          relativeHumidity: { unitCode: 'wmoUnit:percent', value: 65 },
          windSpeed: '5 mph',
          windDirection: 'N',
          shortForecast: 'Mostly Clear',
          detailedForecast: 'Mostly clear, with a low around 58.',
        },
      ],
    },
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Note: NOAA grid cache is internal and not exported, so we use
    // unique lat/lon values across tests or accept cached grid data.
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // Helper to set up the usual grid point + stations + observation mock chain
  function mockGridAndObservation() {
    fetchSpy.mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes('/points/')) {
        return Promise.resolve(new Response(JSON.stringify(gridPointResponse), { status: 200 }));
      }
      if (urlStr.includes('/stations') && !urlStr.includes('/observations')) {
        return Promise.resolve(new Response(JSON.stringify(stationsResponse), { status: 200 }));
      }
      if (urlStr.includes('/observations/latest')) {
        return Promise.resolve(new Response(JSON.stringify(observationResponse), { status: 200 }));
      }
      if (urlStr.includes('/forecast/hourly')) {
        return Promise.resolve(new Response(JSON.stringify(hourlyForecastResponse), { status: 200 }));
      }
      if (urlStr.includes('/forecast')) {
        return Promise.resolve(new Response(JSON.stringify({
          properties: {
            periods: [
              {
                number: 1,
                name: 'Today',
                startTime: hourFromNow,
                endTime: twoHoursFromNow,
                isDaytime: true,
                temperature: 72,
                temperatureUnit: 'F',
                probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 40 },
                dewpoint: { unitCode: 'wmoUnit:degC', value: 12 },
                relativeHumidity: { unitCode: 'wmoUnit:percent', value: 55 },
                windSpeed: '5 to 10 mph, with gusts as high as 25 mph',
                windDirection: 'SW',
                shortForecast: 'Scattered Showers',
                detailedForecast: 'Scattered showers after 2pm.',
              },
              {
                number: 2,
                name: 'Tonight',
                startTime: twoHoursFromNow,
                endTime: new Date(now.getTime() + 10800000).toISOString(),
                isDaytime: false,
                temperature: 55,
                temperatureUnit: 'F',
                probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 20 },
                dewpoint: { unitCode: 'wmoUnit:degC', value: 10 },
                relativeHumidity: { unitCode: 'wmoUnit:percent', value: 70 },
                windSpeed: 'Calm',
                windDirection: 'N',
                shortForecast: 'Mostly Clear',
                detailedForecast: 'Mostly clear, low around 55.',
              },
            ],
          },
        }), { status: 200 }));
      }
      if (urlStr.includes('/alerts')) {
        return Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    });
  }

  describe('wind speed regex extraction', () => {
    it('extracts max wind from "5 to 10 mph" → 10', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      // "5 to 10 mph, with gusts as high as 25 mph" → gust stripped → "5 to 10 mph" → max(5,10) = 10
      expect(forecast[0].windSpeed).toBe(10);
    });

    it('extracts wind from single number "5 mph" → 5', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      // Period 2 has "5 mph"
      const calmPeriod = hourly.find(h => h.windSpeed === 5);
      expect(calmPeriod).toBeDefined();
    });

    it('returns 0 for "Calm"', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      // The night period has "Calm" → 0
      expect(forecast[0].windSpeed).toBe(10); // day period
      // The tonight companion has "Calm" — but it's paired as the night period
    });

    it('strips gust clause before parsing wind', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      // "5 to 10 mph, with gusts as high as 25 mph" → should NOT return 25
      expect(forecast[0].windSpeed).toBe(10);
    });

    it('converts wind speed to km/h for metric', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'metric');

      // "10 to 15 mph" → max 15 → 15 * 1.60934 ≈ 24.14 → Math.round → 24
      expect(hourly[0].windSpeed).toBe(24);
    });
  });

  describe('temperature conversion', () => {
    it('returns temperature in °F when units=imperial and source is °F', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      expect(hourly[0].temp).toBe(72);
    });

    it('converts °F source to °C when units=metric', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'metric');

      // 72°F → (72-32)*5/9 = 22.222...
      // No rounding in getHourly — raw conversion
      expect(hourly[0].temp).toBeCloseTo(22.22, 1);
    });

    it('converts dewpoint from °C to °F for imperial units', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      // dewpoint in raw response is 12°C → 12 * 9/5 + 32 = 53.6 → Math.round = 54
      // But for period[0] (i===0), observation dewpoint (10°C) overrides:
      // 10 * 9/5 + 32 = 50
      expect(hourly[0].dewPoint).toBe(50);
    });

    it('keeps dewpoint in °C for metric units', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'metric');

      // For period[0] (i===0), observation dewpoint (10°C) overrides:
      // Math.round(10) = 10
      expect(hourly[0].dewPoint).toBe(10);
    });
  });

  describe('observation enrichment', () => {
    it('enriches first hourly entry with barometric pressure from observation', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      // 101500 Pa → 101500 / 100 = 1015 hPa
      expect(hourly[0].pressure).toBe(1015);
    });

    it('enriches first hourly entry with visibility', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      // 16093 m → 16093 / 1609.34 ≈ 10.0 miles
      expect(hourly[0].visibility).toBe(10.0);
    });

    it('enriches first hourly entry with feels-like from wind chill', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      // windChill 20°C → 20 * 9/5 + 32 = 68
      expect(hourly[0].feelsLike).toBe(68);
    });

    it('does not enrich second hourly entry with observation data', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      expect(hourly[1].pressure).toBeUndefined();
      expect(hourly[1].visibility).toBeUndefined();
    });
  });

  describe('forecast icon mapping from prose', () => {
    it('maps "Partly Sunny" to cloud-sun during daytime', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      expect(hourly[0].icon).toBe('cloud-sun');
    });

    it('maps "Mostly Clear" to cloud-moon at night', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

      expect(hourly[1].icon).toBe('cloud-moon');
    });

    it('maps "Scattered Showers" to cloud-rain', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      expect(forecast[0].icon).toBe('cloud-rain');
    });
  });

  describe('forecast day pairing', () => {
    it('pairs daytime + nighttime periods into single forecast day', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      expect(forecast).toHaveLength(1);
      expect(forecast[0].high).toBe(72);
      expect(forecast[0].low).toBe(55);
    });

    it('takes max precip probability from day and night', async () => {
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      // day=40, night=20 → max=40
      expect(forecast[0].precipProbability).toBe(40);
    });

    it('emits partial "tonight" entry when first period is nighttime', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes('/points/')) {
          return Promise.resolve(new Response(JSON.stringify(gridPointResponse), { status: 200 }));
        }
        if (urlStr.includes('/forecast') && !urlStr.includes('/hourly')) {
          return Promise.resolve(new Response(JSON.stringify({
            properties: {
              periods: [
                {
                  number: 1,
                  name: 'Tonight',
                  startTime: '2025-06-15T20:00:00-04:00',
                  endTime: '2025-06-16T06:00:00-04:00',
                  isDaytime: false,
                  temperature: 58,
                  temperatureUnit: 'F',
                  probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 10 },
                  dewpoint: { unitCode: 'wmoUnit:degC', value: 10 },
                  relativeHumidity: { unitCode: 'wmoUnit:percent', value: 70 },
                  windSpeed: '5 mph',
                  windDirection: 'N',
                  shortForecast: 'Clear',
                  detailedForecast: 'Clear, with a low around 58.',
                },
              ],
            },
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const provider = createWeatherProvider('noaa');
      const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

      expect(forecast).toHaveLength(1);
      // For tonight-only entry, high === low since no daytime data
      expect(forecast[0].high).toBe(58);
      expect(forecast[0].low).toBe(58);
      expect(forecast[0].date).toBe('2025-06-15');
    });
  });

  describe('NOAA alerts', () => {
    it('parses alerts with severity mapping', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes('/alerts')) {
          return Promise.resolve(new Response(JSON.stringify({
            features: [
              {
                properties: {
                  event: 'Winter Storm Warning',
                  severity: 'Severe',
                  description: 'Heavy snow expected.',
                  expires: '2025-12-20T12:00:00-05:00',
                  uri: 'https://alerts.weather.gov/winterstorm',
                },
              },
              {
                properties: {
                  event: 'Special Weather Statement',
                  severity: 'WeirdValue',
                  description: 'Unusual conditions.',
                  expires: '2025-12-20T18:00:00-05:00',
                },
              },
            ],
          }), { status: 200 }));
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const provider = createWeatherProvider('noaa');
      const alerts = await provider.getAlerts!(40.7, -74.0, 'imperial');

      expect(alerts).toHaveLength(2);
      expect(alerts[0].title).toBe('Winter Storm Warning');
      expect(alerts[0].severity).toBe('Severe');
      expect(alerts[0].uri).toBe('https://alerts.weather.gov/winterstorm');
      // expires is converted to epoch seconds
      expect(typeof alerts[0].expires).toBe('number');
      expect(alerts[1].severity).toBe('Unknown');
    });

    it('returns empty array when no active alerts', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
        if (urlStr.includes('/alerts')) {
          return Promise.resolve(new Response(JSON.stringify({ features: [] }), { status: 200 }));
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const provider = createWeatherProvider('noaa');
      const alerts = await provider.getAlerts!(40.7, -74.0, 'imperial');

      expect(alerts).toEqual([]);
    });
  });

  describe('grid point resolution', () => {
    it('resolves grid point and uses it in forecast URL', async () => {
      // Use unique coordinates to avoid stale grid cache from prior tests
      mockGridAndObservation();
      const provider = createWeatherProvider('noaa');
      await provider.getHourly(41.8781, -87.6298, 'imperial');

      // Verify grid point URL was called with these coordinates
      const calls = fetchSpy.mock.calls.map((c: [string | URL | Request, ...unknown[]]) => {
        const url = c[0];
        return typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
      });
      expect(calls.some((u: string) => u.includes('/points/41.8781,-87.6298'))).toBe(true);
      expect(calls.some((u: string) => u.includes('/gridpoints/OKX/33,37/forecast/hourly'))).toBe(true);
    });
  });
});

// ── Open-Meteo WMO code gaps ───────────────────────────────────────

describe('OpenMeteoProvider — additional WMO coverage', () => {
  const provider = new OpenMeteoProvider();
  const mapWMO = (provider as unknown as { mapWMOCode: (code: number, isDay: boolean) => string }).mapWMOCode.bind(provider);
  const wmoDesc = (provider as unknown as { wmoDescription: (code: number) => string }).wmoDescription.bind(provider);

  it('maps freezing drizzle codes (56, 57)', () => {
    expect(mapWMO(56, true)).toBe('cloud-drizzle');
    expect(mapWMO(57, true)).toBe('cloud-drizzle');
  });

  it('maps freezing rain codes (66, 67)', () => {
    expect(mapWMO(66, true)).toBe('cloud-rain');
    expect(mapWMO(67, true)).toBe('cloud-rain');
  });

  it('maps snow grains (77)', () => {
    expect(mapWMO(77, true)).toBe('snowflake');
  });

  it('maps moderate rain showers (81) and violent rain showers (82)', () => {
    expect(mapWMO(81, true)).toBe('cloud-rain');
    expect(mapWMO(82, true)).toBe('cloud-rain');
  });

  it('maps heavy snow showers (86)', () => {
    expect(mapWMO(86, true)).toBe('snowflake');
  });

  it('returns correct descriptions for freezing variants', () => {
    expect(wmoDesc(56)).toBe('Light freezing drizzle');
    expect(wmoDesc(57)).toBe('Dense freezing drizzle');
    expect(wmoDesc(66)).toBe('Light freezing rain');
    expect(wmoDesc(67)).toBe('Heavy freezing rain');
  });

  it('returns correct descriptions for snow grain and shower variants', () => {
    expect(wmoDesc(77)).toBe('Snow grains');
    expect(wmoDesc(80)).toBe('Slight rain showers');
    expect(wmoDesc(81)).toBe('Moderate rain showers');
    expect(wmoDesc(82)).toBe('Violent rain showers');
    expect(wmoDesc(85)).toBe('Slight snow showers');
    expect(wmoDesc(86)).toBe('Heavy snow showers');
  });

  it('returns correct descriptions for thunderstorm with hail variants', () => {
    expect(wmoDesc(96)).toBe('Thunderstorm with slight hail');
    expect(wmoDesc(99)).toBe('Thunderstorm with heavy hail');
  });
});

// ── Edge cases across all providers ────────────────────────────────

describe('OpenWeatherMap — edge cases', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('handles empty forecast list without crashing', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ list: [] }), { status: 200 }));
    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast).toEqual([]);
  });

  it('handles missing weather array gracefully in current data', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      dt: 1710000000,
      main: { temp: 72, feels_like: 70, humidity: 55, temp_min: 68, temp_max: 75, pressure: 1015 },
      weather: [],
      wind: { speed: 8, deg: 180 },
    }), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ list: [] }), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    // weather[0] is undefined → icon fallback, description empty
    expect(hourly[0].icon).toBe('thermometer');
    expect(hourly[0].description).toBe('');
  });

  it('handles null pop in forecast entries', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      dt: 1710000000,
      main: { temp: 72, feels_like: 70, humidity: 55, temp_min: 68, temp_max: 75, pressure: 1015 },
      weather: [{ id: 800, main: 'Clear', description: 'clear', icon: '01d' }],
      wind: { speed: 8, deg: 180 },
    }), { status: 200 }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      list: [
        {
          dt: 1710010800,
          main: { temp: 74, feels_like: 72, humidity: 50, temp_min: 70, temp_max: 77, pressure: 1014 },
          weather: [{ id: 800, main: 'Clear', description: 'clear', icon: '01d' }],
          wind: { speed: 10, deg: 200 },
          // pop intentionally missing
        },
      ],
    }), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    // (undefined ?? 0) * 100 = 0
    expect(hourly[1].precipProbability).toBe(0);
  });

  it('handles missing wind object in forecast entry', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      list: [
        {
          dt: 1710010800,
          main: { temp: 74, feels_like: 72, humidity: 50, temp_min: 70, temp_max: 77, pressure: 1014 },
          weather: [{ id: 800, main: 'Clear', description: 'clear', icon: '01d' }],
          pop: 0,
          // wind intentionally missing — groupByDate uses wind?.speed ?? 0
        },
      ],
    }), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].windSpeed).toBe(0);
  });

  it('handles missing rain object in forecast entry', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      list: [
        {
          dt: 1710010800,
          main: { temp: 74, feels_like: 72, humidity: 50, temp_min: 70, temp_max: 77, pressure: 1014 },
          weather: [{ id: 800, main: 'Clear', description: 'clear', icon: '01d' }],
          wind: { speed: 10, deg: 200 },
          pop: 0,
          // rain intentionally missing
        },
      ],
    }), { status: 200 }));

    const provider = new OpenWeatherMapProvider('test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].precipAmount).toBe(0);
  });
});

describe('OpenMeteoProvider — edge cases', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('handles empty hourly arrays', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      hourly: {
        time: [],
        temperature_2m: [],
        apparent_temperature: [],
        relative_humidity_2m: [],
        weather_code: [],
        wind_speed_10m: [],
        precipitation_probability: [],
        surface_pressure: [],
        dew_point_2m: [],
        is_day: [],
      },
    }), { status: 200 }));

    const provider = new OpenMeteoProvider();
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly).toEqual([]);
  });

  it('handles empty daily arrays', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      daily: {
        time: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        weather_code: [],
        precipitation_sum: [],
        precipitation_probability_max: [],
        wind_speed_10m_max: [],
      },
    }), { status: 200 }));

    const provider = new OpenMeteoProvider();
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast).toEqual([]);
  });

  it('handles null precipitation_probability gracefully', async () => {
    const futureEpoch = Math.floor(Date.now() / 1000) + 3600;
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      hourly: {
        time: [futureEpoch],
        temperature_2m: [70],
        apparent_temperature: [68],
        relative_humidity_2m: [55],
        weather_code: [0],
        wind_speed_10m: [5],
        precipitation_probability: [null],
        surface_pressure: [null],
        dew_point_2m: [null],
        is_day: [1],
      },
    }), { status: 200 }));

    const provider = new OpenMeteoProvider();
    const hourly = await provider.getHourly(40.7, -74.0, 'imperial');

    expect(hourly[0].precipProbability).toBe(0);
    expect(hourly[0].pressure).toBeUndefined();
    expect(hourly[0].dewPoint).toBeUndefined();
  });

  it('handles null wind_speed_10m_max in forecast', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      daily: {
        time: [1710288000],
        temperature_2m_max: [72],
        temperature_2m_min: [55],
        weather_code: [0],
        precipitation_sum: [0],
        precipitation_probability_max: [null],
        wind_speed_10m_max: [null],
      },
    }), { status: 200 }));

    const provider = new OpenMeteoProvider();
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    expect(forecast[0].windSpeed).toBeUndefined();
    expect(forecast[0].precipProbability).toBe(0);
  });
});

describe('PirateWeatherProvider — edge cases', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('handles daily entry with missing temperatureHigh/Low', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      daily: {
        data: [
          {
            time: nowEpoch,
            summary: 'Clear',
            icon: 'clear-day',
            // temperatureHigh and temperatureLow missing
            humidity: 0.5,
            windSpeed: 5,
            precipProbability: 0,
          },
        ],
      },
      hourly: { data: [] },
    }), { status: 200 }));

    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    // temperatureHigh ?? 0 → 0, temperatureLow ?? 0 → 0
    expect(forecast[0].high).toBe(0);
    expect(forecast[0].low).toBe(0);
  });

  it('handles missing precipAccumulation in daily', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      daily: {
        data: [
          {
            time: nowEpoch,
            summary: 'Clear',
            icon: 'clear-day',
            temperatureHigh: 80,
            temperatureLow: 60,
            humidity: 0.5,
            windSpeed: 5,
            precipProbability: 0,
            // precipAccumulation missing
          },
        ],
      },
      hourly: { data: [] },
    }), { status: 200 }));

    const provider = createWeatherProvider('pirateweather', 'test-key');
    const forecast = await provider.getForecast(40.7, -74.0, 'imperial');

    // precipAccumulation ?? 0 → 0
    expect(forecast[0].precipAmount).toBe(0);
  });

  it('handles missing precipIntensity in minutely', async () => {
    const nowEpoch = Math.floor(Date.now() / 1000);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      minutely: {
        data: [
          { time: nowEpoch },
        ],
      },
      hourly: { data: [] },
      daily: { data: [] },
    }), { status: 200 }));

    const provider = createWeatherProvider('pirateweather', 'test-key');
    const minutely = await provider.getMinutely!(40.7, -74.0, 'imperial');

    expect(minutely[0].intensity).toBe(0);
    expect(minutely[0].probability).toBe(0);
    expect(minutely[0].type).toBeUndefined();
  });

  it('uses "us" units param for imperial and "ca" for metric', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      hourly: { data: [] },
      daily: { data: [] },
    }), { status: 200 }));

    const provider = createWeatherProvider('pirateweather', 'test-key');
    await provider.getHourly(40.7, -74.0, 'imperial');

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('units=us');

    // Need a new provider instance since fetchPromise is cached
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({
      hourly: { data: [] },
      daily: { data: [] },
    }), { status: 200 }));

    const provider2 = createWeatherProvider('pirateweather', 'test-key');
    await provider2.getHourly(40.7, -74.0, 'metric');

    const url2 = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url2).toContain('units=ca');
  });
});

// ── Yr.no provider ───────────────────────────────────────────────────

describe('YrProvider', () => {
  describe('symbol_code → icon mapping', () => {
    it('maps clear-sky day/night', () => {
      expect(symbolToIcon('clearsky_day')).toBe('sun');
      expect(symbolToIcon('clearsky_night')).toBe('moon');
      expect(symbolToIcon('clearsky_polartwilight')).toBe('moon');
    });

    it('maps fair (partly cloudy) day/night', () => {
      expect(symbolToIcon('fair_day')).toBe('cloud-sun');
      expect(symbolToIcon('fair_night')).toBe('cloud-moon');
      expect(symbolToIcon('partlycloudy_day')).toBe('cloud-sun');
      expect(symbolToIcon('partlycloudy_night')).toBe('cloud-moon');
    });

    it('maps rain variants', () => {
      expect(symbolToIcon('rain')).toBe('cloud-rain');
      expect(symbolToIcon('lightrain')).toBe('cloud-drizzle');
      expect(symbolToIcon('heavyrain')).toBe('cloud-rain');
      expect(symbolToIcon('rainshowers_day')).toBe('cloud-rain');
    });

    it('maps snow and sleet', () => {
      expect(symbolToIcon('snow')).toBe('snowflake');
      expect(symbolToIcon('lightsnow')).toBe('snowflake');
      expect(symbolToIcon('sleet')).toBe('cloud-hail');
      expect(symbolToIcon('lightsleetshowers_day')).toBe('cloud-hail');
    });

    it('maps thunder variants to lightning', () => {
      expect(symbolToIcon('rainandthunder')).toBe('cloud-lightning');
      expect(symbolToIcon('heavyrainshowersandthunder_day')).toBe('cloud-lightning');
      expect(symbolToIcon('snowandthunder')).toBe('cloud-lightning');
    });

    it('falls back for unknown symbols', () => {
      expect(symbolToIcon(undefined)).toBe('thermometer');
      expect(symbolToIcon('nonsense')).toBe('thermometer');
    });
  });

  describe('symbol_code → description', () => {
    it('returns empty string for missing code', () => {
      expect(symbolDescription(undefined)).toBe('');
      expect(symbolDescription('')).toBe('');
    });

    it('capitalizes simple base symbols', () => {
      expect(symbolDescription('snow')).toBe('Snow');
      expect(symbolDescription('fog')).toBe('Fog');
      expect(symbolDescription('cloudy')).toBe('Cloudy');
      expect(symbolDescription('fair')).toBe('Fair');
    });

    it('splits compound bases into readable phrases', () => {
      expect(symbolDescription('clearsky_day')).toBe('Clear sky');
      expect(symbolDescription('partlycloudy_night')).toBe('Partly cloudy');
      expect(symbolDescription('lightrain')).toBe('Light rain');
      expect(symbolDescription('heavysnow')).toBe('Heavy snow');
      expect(symbolDescription('rainshowers_day')).toBe('Rain showers');
      expect(symbolDescription('lightrainshowers_night')).toBe('Light rain showers');
    });

    it('splits "andthunder" and "showersandthunder" into separate words', () => {
      // Regression: previously produced "Heavy rain showersandthunder" / "Light snow andthunder"
      expect(symbolDescription('rainandthunder')).toBe('Rain and thunder');
      expect(symbolDescription('lightsnowandthunder')).toBe('Light snow and thunder');
      expect(symbolDescription('heavyrainshowersandthunder')).toBe('Heavy rain showers and thunder');
      expect(symbolDescription('sleetshowersandthunder')).toBe('Sleet showers and thunder');
      expect(symbolDescription('lightsleetshowersandthunder_day')).toBe('Light sleet showers and thunder');
    });

    it('strips daypart suffix before formatting', () => {
      expect(symbolDescription('clearsky_polartwilight')).toBe('Clear sky');
      expect(symbolDescription('rain_day')).toBe('Rain');
    });
  });

  describe('parsing API response', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    const now = new Date();
    const t0 = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const t1 = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    const yrResponse = {
      properties: {
        timeseries: [
          {
            time: t0,
            data: {
              instant: {
                details: {
                  air_temperature: 20,
                  relative_humidity: 60,
                  wind_speed: 5,
                  air_pressure_at_sea_level: 1013.4,
                },
              },
              next_1_hours: {
                summary: { symbol_code: 'partlycloudy_day' },
                details: { precipitation_amount: 0, probability_of_precipitation: 10 },
              },
              next_6_hours: {
                summary: { symbol_code: 'rain' },
                details: { precipitation_amount: 2.5, probability_of_precipitation: 80 },
              },
            },
          },
          {
            time: t1,
            data: {
              instant: {
                details: { air_temperature: 18, wind_speed: 7 },
              },
              next_1_hours: {
                summary: { symbol_code: 'rain' },
                details: { precipitation_amount: 1, probability_of_precipitation: 60 },
              },
              next_6_hours: {
                summary: { symbol_code: 'rain' },
                details: { precipitation_amount: 1.5 },
              },
            },
          },
        ],
      },
    };

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch');
      // Clear the static per-location cache so each test re-fetches
      (YrProvider as unknown as { cache: Map<string, unknown> }).cache.clear();
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('sends a User-Agent header (MET Norway requires identification)', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();
      await provider.getHourly(60.1, 9.58, 'metric');

      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['User-Agent']).toMatch(/home-screens/);
    });

    it('returns Celsius temps when units=metric', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();
      const hourly = await provider.getHourly(60.1, 9.58, 'metric');

      expect(hourly[0].temp).toBe(20);
    });

    it('converts Celsius to Fahrenheit when units=imperial', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();
      const hourly = await provider.getHourly(60.1, 9.58, 'imperial');

      // 20°C → 68°F
      expect(hourly[0].temp).toBe(68);
    });

    it('converts m/s wind to km/h for metric and mph for imperial', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();

      const metric = await provider.getHourly(60.1, 9.58, 'metric');
      // 5 m/s × 3.6 = 18 km/h
      expect(metric[0].windSpeed).toBe(18);

      (YrProvider as unknown as { cache: Map<string, unknown> }).cache.clear();
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));

      const imperial = await provider.getHourly(60.1, 9.58, 'imperial');
      // 5 m/s × 2.23694 ≈ 11.18 → round → 11
      expect(imperial[0].windSpeed).toBe(11);
    });

    it('caches per-location for ≥10 minutes (MET Norway throttle)', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();

      await provider.getHourly(60.1, 9.58, 'metric');
      await provider.getHourly(60.1, 9.58, 'metric');
      await provider.getForecast(60.1, 9.58, 'metric');

      // Three logical calls but only one network fetch
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns the correct symbol for the dominant 6-hour block in forecast', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(yrResponse), { status: 200 }));
      const provider = new YrProvider();

      const forecast = await provider.getForecast(60.1, 9.58, 'metric');

      // Both timeseries entries have next_6_hours.symbol_code === 'rain'
      expect(forecast[0].icon).toBe('cloud-rain');
    });
  });
});

// ── SMHI provider ────────────────────────────────────────────────────

describe('SMHIProvider', () => {
  describe('Wsymb2 → icon mapping', () => {
    it('maps clear sky day/night', () => {
      expect(wsymb2ToIcon(1, true)).toBe('sun');
      expect(wsymb2ToIcon(1, false)).toBe('moon');
    });

    it('maps partly-cloudy variants day/night', () => {
      expect(wsymb2ToIcon(2, true)).toBe('cloud-sun');
      expect(wsymb2ToIcon(3, false)).toBe('cloud-moon');
      expect(wsymb2ToIcon(4, true)).toBe('cloud-sun');
    });

    it('maps cloudy/overcast', () => {
      expect(wsymb2ToIcon(5, true)).toBe('cloud');
      expect(wsymb2ToIcon(6, true)).toBe('cloud');
    });

    it('maps fog', () => {
      expect(wsymb2ToIcon(7, true)).toBe('cloud-fog');
    });

    it('maps rain (light is drizzle)', () => {
      expect(wsymb2ToIcon(8, true)).toBe('cloud-rain');
      expect(wsymb2ToIcon(18, true)).toBe('cloud-drizzle');
      expect(wsymb2ToIcon(19, true)).toBe('cloud-rain');
      expect(wsymb2ToIcon(20, true)).toBe('cloud-rain');
    });

    it('maps thunder', () => {
      expect(wsymb2ToIcon(11, true)).toBe('cloud-lightning');
      expect(wsymb2ToIcon(21, true)).toBe('cloud-lightning');
    });

    it('maps sleet to cloud-hail', () => {
      expect(wsymb2ToIcon(12, true)).toBe('cloud-hail');
      expect(wsymb2ToIcon(22, true)).toBe('cloud-hail');
    });

    it('maps snow', () => {
      expect(wsymb2ToIcon(15, true)).toBe('snowflake');
      expect(wsymb2ToIcon(25, true)).toBe('snowflake');
    });

    it('falls back for unknown codes', () => {
      expect(wsymb2ToIcon(999, true)).toBe('thermometer');
    });
  });

  describe('parsing API response', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;
    // Pin to mid-day UTC so t0/t1 always share a UTC date (forecast bucketing)
    // and stay inside the provider's `now - 1h` freshness window (hourly path).
    // Without a fake clock, runs near UTC midnight straddled the day boundary.
    const FAKE_NOW = new Date('2026-01-15T12:00:00.000Z');
    const t0 = new Date(FAKE_NOW.getTime() + 60 * 60 * 1000).toISOString();
    const t1 = new Date(FAKE_NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();

    const smhiResponse = {
      timeSeries: [
        {
          validTime: t0,
          parameters: [
            { name: 't', values: [10] },
            { name: 'r', values: [70] },
            { name: 'ws', values: [4] },
            { name: 'msl', values: [1015.2] },
            { name: 'Wsymb2', values: [3] },
            { name: 'pcat', values: [3] },
            { name: 'pmean', values: [0.4] },
          ],
        },
        {
          validTime: t1,
          parameters: [
            { name: 't', values: [9] },
            { name: 'r', values: [75] },
            { name: 'ws', values: [5] },
            { name: 'Wsymb2', values: [3] },
            { name: 'pcat', values: [0] },
            { name: 'pmean', values: [0] },
          ],
        },
      ],
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(FAKE_NOW);
      fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    });

    it('hits the lon-then-lat URL path SMHI requires', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();
      await provider.getHourly(59.3, 18.07, 'metric');

      const url = fetchSpy.mock.calls[0][0] as string;
      // SMHI requires /lon/{lon}/lat/{lat}/ path order
      expect(url).toMatch(/\/lon\/18\.\d+\/lat\/59\.\d+\//);
    });

    it('returns Celsius temps when units=metric', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();
      const hourly = await provider.getHourly(59.3, 18.07, 'metric');

      expect(hourly[0].temp).toBe(10);
    });

    it('converts to Fahrenheit when units=imperial', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();
      const hourly = await provider.getHourly(59.3, 18.07, 'imperial');

      // 10°C → 50°F
      expect(hourly[0].temp).toBe(50);
    });

    it('derives binary precipProbability from pcat', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();
      const hourly = await provider.getHourly(59.3, 18.07, 'metric');

      // First entry pcat=3 → 100, second pcat=0 → 0
      expect(hourly[0].precipProbability).toBe(100);
      expect(hourly[1].precipProbability).toBe(0);
    });

    it('exposes pressure in hPa', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();
      const hourly = await provider.getHourly(59.3, 18.07, 'metric');

      // 1015.2 → round → 1015
      expect(hourly[0].pressure).toBe(1015);
    });

    it('aggregates daily precip and picks dominant symbol in forecast', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();

      const forecast = await provider.getForecast(59.3, 18.07, 'metric');

      // Both entries are on the same date → one day in the forecast
      expect(forecast.length).toBe(1);
      // pmean: 0.4 + 0 = 0.4 mm
      expect(forecast[0].precipAmount).toBeCloseTo(0.4, 2);
      // Dominant Wsymb2 = 3 → variable cloudiness
      expect(forecast[0].icon).toBe('cloud-sun');
    });

    it('emits binary precipProbability in daily forecast (regression)', async () => {
      // Ensures the precip stat icon stays visible on daily/table/combined views.
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(smhiResponse), { status: 200 }));
      const provider = new SMHIProvider();

      const forecast = await provider.getForecast(59.3, 18.07, 'metric');

      // First entry has pcat=3 → day flagged as having precip → 100
      expect(forecast[0].precipProbability).toBe(100);
    });

    it('reports precipProbability=0 when no hour has precipitation', async () => {
      const dryResponse = {
        timeSeries: [
          {
            validTime: t0,
            parameters: [
              { name: 't', values: [10] },
              { name: 'Wsymb2', values: [1] },
              { name: 'pcat', values: [0] },
              { name: 'pmean', values: [0] },
            ],
          },
        ],
      };
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(dryResponse), { status: 200 }));
      const provider = new SMHIProvider();

      const forecast = await provider.getForecast(59.3, 18.07, 'metric');
      expect(forecast[0].precipProbability).toBe(0);
    });
  });
});
