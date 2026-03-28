import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const dummyRequest = new NextRequest('http://localhost/api/rain-map');

function makeRainViewerResponse() {
  return {
    version: '2.0',
    generated: 1709985600,
    host: 'https://tilecache.rainviewer.com',
    radar: {
      past: [
        { time: 1709985000, path: '/v2/radar/1709985000/256/{z}/{x}/{y}/2/1_1.png' },
        { time: 1709985600, path: '/v2/radar/1709985600/256/{z}/{x}/{y}/2/1_1.png' },
      ],
      nowcast: [
        { time: 1709986200, path: '/v2/radar/1709986200/256/{z}/{x}/{y}/2/1_1.png' },
      ],
    },
    satellite: {
      infrared: [
        { time: 1709985600, path: '/v2/satellite/1709985600/256/{z}/{x}/{y}/0/0_0.png' },
      ],
    },
  };
}

function mockFetchSuccess(data = makeRainViewerResponse()) {
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
  });

  async function importGET() {
    const mod = await import('@/app/api/rain-map/route');
    return mod.GET;
  }

  it('returns the full RainViewer response on success', async () => {
    const expected = makeRainViewerResponse();
    mockFetchSuccess(expected);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expected);
  });

  it('preserves all nested radar and satellite data', async () => {
    mockFetchSuccess();

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(json.radar.past).toHaveLength(2);
    expect(json.radar.nowcast).toHaveLength(1);
    expect(json.satellite.infrared).toHaveLength(1);
    expect(json.version).toBe('2.0');
    expect(json.host).toBe('https://tilecache.rainviewer.com');
  });

  it('calls the correct RainViewer API URL', async () => {
    mockFetchSuccess();

    const GET = await importGET();
    await GET(dummyRequest);

    expect(fetch).toHaveBeenCalledWith('https://api.rainviewer.com/public/weather-maps.json', expect.anything());
  });

  it('returns 502 with status in error message when upstream fails', async () => {
    mockFetchUpstreamFailure(503);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({ error: 'RainViewer API returned 503' });
  });

  it('includes specific upstream status code in error message', async () => {
    mockFetchUpstreamFailure(429);

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(json.error).toBe('RainViewer API returned 429');
  });

  it('returns 500 with error message when network request fails', async () => {
    mockFetchNetworkError('ETIMEDOUT');

    const GET = await importGET();
    const response = await GET(dummyRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch rain map data' });
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
