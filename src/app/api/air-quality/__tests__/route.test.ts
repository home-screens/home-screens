import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ error: msg }, { status });
    }),
    getLocationFromConfig: vi.fn(),
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

import { getSecret } from '@/lib/secrets';
import { getLocationFromConfig } from '@/lib/api-utils';

const mockGetSecret = vi.mocked(getSecret);
const mockGetLocation = vi.mocked(getLocationFromConfig);

const { GET, cache } = await import('@/app/api/air-quality/route');

// ── Helpers ──────────────────────────────────────────────────────────

function makeAirPollutionResponse(
  aqi: number,
  components: Record<string, number | undefined> = {},
) {
  return {
    list: [
      {
        main: { aqi },
        components: {
          pm2_5: components.pm2_5 ?? 12.5,
          pm10: components.pm10 ?? 20,
          o3: components.o3 ?? 45,
          no2: components.no2 ?? 10,
          ...components,
        },
      },
    ],
  };
}

function makeUvResponse(value: number) {
  return { value };
}

function mockFetchResponses(
  airBody: unknown,
  airOk: boolean,
  uvBody: unknown,
  uvOk: boolean,
  airStatus = 200,
) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('air_pollution')) {
      return Promise.resolve({
        ok: airOk,
        status: airStatus,
        json: async () => airBody,
      });
    }
    if (url.includes('uvi')) {
      return Promise.resolve({
        ok: uvOk,
        status: uvOk ? 200 : 500,
        json: async () => uvBody,
      });
    }
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
});

describe('GET /api/air-quality', () => {
  it('returns 400 when location is missing', async () => {
    mockGetLocation.mockResolvedValue(null);
    mockGetSecret.mockResolvedValue('test-key');

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/latitude\/longitude/i);
  });

  it('returns 400 when API key is missing but location exists', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/OpenWeatherMap API key/);
  });

  it('returns successful response with correct shape', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses(makeAirPollutionResponse(3), true, makeUvResponse(5.2), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      aqi: 3,
      pm25: 12.5,
      pm10: 20,
      o3: 45,
      no2: 10,
      uv: 5.2,
    });
  });

  it('uses correct API URLs with lat/lon/apiKey', async () => {
    mockGetLocation.mockResolvedValue({ lat: '51.5', lon: '-0.12' });
    mockGetSecret.mockResolvedValue('MY_KEY');
    mockFetchResponses(makeAirPollutionResponse(2), true, makeUvResponse(3), true);

    await GET(new NextRequest('http://localhost/api/air-quality'));

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);

    const urls = calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContainEqual(
      'https://api.openweathermap.org/data/2.5/air_pollution?lat=51.5&lon=-0.12&appid=MY_KEY',
    );
    expect(urls).toContainEqual(
      'https://api.openweathermap.org/data/2.5/uvi?lat=51.5&lon=-0.12&appid=MY_KEY',
    );
  });

  it('returns 502 when air pollution API returns non-ok status', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses({}, false, makeUvResponse(0), true, 503);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toContain('Air pollution API returned 503');
  });

  it('returns 502 when air pollution data has no list entries', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses({ list: [] }, true, makeUvResponse(0), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('No air pollution data returned');
  });

  it('gracefully degrades UV to 0 when UV endpoint fails', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses(makeAirPollutionResponse(1), true, {}, false);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.uv).toBe(0);
  });

  it('gracefully degrades UV to 0 when UV fetch rejects (timeout/network error)', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');

    // Air pollution succeeds, UV fetch rejects entirely (e.g., timeout)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('air_pollution')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => makeAirPollutionResponse(2),
        });
      }
      if (url.includes('uvi')) {
        return Promise.reject(new Error('AbortError: signal timed out'));
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.uv).toBe(0);
    expect(json.aqi).toBe(2);
  });

  it('extracts UV value when UV endpoint succeeds', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses(makeAirPollutionResponse(2), true, makeUvResponse(8.7), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(json.uv).toBe(8.7);
  });

  it('defaults component values to 0 when they are undefined', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');

    const airData = {
      list: [
        {
          main: { aqi: 1 },
          components: {
            // pm2_5, pm10, o3, no2 all missing
          },
        },
      ],
    };
    mockFetchResponses(airData, true, makeUvResponse(0), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pm25).toBe(0);
    expect(json.pm10).toBe(0);
    expect(json.o3).toBe(0);
    expect(json.no2).toBe(0);
  });

  it('returns 500 via errorResponse when fetch throws a network error', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    global.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch air quality data');
  });
});
