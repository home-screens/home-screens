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

function mockFetchResponses(
  airBody: unknown,
  airOk: boolean,
  airStatus = 200,
) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('air_pollution')) {
      return Promise.resolve({
        ok: airOk,
        status: airStatus,
        json: async () => airBody,
        text: async () => JSON.stringify(airBody),
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
    mockFetchResponses(makeAirPollutionResponse(3), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      aqi: 3,
      pm25: 12.5,
      pm10: 20,
      o3: 45,
      no2: 10,
    });
  });

  it('uses correct API URL with lat/lon/apiKey', async () => {
    mockGetLocation.mockResolvedValue({ lat: '51.5', lon: '-0.12' });
    mockGetSecret.mockResolvedValue('MY_KEY');
    mockFetchResponses(makeAirPollutionResponse(2), true);

    await GET(new NextRequest('http://localhost/api/air-quality'));

    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);

    const url = calls[0][0] as string;
    expect(url).toBe(
      'https://api.openweathermap.org/data/2.5/air_pollution?lat=51.5&lon=-0.12&appid=MY_KEY',
    );
  });

  it('returns 502 when air pollution API returns non-ok status', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses({}, false, 503);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('Failed to fetch air quality data');
  });

  it('returns 502 when air pollution data has no list entries', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses({ list: [] }, true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('No air pollution data returned');
  });

  it('does not include UV in response', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockGetSecret.mockResolvedValue('test-key');
    mockFetchResponses(makeAirPollutionResponse(1), true);

    const res = await GET(new NextRequest('http://localhost/api/air-quality'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.uv).toBeUndefined();
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
    mockFetchResponses(airData, true);

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
