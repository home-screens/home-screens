import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout, createTTLCache, SetupError } from '@/lib/api-utils';
import { upstreamError, UpstreamError } from '@/lib/upstream-error';
import { getSecret } from '@/lib/secrets';
import { logger } from '@/lib/logger';
import type { TrafficRouteResult, TrafficTimes } from '@/lib/traffic-routes';

export const dynamic = 'force-dynamic';

const log = logger('traffic');

interface RouteInput {
  label: string;
  origin: string;
  destination: string;
}

/** @internal exported for test cleanup */
export const geocodeCache = createTTLCache<string>(60 * 60 * 1000); // 1 hour

/**
 * The service cannot place one of the route's addresses or find a way
 * between them. Asking again will not help; fixing the route will.
 */
class RouteNotFoundError extends Error {}

/**
 * A refused answer, sorted by who can fix it: a rejected key is a setup error
 * for the whole module (`upstreamError`), a request the service turned down
 * is this route's addresses, and anything else is the service having a bad
 * moment. Google answers an unknown key with a 400 that names it, not a 401.
 */
async function trafficError(res: Response, service: string): Promise<Error> {
  const error = await upstreamError(res, service, { keyRejected: /API_KEY_INVALID/ });
  if (error instanceof UpstreamError && (error.status === 400 || error.status === 404)) {
    return new RouteNotFoundError(`${service} could not route it (${error.status})`);
  }
  return error;
}

function travelTimes(baseSeconds: number, trafficSeconds: number): TrafficTimes {
  const durationMinutes = Math.round(baseSeconds / 60);
  const durationInTrafficMinutes = Math.round(trafficSeconds / 60);
  return {
    durationMinutes,
    durationInTrafficMinutes,
    delayMinutes: Math.max(0, durationInTrafficMinutes - durationMinutes),
  };
}

async function googleRoute(route: RouteInput, apiKey: string): Promise<TrafficTimes> {
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
  if (!res.ok) throw await trafficError(res, 'Google Maps');

  const data = await res.json();
  const r = data.routes?.[0];
  // An empty answer is Google finding no way between the two addresses.
  if (!r) throw new RouteNotFoundError('Google Maps found no route');
  const staticSec = parseInt(r.staticDuration?.replace('s', '') ?? '0', 10);
  const trafficSec = parseInt(r.duration?.replace('s', '') ?? '0', 10);
  return travelTimes(staticSec, trafficSec);
}

async function tomtomGeocode(address: string, apiKey: string): Promise<string> {
  const cached = geocodeCache.get(address);
  if (cached) return cached;

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json?key=${apiKey}&limit=1`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw await trafficError(res, 'TomTom');
  const data = await res.json();
  const pos = data.results?.[0]?.position;
  if (!pos) throw new RouteNotFoundError('TomTom could not place an address');
  const coords = `${pos.lat},${pos.lon}`;
  geocodeCache.set(address, coords);
  return coords;
}

async function tomtomRoute(route: RouteInput, apiKey: string): Promise<TrafficTimes> {
  const [originCoords, destCoords] = await Promise.all([
    tomtomGeocode(route.origin, apiKey),
    tomtomGeocode(route.destination, apiKey),
  ]);

  const url = `https://api.tomtom.com/routing/1/calculateRoute/${originCoords}:${destCoords}/json?key=${apiKey}&traffic=true&computeTravelTimeFor=all`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw await trafficError(res, 'TomTom');

  const data = await res.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary) throw new RouteNotFoundError('TomTom found no route');
  const durationSeconds = summary.noTrafficTravelTimeInSeconds ?? 0;
  return travelTimes(durationSeconds, summary.travelTimeInSeconds ?? durationSeconds);
}

/**
 * Looks every route up on its own: an address the service cannot place must
 * not take the other routes' drive times down with it. A rejected key is the
 * exception, since it fails them all for a reason only Settings can fix.
 */
async function settleRoutes(
  routes: RouteInput[],
  lookUp: (route: RouteInput) => Promise<TrafficTimes>,
): Promise<TrafficRouteResult[]> {
  const settled = await Promise.allSettled(routes.map(lookUp));
  const rejectedKey = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected' && s.reason instanceof SetupError);
  if (rejectedKey) throw rejectedKey.reason;
  return settled.map((s, i): TrafficRouteResult => {
    const label = routes[i]?.label;
    if (s.status === 'fulfilled') return { label, ...s.value };
    log.warn(`route "${label}":`, s.reason instanceof Error ? s.reason.message : s.reason);
    return { label, error: s.reason instanceof RouteNotFoundError ? 'notFound' : 'unavailable' };
  });
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

    let lookUp: (route: RouteInput) => Promise<TrafficTimes>;
    if (googleKey) {
      lookUp = (route) => googleRoute(route, googleKey);
    } else if (tomtomKey) {
      lookUp = (route) => tomtomRoute(route, tomtomKey);
    } else {
      // Mock data: returned as a NextResponse to bypass caching
      return NextResponse.json({
        routes: mockData(routes),
        mock: true,
        note: 'Add a Google Maps or TomTom API key in Settings > Integrations for real traffic data',
      });
    }

    const results = await settleRoutes(routes, lookUp);

    const unavailable = results.filter((r) => 'error' in r && r.error === 'unavailable').length;
    // The service is down for every route: fail as a whole, so a wall keeps
    // the times it already shows rather than trading them all for an error.
    if (unavailable === results.length) {
      return NextResponse.json({ error: 'Failed to fetch traffic data' }, { status: 502 });
    }
    // A route the service did not answer is asked again on the next poll
    // instead of being held in the cache for five minutes.
    if (unavailable > 0) return NextResponse.json({ routes: results });
    return { routes: results };
  },
  errorMessage: 'Failed to fetch traffic data',
});

/** @internal */
export { GET, cache };
