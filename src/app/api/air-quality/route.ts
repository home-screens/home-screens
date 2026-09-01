import { NextResponse } from 'next/server';
import { cachedProxyRoute, getLocationFromConfig, fetchWithTimeout, requireSecret, setupErrorResponse } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

const log = logger('air-quality');

export const dynamic = 'force-dynamic';

interface AirQualityParams {
  location: { lat: string; lon: string } | null;
}

const { GET, cache } = cachedProxyRoute<Record<string, unknown>, AirQualityParams>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000,
  prepare: async () => {
    const location = await getLocationFromConfig();
    return { location };
  },
  cacheKey: ({ location }) => location ? `${location.lat}:${location.lon}` : '_',
  execute: async ({ location }) => {
    if (!location) {
      return NextResponse.json(
        { error: 'Missing latitude/longitude in weather settings' },
        { status: 400 },
      );
    }

    const apiKey = await requireSecret('openweathermap_key', 'OpenWeatherMap');
    if (apiKey instanceof NextResponse) return apiKey;

    const { lat, lon } = location;
    const airRes = await fetchWithTimeout(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`,
    );

    if (airRes.status === 401 || airRes.status === 403) {
      log.warn(`Air pollution API rejected the OpenWeatherMap key (${airRes.status})`);
      return setupErrorResponse(`OpenWeatherMap rejected the API key (${airRes.status})`, 'invalidKey', 'OpenWeatherMap');
    }
    if (!airRes.ok) {
      log.error(`Air pollution API returned ${airRes.status}`);
      return NextResponse.json({ error: 'Failed to fetch air quality data' }, { status: 502 });
    }

    const airData = await airRes.json();
    const entry = airData.list?.[0];
    if (!entry) {
      return NextResponse.json({ error: 'No air pollution data returned' }, { status: 502 });
    }

    const aqi = entry.main.aqi;
    const components = entry.components;

    return {
      aqi,
      pm25: components.pm2_5 ?? 0,
      pm10: components.pm10 ?? 0,
      o3: components.o3 ?? 0,
      no2: components.no2 ?? 0,
    };
  },
  errorMessage: 'Failed to fetch air quality data',
});

/** @internal */
export { GET, cache };
