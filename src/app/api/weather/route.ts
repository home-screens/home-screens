import { NextResponse } from 'next/server';
import { createWeatherProvider } from '@/lib/weather';
import { reconcileTodayRange } from '@/lib/weather/derive';
import { recordReading, readingKey, type DayRange } from '@/lib/weather/today-record';
import type { HourlyWeather, ForecastDay } from '@/lib/weather';
import { readConfig } from '@/lib/config';
import { cachedProxyRoute, getLocationFromConfig, requireSecret } from '@/lib/api-utils';
import { weatherProviderName } from '@/lib/weather-provider-names';

export const dynamic = 'force-dynamic';

const secretKeyMap: Record<string, 'openweathermap_key' | 'weatherapi_key' | 'pirateweather_key' | 'metoffice_key'> = {
  openweathermap: 'openweathermap_key',
  weatherapi: 'weatherapi_key',
  pirateweather: 'pirateweather_key',
  metoffice: 'metoffice_key',
};

interface WeatherParams {
  type: string;
  provider: string;
  location: { lat: string; lon: string } | null;
  units: string;
}

/**
 * Write the current reading into the record for the forecast's day 0 and
 * return that day's range so far. The forecast's date is the location's own
 * calendar day, so no timezone is involved. A disk problem must not cost
 * the wall its weather, so a failure here is logged and the range simply
 * goes unrecorded this poll.
 */
async function noteReading(p: WeatherParams, hourly: HourlyWeather[], forecast: ForecastDay[]): Promise<DayRange | undefined> {
  const now = hourly[0];
  const today = forecast[0];
  if (!p.location || !now || !today || !Number.isFinite(now.temp)) return undefined;
  try {
    return await recordReading(readingKey(p.provider, p.location.lat, p.location.lon, p.units), today.date, now.temp);
  } catch (err) {
    console.error('[weather] could not record today\'s reading:', err);
    return undefined;
  }
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
  execute: async (params) => {
    const { type, provider, location, units } = params;
    if (!location) {
      return NextResponse.json(
        { error: 'Missing required query params: lat, lon' },
        { status: 400 },
      );
    }

    const { lat, lon } = location;

    // Keyless providers (NOAA, Open-Meteo, Yr.no, SMHI) skip the secret lookup;
    // keyed providers (OWM, WeatherAPI, Pirate Weather, Met Office) require one.
    const secretKey = secretKeyMap[provider];
    let apiKey: string | undefined;
    if (secretKey) {
      const result = await requireSecret(secretKey, weatherProviderName(provider), 'weather');
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
      const seen = await noteReading(params, hourly, forecast);
      result = { hourly, forecast: reconcileTodayRange(forecast, hourly, seen) };
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
