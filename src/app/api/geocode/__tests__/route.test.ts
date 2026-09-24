import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const { GET } = await import('@/app/api/geocode/route');
const { __resetPlaceTimezonesForTests } = await import('@/lib/place-timezone');

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

/**
 * Answers by host: Nominatim and ip-api get `places`, Open-Meteo names the
 * zone from `zoneAt` for the coordinates it was asked about.
 */
function mockUpstreams(places: unknown, zoneAt: (lat: number, lon: number) => string | null) {
  const fetchMock = vi.fn((url: string) => {
    const u = new URL(url);
    if (u.hostname === 'api.open-meteo.com') {
      const zone = zoneAt(Number(u.searchParams.get('latitude')), Number(u.searchParams.get('longitude')));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(zone ? { latitude: 0, longitude: 0, timezone: zone } : { error: true }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(places) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const openMeteoCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('api.open-meteo.com'));

describe('GET /api/geocode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetPlaceTimezonesForTests();
  });

  // With no zone saved the Location page fills whatever zone comes back here,
  // so it must be the place's, never the laptop's.
  describe('time zone of the place', () => {
    const denverAt = (lat: number, lon: number) => (lat === 40.01 && lon === -105.27 ? 'America/Denver' : null);

    it('names the zone of a looked-up town from its coordinates', async () => {
      const fetchMock = mockUpstreams(
        [makeNominatimResult({ lat: '40.0149856', lon: '-105.270545', address: { city: 'Boulder', state: 'Colorado', country_code: 'us' } })],
        denverAt,
      );

      const json = await (await GET(makeRequest({ q: 'Boulder, CO' }))).json();

      expect(json.timezone).toBe('America/Denver');
      expect(json.displayName).toBe('Boulder, Colorado, US');
      const [[zoneUrl]] = openMeteoCalls(fetchMock);
      expect(zoneUrl).toContain('timezone=auto');
    });

    it('still finds the town when the zone lookup is down, just without a zone', async () => {
      vi.stubGlobal('fetch', vi.fn((url: string) => (url.includes('open-meteo')
        ? Promise.reject(new Error('ECONNRESET'))
        : Promise.resolve({ ok: true, json: () => Promise.resolve([makeNominatimResult({})]) }))));

      const response = await GET(makeRequest({ q: 'New York' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.latitude).toBeCloseTo(40.7127281);
      expect(json).not.toHaveProperty('timezone');
    });

    it('keeps a found zone, so the same town is not asked about twice', async () => {
      const fetchMock = mockUpstreams(
        [makeNominatimResult({ lat: '40.0149856', lon: '-105.270545' })],
        denverAt,
      );

      await GET(makeRequest({ q: 'Boulder' }));
      await GET(makeRequest({ lat: '40.012', lon: '-105.268' }));

      expect(openMeteoCalls(fetchMock)).toHaveLength(1);
    });

    it('answers the zone alone for a place already saved', async () => {
      mockUpstreams([], denverAt);

      const response = await GET(makeRequest({ lat: '40.0125', lon: '-105.2705' }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ timezone: 'America/Denver' });
    });

    it('says so when no zone can be found for the coordinates', async () => {
      mockUpstreams([], () => null);

      const response = await GET(makeRequest({ lat: '12.5', lon: '-30.25' }));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Time zone not found' });
    });

    it('refuses coordinates that are not on the globe', async () => {
      const fetchMock = mockUpstreams([], denverAt);

      expect((await GET(makeRequest({ lat: '95', lon: '10' }))).status).toBe(400);
      expect((await GET(makeRequest({ lat: 'abc', lon: '10' }))).status).toBe(400);
      expect((await GET(makeRequest({ lat: '10' }))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('takes the internet location\'s own zone when it names one', async () => {
      const fetchMock = mockUpstreams(
        { lat: 44.71, lon: -93.42, city: 'Prior Lake', region: 'MN', regionName: 'Minnesota', countryCode: 'US', timezone: 'America/Chicago' },
        () => 'Europe/Berlin',
      );

      const json = await (await GET(makeRequest({ detect: 'ip' }))).json();

      expect(json.timezone).toBe('America/Chicago');
      expect(openMeteoCalls(fetchMock)).toHaveLength(0);
      const ipUrl = String(fetchMock.mock.calls[0][0]);
      expect(ipUrl).toContain('timezone');
    });

    it('falls back to the coordinates when the internet location names no zone', async () => {
      mockUpstreams(
        { lat: 40.01, lon: -105.27, city: 'Boulder', region: 'CO', regionName: 'Colorado', countryCode: 'US' },
        denverAt,
      );

      const json = await (await GET(makeRequest({ detect: 'ip' }))).json();

      expect(json.timezone).toBe('America/Denver');
    });
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
      countryCode: 'US',
    });
  });

  // The school-holiday region is picked per state, so the settings page offers
  // the state the address already names instead of a list of sixteen.
  it('returns the country and state codes Nominatim already sends', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: {
          city: 'Dusseldorf',
          state: 'Nordrhein-Westfalen',
          country_code: 'de',
          'ISO3166-2-lvl4': 'DE-NW',
        },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Dusseldorf' }));
    const json = await response.json();

    expect(json.countryCode).toBe('DE');
    expect(json.subdivisionCode).toBe('DE-NW');
  });

  it('omits the state code when the address has none', async () => {
    mockFetchSuccess([
      makeNominatimResult({
        address: { city: 'Monaco', country_code: 'mc' },
      }),
    ]);

    const response = await GET(makeRequest({ q: 'Monaco' }));
    const json = await response.json();

    expect(json.countryCode).toBe('MC');
    expect(json).not.toHaveProperty('subdivisionCode');
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
    expect(json).toMatchObject({ error: 'Geocoding request failed' });
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

  describe('?detect=ip', () => {
    function mockIpResponse(data: Record<string, unknown>) {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })),
      );
    }

    it('puts the state code back together from the parts this source gives', async () => {
      mockIpResponse({ lat: 51.2, lon: 6.8, city: 'Dusseldorf', region: 'NW', regionName: 'North Rhine-Westphalia', countryCode: 'DE' });

      const response = await GET(makeRequest({ detect: 'ip' }));
      const json = await response.json();

      expect(json).toEqual({
        latitude: 51.2,
        longitude: 6.8,
        displayName: 'Dusseldorf, North Rhine-Westphalia, DE',
        countryCode: 'DE',
        subdivisionCode: 'DE-NW',
      });
    });

    it('omits the state code when this source gives something that is not one', async () => {
      mockIpResponse({ lat: 51.2, lon: 6.8, city: 'Dusseldorf', region: 'Nordrhein', regionName: 'North Rhine-Westphalia', countryCode: 'DE' });

      const response = await GET(makeRequest({ detect: 'ip' }));
      const json = await response.json();

      expect(json.countryCode).toBe('DE');
      expect(json).not.toHaveProperty('subdivisionCode');
    });
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
