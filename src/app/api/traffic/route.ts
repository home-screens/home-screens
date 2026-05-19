import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout, createTTLCache } from '@/lib/api-utils';
import { getSecret } from '@/lib/secrets';

export const dynamic = 'force-dynamic';

interface RouteInput {
  label: string;
  origin: string;
  destination: string;
}

/** @internal exported for test cleanup */
export const geocodeCache = createTTLCache<string>(60 * 60 * 1000); // 1 hour

async function fetchGoogle(routes: RouteInput[], apiKey: string) {
  const results = await Promise.all(
    routes.map(async (route) => {
      const body = {
        origin: { address: route.origin },
        destination: { address: route.destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      };

      const res = await fetchWithTimeout(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          retries: 0,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'routes.duration,routes.staticDuration',
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google Routes API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      const r = data.routes?.[0];
      const staticSec = parseInt(r?.staticDuration?.replace('s', '') ?? '0', 10);
      const trafficSec = parseInt(r?.duration?.replace('s', '') ?? '0', 10);
      const durationMinutes = Math.round(staticSec / 60);
      const durationInTrafficMinutes = Math.round(trafficSec / 60);

      return {
        label: route.label,
        durationMinutes,
        durationInTrafficMinutes,
        delayMinutes: Math.max(0, durationInTrafficMinutes - durationMinutes),
      };
    }),
  );

  return results;
}

async function tomtomGeocode(address: string, apiKey: string): Promise<string> {
  const cached = geocodeCache.get(address);
  if (cached) return cached;

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json?key=${apiKey}&limit=1`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TomTom Geocode error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const pos = data.results?.[0]?.position;
  if (!pos) {
    throw new Error(`TomTom Geocode: no results for "${address}"`);
  }
  const coords = `${pos.lat},${pos.lon}`;
  geocodeCache.set(address, coords);
  return coords;
}

async function fetchTomTom(routes: RouteInput[], apiKey: string) {
  const results = await Promise.all(
    routes.map(async (route) => {
      const [originCoords, destCoords] = await Promise.all([
        tomtomGeocode(route.origin, apiKey),
        tomtomGeocode(route.destination, apiKey),
      ]);

      const url = `https://api.tomtom.com/routing/1/calculateRoute/${originCoords}:${destCoords}/json?key=${apiKey}&traffic=true&computeTravelTimeFor=all`;

      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TomTom API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      const summary = data.routes?.[0]?.summary;
      const durationSeconds = summary?.noTrafficTravelTimeInSeconds ?? 0;
      const trafficSeconds = summary?.travelTimeInSeconds ?? durationSeconds;
      const durationMinutes = Math.round(durationSeconds / 60);
      const durationInTrafficMinutes = Math.round(trafficSeconds / 60);

      return {
        label: route.label,
        durationMinutes,
        durationInTrafficMinutes,
        delayMinutes: Math.max(0, durationInTrafficMinutes - durationMinutes),
      };
    }),
  );

  return results;
}

function mockData(routes: RouteInput[]) {
  return routes.map((route) => {
    const base = 15 + Math.floor(Math.random() * 20);
    const delay = Math.floor(Math.random() * 12);
    return {
      label: route.label,
      durationMinutes: base,
      durationInTrafficMinutes: base + delay,
      delayMinutes: delay,
    };
  });
}

const { GET, cache } = cachedProxyRoute<Record<string, unknown>>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000, // 5 minutes
  cacheKey: (req) => req.nextUrl.searchParams.get('routes') || '',
  execute: async (req) => {
    const routesParam = req.nextUrl.searchParams.get('routes');
    if (!routesParam) {
      return NextResponse.json({ error: 'Missing routes parameter' }, { status: 400 });
    }

    let routes: RouteInput[];
    try {
      routes = JSON.parse(routesParam);
    } catch {
      return NextResponse.json({ error: 'Invalid routes JSON' }, { status: 400 });
    }

    if (!Array.isArray(routes) || routes.length === 0) {
      return NextResponse.json({ error: 'Routes must be a non-empty array' }, { status: 400 });
    }

    const googleKey = await getSecret('google_maps_key');
    const tomtomKey = await getSecret('tomtom_key');

    if (googleKey) {
      return { routes: await fetchGoogle(routes, googleKey) };
    } else if (tomtomKey) {
      return { routes: await fetchTomTom(routes, tomtomKey) };
    }

    // Mock data — return as NextResponse to bypass caching
    return NextResponse.json({
      routes: mockData(routes),
      mock: true,
      note: 'Add a Google Maps or TomTom API key in Settings > Integrations for real traffic data',
    });
  },
  errorMessage: 'Failed to fetch traffic data',
});

/** @internal */
export { GET, cache };
