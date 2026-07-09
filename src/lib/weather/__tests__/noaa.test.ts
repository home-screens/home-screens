import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NOAAProvider } from '../noaa';

// NOAA/NWS is a multi-hop API: /points → gridpoints forecast(+hourly) and,
// for observations, observationStations → stations/<id>/observations/latest.
// Temperatures arrive in F or C (temperatureUnit), wind as an English string
// ("10 mph", "Calm"), and icons are inferred from the shortForecast text.

const NOW = Date.parse('2026-04-18T12:00:00Z');

const POINT = {
  properties: {
    gridId: 'TOP',
    gridX: 31,
    gridY: 80,
    observationStations: 'https://api.weather.gov/gridpoints/TOP/31,80/stations',
    timeZone: 'America/Chicago',
  },
};

function route(url: string, bodies: Record<string, unknown>): unknown {
  if (url.includes('/points/')) return bodies.point ?? POINT;
  if (url.endsWith('/forecast/hourly')) return bodies.hourly;
  if (url.endsWith('/forecast')) return bodies.daily;
  if (url.endsWith('/stations')) return bodies.stations;
  if (url.includes('/observations/latest')) return bodies.observation;
  if (url.includes('/alerts/active')) return bodies.alerts;
  return {};
}

function mockNoaa(bodies: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    return new Response(JSON.stringify(route(url, bodies)), { status: 200 });
  });
}

function clearGridCache() {
  // @ts-expect-error - private static cache, intentionally reached in tests
  NOAAProvider.gridCache?.clear();
}

