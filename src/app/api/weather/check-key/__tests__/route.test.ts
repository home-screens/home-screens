import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { requireSession } from '@/lib/auth';
import { POST } from '@/app/api/weather/check-key/route';

const mockFetch = vi.mocked(fetchWithTimeout);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/weather/check-key', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Enough of a WeatherAPI forecast payload for getHourly to walk.
const WEATHERAPI_OK = {
  location: { localtime_epoch: Math.floor(Date.now() / 1000), tz_id: 'Europe/London' },
  current: { temp_c: 12, temp_f: 54, condition: { code: 1000, text: 'Sunny' }, is_day: 1, humidity: 50, wind_kph: 10, wind_mph: 6, wind_degree: 180, feelslike_c: 11, feelslike_f: 52, uv: 3, precip_mm: 0, precip_in: 0 },
  forecast: { forecastday: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/weather/check-key', () => {
  it('requires an editor session', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(request({ provider: 'weatherapi', key: 'abc' }));
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a keyless or unknown provider', async () => {
    expect((await POST(request({ provider: 'open-meteo', key: 'abc' }))).status).toBe(400);
    expect((await POST(request({ provider: 'nope', key: 'abc' }))).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a missing key', async () => {
    expect((await POST(request({ provider: 'weatherapi' }))).status).toBe(400);
  });

  it('reports a key the provider accepts', async () => {
    mockFetch.mockResolvedValueOnce(Response.json(WEATHERAPI_OK));
    const res = await POST(request({ provider: 'weatherapi', key: 'good-key' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(String(mockFetch.mock.calls[0][0])).toContain('key=good-key');
  });

  it('reports a key the provider rejects, with the raw reason as detail', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{"error":{"code":2006,"message":"API key is invalid."}}', { status: 401 }));
    const res = await POST(request({ provider: 'weatherapi', key: 'not-a-real-key' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'rejected',
      provider: 'WeatherAPI.com',
      detail: expect.stringContaining('API key is invalid'),
    });
  });

  it('reports an outage as no verdict rather than a rejection', async () => {
    mockFetch.mockResolvedValueOnce(new Response('upstream down', { status: 503 }));
    const res = await POST(request({ provider: 'openweathermap', key: 'abc' }));
    expect(await res.json()).toMatchObject({ ok: false, reason: 'unreachable', provider: 'OpenWeatherMap' });
  });
});
