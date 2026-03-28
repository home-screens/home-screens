import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockCache = {
  get: vi.fn(() => null),
  set: vi.fn(),
};

vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

vi.mock('@/lib/weather', () => ({
  createWeatherProvider: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ error: msg }, { status });
    }),
    createTTLCache: vi.fn(() => mockCache),
    getLocationFromConfig: vi.fn(),
  };
});

import { getSecret } from '@/lib/secrets';
import { readConfig } from '@/lib/config';
import { createWeatherProvider } from '@/lib/weather';
import { getLocationFromConfig } from '@/lib/api-utils';

const mockGetSecret = vi.mocked(getSecret);
const mockReadConfig = vi.mocked(readConfig);
const mockCreateWeatherProvider = vi.mocked(createWeatherProvider);
const mockGetLocation = vi.mocked(getLocationFromConfig);

const { GET } = await import('@/app/api/weather/route');

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/weather');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

const sampleHourly = [
  { time: '12:00', temp: 72, icon: '01d', description: 'Clear' },
];
const sampleForecast = [
  { date: '2026-03-10', high: 75, low: 55, icon: '01d', description: 'Sunny' },
];
const sampleMinutely = [
  { time: 1710000000, intensity: 0.5, probability: 0.3 },
];
const sampleAlerts = [
  { title: 'Wind Advisory', severity: 'Moderate' as const, description: 'Strong winds', expires: 1710050000 },
];

function makeMockProvider(options: {
  hasMinutely?: boolean;
  hasAlerts?: boolean;
} = {}) {
  const provider: Record<string, unknown> = {
    getHourly: vi.fn().mockResolvedValue(sampleHourly),
    getForecast: vi.fn().mockResolvedValue(sampleForecast),
  };
  if (options.hasMinutely) {
    provider.getMinutely = vi.fn().mockResolvedValue(sampleMinutely);
  }
  if (options.hasAlerts) {
    provider.getAlerts = vi.fn().mockResolvedValue(sampleAlerts);
  }
  return provider;
}

function setupDefaults(location: { lat: string; lon: string } | null = { lat: '40.7', lon: '-74.0' }) {
  mockGetLocation.mockResolvedValue(location);
  mockReadConfig.mockResolvedValue({ screens: [], settings: {} } as never);
  mockGetSecret.mockResolvedValue('test-api-key');
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockCache.get.mockReturnValue(null);
  mockCache.set.mockClear();
});

