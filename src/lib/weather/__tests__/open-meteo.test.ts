import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenMeteoProvider } from '../open-meteo';

// Open-Meteo returns parallel arrays. Hourly timestamps are Unix instants;
// daily timestamps stay as location-local ISO dates so UTC conversion cannot
// move them to the previous day. Temps/wind/precip arrive in the requested unit.

const NOW = Date.parse('2026-04-18T12:00:00Z');
const T0 = Math.floor(NOW / 1000);

function mockOm(bodies: { hourly?: unknown; daily?: unknown }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    const body = url.includes('daily=') ? { daily: bodies.daily } : { hourly: bodies.hourly };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

describe('OpenMeteoProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
  });

  it('getHourly maps a WMO code to a day/night icon and rounds pressure/dewpoint', async () => {
    spy = mockOm({
      hourly: {
        time: [T0, T0 + 3600],
        temperature_2m: [12, 13],
        apparent_temperature: [10, 11],
        relative_humidity_2m: [60, 58],
        weather_code: [0, 61],
        wind_speed_10m: [18, 20],
        wind_direction_10m: [200, 215],
        wind_gusts_10m: [31, 36],
        precipitation_probability: [10, 55],
        pressure_msl: [1012.4, 1011.6],
        dew_point_2m: [5.3, 5.8],
        is_day: [1, 1],
      },
    });

    const out = await new OpenMeteoProvider().getHourly(44.71, -93.42, 'metric');
    const requestUrl = new URL(String(spy.mock.calls[0][0]));

    // Direction and gusts are asked for beside the speed; the one
    // wind_speed_unit covers speed and gusts alike.
    expect(requestUrl.searchParams.get('hourly')).toContain('wind_speed_10m,wind_direction_10m,wind_gusts_10m');
    expect(requestUrl.searchParams.get('wind_speed_unit')).toBe('kmh');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00.000Z',
      temp: 12,
      feelsLike: 10,
      humidity: 60,
      icon: 'sun', // WMO 0, is_day=1
      description: 'Clear sky',
      windSpeed: 18,
      windDirection: 200,
      windGust: 31, // already km/h, like windSpeed
      precipProbability: 10,
      pressure: 1012, // rounded
      dewPoint: 5, // rounded
    });
    expect(out[1].icon).toBe('cloud-rain'); // WMO 61
    expect(out[1].description).toBe('Slight rain');
    expect(out[1]).toMatchObject({ windDirection: 215, windGust: 36 });
  });

  it('getHourly asks for mph gusts in imperial and leaves absent wind arrays unsaid', async () => {
    spy = mockOm({
      hourly: {
        time: [T0], temperature_2m: [54], apparent_temperature: [50], relative_humidity_2m: [60],
        weather_code: [0], wind_speed_10m: [11], precipitation_probability: [0],
        pressure_msl: [1015], dew_point_2m: [41], is_day: [1],
      },
    });
    const out = await new OpenMeteoProvider().getHourly(44.71, -93.42, 'imperial');
    const requestUrl = new URL(String(spy.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('wind_speed_unit')).toBe('mph');
    expect(out[0].windDirection).toBeUndefined();
    expect(out[0].windGust).toBeUndefined();
  });

  it('getHourly picks the night icon variant when is_day=0', async () => {
    spy = mockOm({
      hourly: {
        time: [T0], temperature_2m: [8], apparent_temperature: [6], relative_humidity_2m: [70],
        weather_code: [0], wind_speed_10m: [5], precipitation_probability: [0],
        pressure_msl: [1015], dew_point_2m: [3], is_day: [0],
      },
    });
    const out = await new OpenMeteoProvider().getHourly(44.71, -93.42, 'metric');
    expect(out[0].icon).toBe('moon');
  });

  it('getHourly drops entries older than one hour', async () => {
    spy = mockOm({
      hourly: {
        time: [T0 - 7200, T0], temperature_2m: [1, 12], apparent_temperature: [0, 10],
        relative_humidity_2m: [90, 60], weather_code: [3, 0], wind_speed_10m: [2, 18],
        precipitation_probability: [0, 10], pressure_msl: [1000, 1012], dew_point_2m: [0, 5], is_day: [1, 1],
      },
    });
    const out = await new OpenMeteoProvider().getHourly(44.71, -93.42, 'metric');
    expect(out).toHaveLength(1);
    expect(out[0].temp).toBe(12);
  });

  it('getForecast maps daily arrays, rounding temps and wind', async () => {
    spy = mockOm({
      daily: {
        time: ['2026-04-18', '2026-04-19'],
        temperature_2m_max: [15.6, 18.2],
        temperature_2m_min: [4.3, 6.9],
        weather_code: [95, 71],
        precipitation_sum: [3.2, 0],
        precipitation_probability_max: [80, 20],
        wind_speed_10m_max: [24.4, 30.7],
      },
    });

    const out = await new OpenMeteoProvider().getForecast(44.71, -93.42, 'metric');
    const requestUrl = new URL(String(spy.mock.calls[0][0]));

    expect(out).toHaveLength(2);
    expect(requestUrl.searchParams.get('timeformat')).toBeNull();
    expect(requestUrl.searchParams.get('timezone')).toBe('auto');
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 16, // round(15.6)
      low: 4, // round(4.3)
      icon: 'cloud-lightning', // WMO 95
      description: 'Thunderstorm',
      precipProbability: 80,
      precipAmount: 3.2,
      windSpeed: 24, // round(24.4)
    });
    expect(out[1].icon).toBe('snowflake'); // WMO 71
  });
});
