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
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

import { getSecret } from '@/lib/secrets';

const { GET, cache, geocodeCache } = await import('@/app/api/traffic/route');

// ─── Helpers ───

function makeRoutes(routes: Array<{ label: string; origin: string; destination: string }>) {
  return new NextRequest(
    `http://localhost/api/traffic?routes=${encodeURIComponent(JSON.stringify(routes))}`,
  );
}

function makeGoogleRoutesResponse(staticDurationSec: number, trafficDurationSec: number) {
  return {
    routes: [
      {
        staticDuration: `${staticDurationSec}s`,
        duration: `${trafficDurationSec}s`,
      },
    ],
  };
}

function makeTomTomRoutingResponse(noTrafficSec: number, trafficSec: number) {
  return {
    routes: [
      {
        summary: {
          noTrafficTravelTimeInSeconds: noTrafficSec,
          travelTimeInSeconds: trafficSec,
        },
      },
    ],
  };
}

function makeTomTomGeocodeResponse(lat: number, lon: number) {
  return {
    results: [{ position: { lat, lon } }],
  };
}

const sampleRoutes = [
  { label: 'Work', origin: '123 Home St', destination: '456 Office Ave' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
  geocodeCache.clear();
});

// ─── Input Validation ───

describe('GET /api/traffic - validation', () => {
  it('returns 400 when routes param is missing', async () => {
    const req = new NextRequest('http://localhost/api/traffic');

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Missing routes/i);
  });

  it('returns 400 for invalid JSON in routes param', async () => {
    const req = new NextRequest('http://localhost/api/traffic?routes=not-json');

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/Invalid routes JSON/i);
  });

  it('returns 400 when routes is empty array', async () => {
    const req = new NextRequest(
      `http://localhost/api/traffic?routes=${encodeURIComponent('[]')}`,
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/non-empty array/i);
  });

  it('returns 400 when routes is not an array (string)', async () => {
    const req = new NextRequest(
      `http://localhost/api/traffic?routes=${encodeURIComponent('"hello"')}`,
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/non-empty array/i);
  });

  it('returns 400 when routes is not an array (object)', async () => {
    const req = new NextRequest(
      `http://localhost/api/traffic?routes=${encodeURIComponent('{"label":"x"}')}`,
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/non-empty array/i);
  });
});

// ─── Provider Selection ───

describe('GET /api/traffic - provider selection', () => {
  it('uses Google provider when google_maps_key is set', async () => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'google_maps_key') return 'google-key';
      return null;
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGoogleRoutesResponse(600, 720),
      text: async () => '',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.routes).toHaveLength(1);
    // Verify it called the Google Routes API
    expect(global.fetch).toHaveBeenCalledWith(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-Api-Key': 'google-key',
        }),
      }),
    );
  });

  it('uses TomTom provider when only tomtom_key is set', async () => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'tomtom_key') return 'tomtom-key';
      return null;
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocode')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomGeocodeResponse(40.7128, -74.006),
        });
      }
      if (url.includes('calculateRoute')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomRoutingResponse(900, 1080),
          text: async () => '',
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.routes).toHaveLength(1);
    // Verify it called TomTom geocode API
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.tomtom.com/search/2/geocode'),
    );
  });

  it('returns mock data when no API keys configured', async () => {
    vi.mocked(getSecret).mockResolvedValue(null);

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.routes).toHaveLength(1);
    expect(json.routes[0].label).toBe('Work');
    expect(json.routes[0]).toHaveProperty('durationMinutes');
    expect(json.routes[0]).toHaveProperty('durationInTrafficMinutes');
    expect(json.routes[0]).toHaveProperty('delayMinutes');
  });

  it('mock data includes mock: true flag', async () => {
    vi.mocked(getSecret).mockResolvedValue(null);

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.mock).toBe(true);
    expect(json.note).toBeTruthy();
  });
});

// ─── Google Provider ───