describe('GET /api/weather', () => {
  it('returns 400 when location is missing', async () => {
    setupDefaults(null);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/lat, lon/);
  });

  it('type=forecast calls only getForecast, not getHourly', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ type: 'forecast' });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.forecast).toEqual(sampleForecast);
    expect(json.hourly).toBeUndefined();
    expect(provider.getForecast).toHaveBeenCalledOnce();
    expect(provider.getHourly).not.toHaveBeenCalled();
  });

  it('type=hourly calls only getHourly, not getForecast', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ type: 'hourly' });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hourly).toEqual(sampleHourly);
    expect(json.forecast).toBeUndefined();
    expect(provider.getHourly).toHaveBeenCalledOnce();
    expect(provider.getForecast).not.toHaveBeenCalled();
  });

  it('type=both (default) calls both getHourly and getForecast', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest(); // no type param → defaults to 'both'
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.hourly).toEqual(sampleHourly);
    expect(json.forecast).toEqual(sampleForecast);
    expect(provider.getHourly).toHaveBeenCalledOnce();
    expect(provider.getForecast).toHaveBeenCalledOnce();
  });

  it('includes minutely data when provider supports getMinutely', async () => {
    setupDefaults();
    const provider = makeMockProvider({ hasMinutely: true });
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json.minutely).toEqual(sampleMinutely);
    expect(provider.getMinutely).toHaveBeenCalledOnce();
  });

  it('includes alerts when provider supports getAlerts', async () => {
    setupDefaults();
    const provider = makeMockProvider({ hasAlerts: true });
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json.alerts).toEqual(sampleAlerts);
    expect(provider.getAlerts).toHaveBeenCalledOnce();
  });

  it('omits minutely and alerts when provider does not have those methods', async () => {
    setupDefaults();
    const provider = makeMockProvider(); // no minutely or alerts
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json.minutely).toBeUndefined();
    expect(json.alerts).toBeUndefined();
  });

  it('defaults provider to openweathermap', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest(); // no provider param
    await GET(req);

    expect(mockCreateWeatherProvider).toHaveBeenCalledWith('openweathermap', 'test-api-key');
  });

  it('allows provider to be overridden via searchParams', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ provider: 'weatherapi' });
    await GET(req);

    expect(mockCreateWeatherProvider).toHaveBeenCalledWith('weatherapi', expect.any(String));
  });

  it('falls back to config weather.provider when not in searchParams', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockReadConfig.mockResolvedValue({
      screens: [],
      settings: { weather: { provider: 'pirateweather' } },
    } as never);
    mockGetSecret.mockResolvedValue('pirate-key');
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest(); // no provider param
    await GET(req);

    expect(mockCreateWeatherProvider).toHaveBeenCalledWith('pirateweather', 'pirate-key');
  });

  it('defaults units to imperial', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ type: 'hourly' });
    await GET(req);

    expect(provider.getHourly).toHaveBeenCalledWith(40.7, -74.0, 'imperial');
  });

  it('allows units to be overridden via searchParams', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ type: 'hourly', units: 'metric' });
    await GET(req);

    expect(provider.getHourly).toHaveBeenCalledWith(40.7, -74.0, 'metric');
  });

  it('looks up openweathermap_key for openweathermap provider', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ provider: 'openweathermap' });
    await GET(req);

    expect(mockGetSecret).toHaveBeenCalledWith('openweathermap_key');
  });

  it('looks up weatherapi_key for weatherapi provider', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ provider: 'weatherapi' });
    await GET(req);

    expect(mockGetSecret).toHaveBeenCalledWith('weatherapi_key');
  });

  it('looks up pirateweather_key for pirateweather provider', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ provider: 'pirateweather' });
    await GET(req);

    expect(mockGetSecret).toHaveBeenCalledWith('pirateweather_key');
  });

  it('skips secret lookup for open-meteo provider', async () => {
    setupDefaults();
    mockGetSecret.mockClear();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const req = makeRequest({ provider: 'open-meteo' });
    await GET(req);

    expect(mockGetSecret).not.toHaveBeenCalled();
    expect(mockCreateWeatherProvider).toHaveBeenCalledWith('open-meteo', undefined);
  });

  it('returns 400 when API key is required but not configured', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: {} } as never);
    mockGetSecret.mockResolvedValue(null);
    mockCreateWeatherProvider.mockClear();

    const req = makeRequest({ provider: 'pirateweather' });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No API key configured for pirateweather/);
    expect(mockCreateWeatherProvider).not.toHaveBeenCalled();
  });

  it('returns 400 for any keyed provider without a secret', async () => {
    mockGetLocation.mockResolvedValue({ lat: '40.7', lon: '-74.0' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: {} } as never);
    mockGetSecret.mockResolvedValue(null);

    for (const provider of ['openweathermap', 'weatherapi', 'pirateweather']) {
      const req = makeRequest({ provider });
      const res = await GET(req);
      expect(res.status).toBe(400);
    }
  });

  it('does NOT return 400 for keyless providers (noaa, open-meteo)', async () => {
    setupDefaults();
    mockGetSecret.mockClear();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    for (const p of ['noaa', 'open-meteo']) {
      const req = makeRequest({ provider: p });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }
  });

  it('returns 500 via errorResponse when provider throws', async () => {
    setupDefaults();
    mockCreateWeatherProvider.mockImplementation(() => {
      throw new Error('Invalid provider configuration');
    });

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch weather');
  });
});
