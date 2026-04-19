import { NextResponse } from 'next/server';
import { createWeatherProvider } from '@/lib/weather';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, getLocationFromConfig, requireSecret } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const secretKeyMap: Record<string, 'openweathermap_key' | 'weatherapi_key' | 'pirateweather_key'> = {
  openweathermap: 'openweathermap_key',
  weatherapi: 'weatherapi_key',
  pirateweather: 'pirateweather_key',
};

interface WeatherParams {
  type: string;
  provider: string;
  location: { lat: string; lon: string } | null;
  units: string;
}

const { GET, cache } = cachedProxyRoute<unknown, WeatherParams>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000,
  prepare: async (request) => {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') ?? 'both';

    let config;
    try { config = await readConfig(); } catch { /* config not available */ }
    const ws = config?.settings?.weather;

    const provider = searchParams.get('provider') ?? ws?.provider ?? 'openweathermap';
    const location = await getLocationFromConfig(searchParams, config);
    const units = searchParams.get('units') ?? ws?.units ?? 'imperial';

    return { type, provider, location, units };
  },
  cacheKey: ({ provider, location, units, type }) => {
    const lat = location?.lat ?? '_';
    const lon = location?.lon ?? '_';
    return `${provider}:${lat}:${lon}:${units}:${type}`;
  },
  execute: async ({ type, provider, location, units }) => {
    if (!location) {
      return NextResponse.json(
        { error: 'Missing required query params: lat, lon' },
        { status: 400 },
      );
    }

    const { lat, lon } = location;

    // Keyless providers (NOAA, Open-Meteo, Yr.no, SMHI) skip the secret lookup
    const secretKey = secretKeyMap[provider];
    let apiKey: string | undefined;
    if (secretKey) {
      const result = await requireSecret(secretKey, provider);
      if (result instanceof NextResponse) return result;
      apiKey = result;
    }

    const weatherProvider = createWeatherProvider(provider, apiKey);
    let result: Record<string, unknown>;

    if (type === 'forecast') {
      const forecast = await weatherProvider.getForecast(Number(lat), Number(lon), units);
      result = { forecast };
    } else if (type === 'hourly') {
      const hourly = await weatherProvider.getHourly(Number(lat), Number(lon), units);
      result = { hourly };
    } else {
      const [hourly, forecast] = await Promise.all([
        weatherProvider.getHourly(Number(lat), Number(lon), units),
        weatherProvider.getForecast(Number(lat), Number(lon), units),
      ]);
      result = { hourly, forecast };
    }

    // Include minutely and alerts if the provider supports them
    if (weatherProvider.getMinutely) {
      result.minutely = await weatherProvider.getMinutely(Number(lat), Number(lon), units);
    }
    if (weatherProvider.getAlerts) {
      result.alerts = await weatherProvider.getAlerts(Number(lat), Number(lon), units);
    }

    return result;
  },
  errorMessage: 'Failed to fetch weather',
});

/** @internal */
export { GET, cache };
