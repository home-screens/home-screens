import { NextResponse } from 'next/server';
import { createTTLCache, getLocationFromConfig, fetchWithTimeout, errorResponse, requireSecret, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** @internal */
export const cache = createTTLCache<Record<string, unknown>>(5 * 60 * 1000); // 5 minutes

export const GET = withDisplayAuth(async () => {
  try {
    const location = await getLocationFromConfig();
    if (!location) {
      return NextResponse.json(
        { error: 'Missing latitude/longitude in weather settings' },
        { status: 400 },
      );
    }

    const apiKey = await requireSecret('openweathermap_key', 'OpenWeatherMap');
    if (apiKey instanceof NextResponse) return apiKey;

    const { lat, lon } = location;

    const cacheKey = `${lat}:${lon}`;
    const cached = cache.get(cacheKey);
    if (cached) return NextResponse.json(cached);

    const [airRes, uvRes] = await Promise.all([
      fetchWithTimeout(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`,
      ),
      // NOTE: /data/2.5/uvi is deprecated; may not work on newer API keys.
      // If UV returns 0, consider migrating to One Call API 3.0.
      // Caught separately so a UV failure doesn't reject the entire Promise.all.
      fetchWithTimeout(
        `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${apiKey}`,
      ).catch(() => null),
    ]);

    if (!airRes.ok) {
      return NextResponse.json({ error: `Air pollution API returned ${airRes.status}` }, { status: 502 });
    }

    const airData = await airRes.json();
    const entry = airData.list?.[0];
    if (!entry) {
      return NextResponse.json({ error: 'No air pollution data returned' }, { status: 502 });
    }

    const aqi = entry.main.aqi;
    const components = entry.components;

    let uv = 0;
    if (uvRes?.ok) {
      const uvData = await uvRes.json();
      uv = uvData.value ?? 0;
    }

    if (!uvRes?.ok || uv === 0) {
      console.warn(
        '[air-quality] UV index returned %s — the /data/2.5/uvi endpoint is deprecated by OpenWeatherMap. ' +
        'UV data may be unavailable for newer API keys. Consider migrating to One Call API 3.0.',
        uvRes?.ok ? '0' : `HTTP ${uvRes?.status ?? 'error'}`,
      );
    }

    const result = {
      aqi,
      pm25: components.pm2_5 ?? 0,
      pm10: components.pm10 ?? 0,
      o3: components.o3 ?? 0,
      no2: components.no2 ?? 0,
      uv,
    };

    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, 'Failed to fetch air quality data');
  }
}, 'Failed to fetch air quality data');
