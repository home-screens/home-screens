import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SMHIProvider, wsymb2ToIcon } from '../smhi';

// SMHI returns a `timeSeries` in SI units (°C, m/s) with numeric symbol codes
// (1–27). The provider converts units, resolves day/night for the clear/partial
// symbols via the UTC hour of each entry, and aggregates into daily forecasts.
// Hourly is filtered to time >= now-1h. No caching layer here.

const NOW = Date.parse('2026-04-18T12:00:00Z');

function mockSmhi(timeSeries: unknown[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ timeSeries }), { status: 200 }),
  );
}

describe('wsymb2ToIcon', () => {
  it('resolves day/night for clear and partly-cloudy codes', () => {
    expect(wsymb2ToIcon(1, true)).toBe('sun');
    expect(wsymb2ToIcon(1, false)).toBe('moon');
    expect(wsymb2ToIcon(3, true)).toBe('cloud-sun');
    expect(wsymb2ToIcon(3, false)).toBe('cloud-moon');
  });

  it('maps precipitation and unknown codes', () => {
    expect(wsymb2ToIcon(7, true)).toBe('cloud-fog');
    expect(wsymb2ToIcon(11, true)).toBe('cloud-lightning');
    expect(wsymb2ToIcon(15, true)).toBe('snowflake');
    expect(wsymb2ToIcon(99, true)).toBe('thermometer');
  });
});

describe('SMHIProvider', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  let nowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    spy?.mockRestore();
    nowSpy?.mockRestore();
  });

  it('getHourly converts units, resolves the daytime icon, and maps the description', async () => {
    spy = mockSmhi([
      {
        time: '2026-04-18T12:00:00Z', // UTC hour 12 → daytime
        data: {
          air_temperature: 14,
          relative_humidity: 58,
          wind_speed: 5,
          air_pressure_at_mean_sea_level: 1010.7,
          symbol_code: 1,
          precipitation_amount_mean: 0,
          probability_of_precipitation: 5,
        },
      },
    ]);

    const out = await new SMHIProvider().getHourly(59.33, 18.06, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      time: '2026-04-18T12:00:00Z',
      temp: 14,
      humidity: 58,
      icon: 'sun', // symbol 1, daytime
      description: 'Clear sky',
      windSpeed: 18, // round(5 * 3.6)
      precipProbability: 5,
      pressure: 1011, // rounded
    });
  });

  it('getHourly resolves the night icon variant for a nighttime UTC hour', async () => {
    spy = mockSmhi([
      { time: '2026-04-18T22:00:00Z', data: { air_temperature: 6, symbol_code: 1 } }, // hour 22 → night
    ]);
    const out = await new SMHIProvider().getHourly(59.33, 18.06, 'metric');
    expect(out[0].icon).toBe('moon');
  });

  it('getHourly falls back when symbol_code is missing', async () => {
    spy = mockSmhi([
      { time: '2026-04-18T12:00:00Z', data: { air_temperature: 10 } },
    ]);
    const out = await new SMHIProvider().getHourly(59.33, 18.06, 'metric');
    expect(out[0].icon).toBe('thermometer');
    expect(out[0].description).toBe('Unknown');
  });

  it('getHourly converts temperature to °F and wind to mph in imperial', async () => {
    spy = mockSmhi([
      { time: '2026-04-18T12:00:00Z', data: { air_temperature: 0, wind_speed: 10, symbol_code: 5 } },
    ]);
    const out = await new SMHIProvider().getHourly(59.33, 18.06, 'imperial');
    expect(out[0].temp).toBe(32);
    expect(out[0].windSpeed).toBe(22); // round(10 * 2.23694)
  });

  it('getForecast aggregates the timeseries into a daily high/low and dominant symbol', async () => {
    spy = mockSmhi([
      { time: '2026-04-18T06:00:00Z', data: { air_temperature: 5, relative_humidity: 72, wind_speed: 4, symbol_code: 5, precipitation_amount_mean: 0.4, probability_of_precipitation: 15 } },
      { time: '2026-04-18T12:00:00Z', data: { air_temperature: 13, relative_humidity: 55, wind_speed: 6, symbol_code: 5, precipitation_amount_mean: 0.6, probability_of_precipitation: 35 } },
    ]);

    const out = await new SMHIProvider().getForecast(59.33, 18.06, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 13,
      low: 5,
      icon: 'cloud', // symbol 5
      description: 'Cloudy sky',
      precipProbability: 35, // max
      precipAmount: 1, // 0.4 + 0.6 mm
    });
  });
});