describe('NOAAProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    clearGridCache();
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
    clearGridCache();
  });

  it('getHourly converts F→C in metric, parses wind, and infers the icon from text', async () => {
    spy = mockNoaa({
      hourly: {
        properties: {
          periods: [
            {
              number: 1,
              name: '',
              startTime: '2026-04-18T12:00:00+00:00',
              endTime: '2026-04-18T13:00:00+00:00',
              isDaytime: true,
              temperature: 50, // °F
              temperatureUnit: 'F',
              probabilityOfPrecipitation: { unitCode: '', value: 30 },
              dewpoint: { unitCode: '', value: 5 }, // °C
              relativeHumidity: { unitCode: '', value: 65 },
              windSpeed: '10 mph',
              windDirection: 'N',
              shortForecast: 'Sunny',
              detailedForecast: 'Sunny skies',
            },
          ],
        },
      },
      stations: { features: [] }, // no station → skip enrichment
    });

    const out = await new NOAAProvider().getHourly(44.71, -93.42, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00+00:00',
      temp: 10, // (50-32)*5/9
      humidity: 65,
      icon: 'sun', // "Sunny", daytime
      description: 'Sunny',
      windSpeed: 16, // round(10 * 1.60934)
      precipProbability: 30,
      dewPoint: 5,
    });
  });

  it('getHourly enriches the first entry with station observations', async () => {
    spy = mockNoaa({
      hourly: {
        properties: {
          periods: [
            {
              number: 1, name: '', startTime: '2026-04-18T12:00:00+00:00', endTime: '2026-04-18T13:00:00+00:00',
              isDaytime: true, temperature: 50, temperatureUnit: 'F',
              probabilityOfPrecipitation: { unitCode: '', value: 0 },
              dewpoint: { unitCode: '', value: 5 },
              relativeHumidity: { unitCode: '', value: 65 },
              windSpeed: 'Calm', windDirection: '', shortForecast: 'Clear', detailedForecast: '',
            },
          ],
        },
      },
      stations: { features: [{ properties: { stationIdentifier: 'KTOP' } }] },
      observation: {
        properties: {
          textDescription: 'Clear',
          temperature: { value: 10, unitCode: '' },
          dewpoint: { value: 4, unitCode: '' },
          relativeHumidity: { value: 60, unitCode: '' },
          windSpeed: { value: 3, unitCode: '' },
          barometricPressure: { value: 101300, unitCode: '' }, // Pa
          visibility: { value: 16000, unitCode: '' }, // m
          windChill: { value: 8, unitCode: '' }, // °C
          heatIndex: { value: null, unitCode: '' },
        },
      },
    });

    const out = await new NOAAProvider().getHourly(44.71, -93.42, 'metric');

    expect(out[0].windSpeed).toBe(0); // "Calm"
    expect(out[0].pressure).toBe(1013); // 101300 Pa → hPa
    expect(out[0].visibility).toBe(16); // 16000 m → km
    expect(out[0].feelsLike).toBe(8); // wind chill in °C
  });

  it('getForecast pairs day + night periods into a single day', async () => {
    spy = mockNoaa({
      daily: {
        properties: {
          periods: [
            {
              number: 1, name: 'Today', startTime: '2026-04-18T06:00:00+00:00', endTime: '',
              isDaytime: true, temperature: 68, temperatureUnit: 'F',
              probabilityOfPrecipitation: { unitCode: '', value: 20 },
              dewpoint: { value: null, unitCode: '' }, relativeHumidity: { value: 50, unitCode: '' },
              windSpeed: '5 to 10 mph', windDirection: 'W', shortForecast: 'Mostly Sunny', detailedForecast: 'Nice',
            },
            {
              number: 2, name: 'Tonight', startTime: '2026-04-18T18:00:00+00:00', endTime: '',
              isDaytime: false, temperature: 45, temperatureUnit: 'F',
              probabilityOfPrecipitation: { unitCode: '', value: 60 },
              dewpoint: { value: null, unitCode: '' }, relativeHumidity: { value: 70, unitCode: '' },
              windSpeed: '5 mph', windDirection: 'W', shortForecast: 'Rain Likely', detailedForecast: 'Wet',
            },
          ],
        },
      },
    });

    const out = await new NOAAProvider().getForecast(44.71, -93.42, 'imperial');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 68,
      low: 45,
      icon: 'cloud-sun', // "Mostly Sunny" daytime
      description: 'Mostly Sunny',
      detailedForecast: 'Nice',
      precipProbability: 60, // max(20, 60)
      windSpeed: 10, // max token from "5 to 10 mph", imperial mph
    });
  });

  it('getForecast emits a partial "tonight" entry when the feed leads with a night period', async () => {
    spy = mockNoaa({
      daily: {
        properties: {
          periods: [
            {
              number: 1, name: 'Tonight', startTime: '2026-04-18T18:00:00+00:00', endTime: '',
              isDaytime: false, temperature: 40, temperatureUnit: 'F',
              probabilityOfPrecipitation: { unitCode: '', value: 10 },
              dewpoint: { value: null, unitCode: '' }, relativeHumidity: { value: 70, unitCode: '' },
              windSpeed: 'Calm', windDirection: '', shortForecast: 'Clear', detailedForecast: 'Cold',
            },
          ],
        },
      },
    });

    const out = await new NOAAProvider().getForecast(44.71, -93.42, 'imperial');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: '2026-04-18', high: 40, low: 40, icon: 'moon' });
  });

  it('getAlerts normalizes severity and converts expiry to epoch seconds', async () => {
    spy = mockNoaa({
      alerts: {
        features: [
          { properties: { event: 'Tornado Warning', severity: 'Extreme', description: 'Take cover', expires: '2026-04-18T13:00:00+00:00', uri: 'https://x' } },
          { properties: { event: 'Note', severity: 'weird', description: 'n/a', expires: '2026-04-18T14:00:00+00:00' } },
        ],
      },
    });

    const out = await new NOAAProvider().getAlerts(44.71, -93.42, 'metric');
    expect(out[0]).toMatchObject({ title: 'Tornado Warning', severity: 'Extreme' });
    expect(out[0].expires).toBe(Math.floor(Date.parse('2026-04-18T13:00:00+00:00') / 1000));
    expect(out[1].severity).toBe('Unknown');
  });
});
