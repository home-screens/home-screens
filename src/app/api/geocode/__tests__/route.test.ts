import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const { GET } = await import('@/app/api/geocode/route');

function makeNominatimResult(overrides: {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string>;
}) {
  return {
    lat: overrides.lat ?? '40.7127281',
    lon: overrides.lon ?? '-74.0060152',
    display_name: overrides.display_name ?? 'New York, New York, United States',
    address: overrides.address ?? {
      city: 'New York',
      state: 'New York',
      country_code: 'us',
    },
  };
}

function mockFetchSuccess(results: ReturnType<typeof makeNominatimResult>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(results),
      }),
    ),
  );
}

function mockFetchUpstreamFailure(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({}),
      }),
    ),
  );
}

function mockFetchNetworkError(message: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error(message))),
  );
}

function makeRequest(params?: Record<string, string>): NextRequest {
  const searchParams = new URLSearchParams(params);
  const url = `http://localhost/api/geocode${params ? `?${searchParams}` : ''}`;
  return new NextRequest(url);
}

describe('GET /api/geocode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when q param is missing', async () => {
    const response = await GET(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Missing query param: q' });
  });

  it('appends ", United States" to 5-digit US zip codes', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: '10001' }));

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('10001, United States'));
  });

  it('appends ", United States" to ZIP+4 format', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: '10001-1234' }));

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('10001-1234, United States'));
  });

  it('passes non-zip query as-is without appending country', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: 'London' }));

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('London'));
    expect(calledUrl).not.toContain('United+States');
    expect(calledUrl).not.toContain(encodeURIComponent('United States'));
  });

  it('does not treat 6-digit numbers as zip codes', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: '100011' }));

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).not.toContain(encodeURIComponent(', United States'));
  });

  it('returns latitude, longitude, and displayName on successful geocode', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        lat: '40.7127281',
        lon: '-74.0060152',
        address: { city: 'New York', state: 'New York', country_code: 'us' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'New York' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      latitude: 40.7127281,
      longitude: -74.0060152,
      displayName: 'New York, New York, US',
    });
  });

  it('constructs displayName from city + state + country', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { city: 'San Francisco', state: 'California', country_code: 'us' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'San Francisco' }));
    const json = await response.json();

    expect(json.displayName).toBe('San Francisco, California, US');
  });

  it('falls back to addr.town when city is missing', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { town: 'Smalltown', state: 'Montana', country_code: 'us' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Smalltown' }));
    const json = await response.json();

    expect(json.displayName).toBe('Smalltown, Montana, US');
  });

  it('falls back to addr.village when town is missing', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { village: 'Tinyville', state: 'Vermont', country_code: 'us' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Tinyville' }));
    const json = await response.json();

    expect(json.displayName).toBe('Tinyville, Vermont, US');
  });

  it('falls back to addr.county when village is missing', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { county: 'Middlesex County', state: 'New Jersey', country_code: 'us' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Middlesex' }));
    const json = await response.json();

    expect(json.displayName).toBe('Middlesex County, New Jersey, US');
  });

  it('falls back to r.display_name when no address parts are available', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        display_name: 'Some Remote Place, Earth',
        address: {},
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Remote' }));
    const json = await response.json();

    expect(json.displayName).toBe('Some Remote Place, Earth');
  });

  it('omits empty parts from displayName (no state)', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { city: 'London', country_code: 'gb' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'London' }));
    const json = await response.json();

    // Should filter out empty state, producing "London, GB" not "London, , GB"
    expect(json.displayName).toBe('London, GB');
  });

  it('uppercases the country code', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { city: 'Tokyo', state: 'Tokyo', country_code: 'jp' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Tokyo' }));
    const json = await response.json();

    expect(json.displayName).toBe('Tokyo, Tokyo, JP');
  });

  it('returns 404 when upstream returns empty results', async () => {
    mockFetchSuccess([]);

    const response = await GET(makeRequest({ q: 'ZZZZZZZ Nowhere' }));
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({ error: 'Location not found' });
  });

  it('returns 404 when upstream returns non-ok (falls through to 404)', async () => {
    mockFetchUpstreamFailure(500);

    const response = await GET(makeRequest({ q: 'SomePlace' }));
    const json = await response.json();

    // The route does NOT return 502 for non-ok; it falls through to the 404 at the end
    expect(response.status).toBe(404);
    expect(json).toEqual({ error: 'Location not found' });
  });

  it('returns 500 when network request fails', async () => {
    mockFetchNetworkError('ENOTFOUND');

    const response = await GET(makeRequest({ q: 'London' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Geocoding request failed' });
  });

  it('sends User-Agent header to Nominatim', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: 'Berlin' }));

    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(calledOptions.headers).toEqual({ 'User-Agent': 'HomeScreens/1.0' });
  });

  it('includes format=json and limit=1 and addressdetails=1 in the URL', async () => {
    mockFetchSuccess([makeNominatimResult({})]);

    await GET(makeRequest({ q: 'Paris' }));

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('format=json');
    expect(calledUrl).toContain('limit=1');
    expect(calledUrl).toContain('addressdetails=1');
  });

  it('parses lat/lon as numbers in the response', async () => {
    mockFetchSuccess([
      makeNominatimResult({ lat: '48.856614', lon: '2.352222' }),
    ]);

    const response = await GET(makeRequest({ q: 'Paris' }));
    const json = await response.json();

    expect(typeof json.latitude).toBe('number');
    expect(typeof json.longitude).toBe('number');
    expect(json.latitude).toBeCloseTo(48.856614);
    expect(json.longitude).toBeCloseTo(2.352222);
  });
});
