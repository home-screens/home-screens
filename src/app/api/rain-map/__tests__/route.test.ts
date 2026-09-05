import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_RADAR_SERVER_URL } from '@/lib/radar-server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

let radarServerUrl: string | undefined;
vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(async () => ({
    settings: { weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial', radarServerUrl } },
  })),
}));

const dummyRequest = new NextRequest('http://localhost/api/rain-map');

function makeIndex() {
  return {
    version: '2.0',
    generated: 1709985600,
    host: 'http://localhost:8080',
    radar: {
      past: [
        { time: 1709985000, path: '/v2/radar/1709985000' },
        { time: 1709985600, path: '/v2/radar/1709985600' },
      ],
      nowcast: [
        { time: 1709986200, path: '/v2/radar/nowcast_1709986200' },
      ],
    },
    satellite: {
      infrared: [
        { time: 1709985600, path: '/v2/satellite/1709985600' },
      ],
    },
  };
}

function mockFetchSuccess(data = makeIndex()) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(data),
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

describe('GET /api/rain-map', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    radarServerUrl = undefined;
  });

  async function importGET() {
    const mod = await import('@/app/api/rain-map/route');
    return mod.GET;
  }

  it('reads the frame index from the public LibreWXR server by default', async () => {
    mockFetchSuccess();

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(`${DEFAULT_RADAR_SERVER_URL}/public/weather-maps.json`, expect.anything());
    expect(json.radar.past).toHaveLength(2);
    expect(json.radar.nowcast).toHaveLength(1);
    expect(json.satellite.infrared).toHaveLength(1);
    expect(json.version).toBe('2.0');
  });

  it('rewrites host to the server the hub fetched from, not the one the server reports', async () => {
    mockFetchSuccess();

    const GET = await importGET();
    const json = await (await GET(dummyRequest)).json();

    // A self-hosted LibreWXR reports its LIBREWXR_PUBLIC_URL (localhost out of
    // the box); displays must build tile URLs on the address the hub uses.
    expect(json.host).toBe(DEFAULT_RADAR_SERVER_URL);
  });

  it('reads from a configured self-hosted server, trailing slash and all', async () => {
    radarServerUrl = 'http://nas.local:8080/';
    mockFetchSuccess();

    const GET = await importGET();
    const json = await (await GET(dummyRequest)).json();

    expect(fetch).toHaveBeenCalledWith('http://nas.local:8080/public/weather-maps.json', expect.anything());
    expect(json.host).toBe('http://nas.local:8080');
  });

  it('falls back to the default server when the configured value is not a usable URL', async () => {
    radarServerUrl = 'nas.local';
    mockFetchSuccess();

    const GET = await importGET();
    await GET(dummyRequest);

    expect(fetch).toHaveBeenCalledWith(`${DEFAULT_RADAR_SERVER_URL}/public/weather-maps.json`, expect.anything());
  });

  it('returns 502 with the upstream status when the radar server fails', async () => {
    mockFetchUpstreamFailure(503);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'Radar server returned 503' });
  });

  it('returns 500 with error message when network request fails', async () => {
    mockFetchNetworkError('ETIMEDOUT');

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toMatchObject({ error: 'Failed to fetch rain map data' });
  });

  it('serves cached response on second call', async () => {
    mockFetchSuccess();

    const GET = await importGET();

    const response1 = await GET(dummyRequest);
    expect(response1.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);

    const response2 = await GET(dummyRequest);
    const json2 = await response2.json();
    expect(json2.version).toBe('2.0');
    expect(fetch).toHaveBeenCalledTimes(1); // cache hit, no second fetch
  });
});
