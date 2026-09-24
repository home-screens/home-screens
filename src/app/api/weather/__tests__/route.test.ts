import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

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

const { GET, cache } = await import('@/app/api/weather/route');

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
  cache.clear();
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

  it('passes the configured timezone to forecast providers', async () => {
    setupDefaults();
    mockReadConfig.mockResolvedValue({
      screens: [],
      settings: { timezone: 'Europe/London' },
    } as never);
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    await GET(makeRequest({ type: 'forecast', provider: 'metoffice' }));

    expect(provider.getForecast).toHaveBeenCalledWith(
      40.7,
      -74.0,
      'imperial',
      'Europe/London',
    );
  });

  it('uses the device timezone when no timezone override is configured', async () => {
    setupDefaults();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    await GET(makeRequest({ type: 'forecast', provider: 'metoffice' }));

    expect(provider.getForecast).toHaveBeenCalledWith(
      40.7,
      -74.0,
      'imperial',
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
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
    expect(json.error).toMatch(/No Pirate Weather API key configured/);
    expect(json.code).toBe('setup');
    expect(json.setup).toEqual({ needs: 'key', service: 'Pirate Weather', page: 'weather' });
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

  it('does NOT return 400 for keyless providers (noaa, open-meteo, yr, smhi)', async () => {
    setupDefaults();
    mockGetSecret.mockClear();
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    for (const p of ['noaa', 'open-meteo', 'yr', 'smhi']) {
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

describe('today\'s range', () => {
  // The record and the reconcile only apply when the forecast leads with the
  // household's today, so the clock is pinned to the fixtures' day.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-04T18:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('remembers the day\'s warmest reading across polls', async () => {
    // Its own place, so the record it writes is not seen by the other tests.
    setupDefaults({ lat: '40.2', lon: '-74.9' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: { timezone: 'America/New_York' } } as never);
    const provider = makeMockProvider();
    provider.getForecast = vi.fn().mockResolvedValue([{ date: '2026-09-04', high: 66, low: 66, icon: '01n', description: 'Mostly Clear' }]);
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    // Mid-afternoon: 86°.
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '15:00', temp: 86, icon: '01d', description: 'Sunny' }]);
    await GET(makeRequest({ lat: '40.2', lon: '-74.9' }));
    cache.clear();

    // Evening: 80° now, but the hub saw 86° earlier and the feed has forgotten it.
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '19:00', temp: 80, icon: '01n', description: 'Clear' }]);
    const json = await (await GET(makeRequest({ lat: '40.2', lon: '-74.9' }))).json();
    expect(json.forecast[0]).toMatchObject({ high: 86, low: 66 });
  });

  it('type=both raises today\'s high to the current temperature', async () => {
    // Its own place: the record is keyed by location and persists across the file's tests.
    setupDefaults({ lat: '41.0', lon: '-75.5' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: { timezone: 'America/New_York' } } as never);
    const provider = makeMockProvider();
    // A post-sunset NOAA feed: only "tonight" is left, so the high is the low.
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '19:00', temp: 80, icon: '01n', description: 'Clear' }]);
    provider.getForecast = vi.fn().mockResolvedValue([{ date: '2026-09-04', high: 66, low: 66, icon: '01n', description: 'Mostly Clear' }]);
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const json = await (await GET(makeRequest({ lat: '41.0', lon: '-75.5' }))).json();
    expect(json.forecast[0]).toMatchObject({ high: 80, low: 66 });
  });

  it('keeps a Today row from the hub\'s record once the forecast starts tomorrow', async () => {
    // Chicago, Sep 4. At 3 pm OpenWeatherMap still has today; by 10 pm its
    // slots have run out and its first day is Sep 5.
    setupDefaults({ lat: '41.5', lon: '-76.0' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: { timezone: 'America/Chicago' } } as never);
    const provider = makeMockProvider();
    mockCreateWeatherProvider.mockReturnValue(provider as never);
    const tomorrow = { date: '2026-09-05', high: 70, low: 55, icon: '01d', description: 'Sunny' };

    vi.setSystemTime(new Date('2026-09-04T20:00:00Z')); // 3 pm CDT
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '2026-09-04T20:00:00Z', temp: 82, icon: '10d', description: 'Rain' }]);
    provider.getForecast = vi.fn().mockResolvedValue([
      { date: '2026-09-04', high: 78, low: 64, icon: '10d', description: 'Light rain', precipProbability: 60 },
      tomorrow,
    ]);
    await GET(makeRequest({ lat: '41.5', lon: '-76.0' }));
    cache.clear();

    vi.setSystemTime(new Date('2026-09-05T03:00:00Z')); // 10 pm CDT
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '2026-09-05T03:00:00Z', temp: 61, icon: '01n', description: 'Clear' }]);
    provider.getForecast = vi.fn().mockResolvedValue([tomorrow]);
    const json = await (await GET(makeRequest({ lat: '41.5', lon: '-76.0' }))).json();

    // Today's row as the provider last had it, widened by the 82° the hub
    // saw at 3 pm and tonight's 61°.
    expect(json.forecast[0]).toEqual({
      date: '2026-09-04', high: 82, low: 61, icon: '10d', description: 'Light rain', precipProbability: 60,
    });
    // Tonight's reading is not tomorrow's high or low.
    expect(json.forecast[1]).toEqual(tomorrow);
  });

  it('builds the Today row from the current reading when the hub kept none', async () => {
    vi.setSystemTime(new Date('2026-09-05T03:00:00Z')); // 10 pm CDT Sep 4
    setupDefaults({ lat: '41.6', lon: '-76.1' });
    mockReadConfig.mockResolvedValue({ screens: [], settings: { timezone: 'America/Chicago' } } as never);
    const provider = makeMockProvider();
    provider.getHourly = vi.fn().mockResolvedValue([{ time: '2026-09-05T03:00:00Z', temp: 80, icon: '01n', description: 'Clear', humidity: 40 }]);
    provider.getForecast = vi.fn().mockResolvedValue([{ date: '2026-09-05', high: 70, low: 55, icon: '01d', description: 'Sunny' }]);
    mockCreateWeatherProvider.mockReturnValue(provider as never);

    const json = await (await GET(makeRequest({ lat: '41.6', lon: '-76.1' }))).json();
    expect(json.forecast[0]).toEqual({ date: '2026-09-04', high: 80, low: 80, icon: '01n', description: 'Clear', humidity: 40 });
    expect(json.forecast[1]).toMatchObject({ date: '2026-09-05', high: 70, low: 55 });
  });
});