describe('GET /api/traffic - Google provider', () => {
  beforeEach(() => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'google_maps_key') return 'google-key';
      return null;
    });
  });

  it('returns correct durationMinutes and durationInTrafficMinutes', async () => {
    // 600s = 10 minutes static, 780s = 13 minutes traffic
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGoogleRoutesResponse(600, 780),
      text: async () => '',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.routes[0].durationMinutes).toBe(10);
    expect(json.routes[0].durationInTrafficMinutes).toBe(13);
  });

  it('calculates delayMinutes correctly (traffic - static, min 0)', async () => {
    // 600s = 10 min static, 900s = 15 min traffic -> 5 min delay
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGoogleRoutesResponse(600, 900),
      text: async () => '',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.routes[0].delayMinutes).toBe(5);
  });

  it('delayMinutes is zero when traffic is faster than static', async () => {
    // Edge case: traffic time less than static (rounding)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGoogleRoutesResponse(600, 540),
      text: async () => '',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.routes[0].delayMinutes).toBe(0);
  });

  it('parses "123s" duration format correctly', async () => {
    // 1800s = 30 min, 2100s = 35 min
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGoogleRoutesResponse(1800, 2100),
      text: async () => '',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.routes[0].durationMinutes).toBe(30);
    expect(json.routes[0].durationInTrafficMinutes).toBe(35);
  });

  it('handles Google API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch traffic data');
  });
});

// ─── TomTom Provider ───

describe('GET /api/traffic - TomTom provider', () => {
  beforeEach(() => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'tomtom_key') return 'tomtom-key';
      return null;
    });
  });

  it('returns correct durationMinutes and durationInTrafficMinutes', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocode')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomGeocodeResponse(40.7128, -74.006),
        });
      }
      if (url.includes('calculateRoute')) {
        // 900s = 15 min no traffic, 1200s = 20 min with traffic
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomRoutingResponse(900, 1200),
          text: async () => '',
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    });

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(json.routes[0].durationMinutes).toBe(15);
    expect(json.routes[0].durationInTrafficMinutes).toBe(20);
    expect(json.routes[0].delayMinutes).toBe(5);
  });

  it('geocodes both origin and destination', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocode')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomGeocodeResponse(40.7128, -74.006),
        });
      }
      if (url.includes('calculateRoute')) {
        return Promise.resolve({
          ok: true,
          json: async () => makeTomTomRoutingResponse(600, 720),
          text: async () => '',
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    });
    global.fetch = fetchMock;

    await GET(makeRoutes(sampleRoutes));

    // Should have geocoded both origin and destination
    const geocodeCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('geocode'),
    );
    expect(geocodeCalls).toHaveLength(2);
    expect(geocodeCalls[0][0]).toContain(encodeURIComponent('123 Home St'));
    expect(geocodeCalls[1][0]).toContain(encodeURIComponent('456 Office Ave'));
  });
});

// ─── Multiple Routes ───

describe('GET /api/traffic - multiple routes', () => {
  it('processes multiple routes in parallel', async () => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'google_maps_key') return 'google-key';
      return null;
    });

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      const staticSec = callCount === 1 ? 600 : 1200;
      const trafficSec = callCount === 1 ? 720 : 1500;
      return Promise.resolve({
        ok: true,
        json: async () => makeGoogleRoutesResponse(staticSec, trafficSec),
        text: async () => '',
      });
    });

    const routes = [
      { label: 'Work', origin: '123 Home St', destination: '456 Office Ave' },
      { label: 'Gym', origin: '123 Home St', destination: '789 Gym Blvd' },
    ];

    const res = await GET(makeRoutes(routes));
    const json = await res.json();

    expect(json.routes).toHaveLength(2);
    expect(json.routes[0].label).toBe('Work');
    expect(json.routes[1].label).toBe('Gym');
    // Both routes should have valid numeric durations
    expect(typeof json.routes[0].durationMinutes).toBe('number');
    expect(typeof json.routes[1].durationMinutes).toBe('number');
  });
});

// ─── Error Handling ───

describe('GET /api/traffic - errors', () => {
  it('network error returns 500', async () => {
    vi.mocked(getSecret).mockImplementation(async (key: string) => {
      if (key === 'google_maps_key') return 'google-key';
      return null;
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const res = await GET(makeRoutes(sampleRoutes));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch traffic data');
  });
});
