import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import type { WeatherIconName } from './icons';
import { FALLBACK_ICON } from './icons';
import { celsiusToUnit, msToWindUnit, mmToPrecipUnit } from './units';
import { createTTLCache } from '../api-utils';
import { logger } from '@/lib/logger';

const log = logger('metoffice');

// ── UK Met Office Weather DataHub ────────────────────────────────────
// https://datahub.metoffice.gov.uk/docs/f/category/site-specific
// Auth: single `apikey` header. All responses are metric (°C, m/s, Pa, mm).
// Coverage: global. Best inside UK; lower resolution outside.
//
// Free tier is 360 calls/day across the Site-Specific API family, so this
// provider *must* cache. We hit 2 endpoints (hourly + daily) per location
// fetch, so with a 30-min TTL we spend ~96 upstream calls/day/location —
// fine for 1 location, tight for 3+. The circuit breaker below stops
// traffic before the account starts seeing 429s.

const ENDPOINT_BASE = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point';
const CACHE_TTL_MS = 30 * 60 * 1000;
const DAILY_REQUEST_CAP = 320; // hard ceiling below the 360/day free-tier quota
const DAILY_WARN_HIGH = 280;
const DAILY_WARN_MED = 180;

// ── Response types ───────────────────────────────────────────────────

interface MetOfficeTimeseriesEntry {
  time: string;
  screenTemperature?: number;
  feelsLikeTemperature?: number;
  screenDewPointTemperature?: number;
  screenRelativeHumidity?: number;
  windSpeed10m?: number;
  windGustSpeed10m?: number;
  windDirectionFrom10m?: number;
  mslp?: number;
  visibility?: number;
  uvIndex?: number;
  significantWeatherCode?: number;
  precipitationRate?: number;
  totalPrecipAmount?: number;
  probOfPrecipitation?: number;
  // Daily-only fields
  dayMaxScreenTemperature?: number;
  nightMinScreenTemperature?: number;
  daySignificantWeatherCode?: number;
  nightSignificantWeatherCode?: number;
  dayProbabilityOfPrecipitation?: number;
  nightProbabilityOfPrecipitation?: number;
  maxUvIndex?: number;
}

interface MetOfficeFeature {
  properties: {
    timeSeries: MetOfficeTimeseriesEntry[];
    location?: { name?: string };
    modelRunDate?: string;
  };
}

interface MetOfficeResponse {
  features: MetOfficeFeature[];
}

type Frequency = 'hourly' | 'daily';

// ── Significant weather code → icon vocabulary ───────────────────────
// Codes are shared between day and night variants; the code itself tells
// you which one (0 vs 1, 2 vs 3, etc.) so no separate isDay swap needed.

const WEATHER_CODE_TO_ICON: Record<number, WeatherIconName> = {
  [-1]: FALLBACK_ICON, // Not available
  0: 'moon',           // Clear night
  1: 'sun',            // Sunny day
  2: 'cloud-moon',     // Partly cloudy (night)
  3: 'cloud-sun',      // Partly cloudy (day)
  5: 'cloud-fog',      // Mist
  6: 'cloud-fog',      // Fog
  7: 'cloud',          // Cloudy
  8: 'cloud',          // Overcast
  9: 'cloud-rain',     // Light rain shower (night)
  10: 'cloud-rain',    // Light rain shower (day)
  11: 'cloud-drizzle', // Drizzle
  12: 'cloud-drizzle', // Light rain
  13: 'cloud-rain',    // Heavy rain shower (night)
  14: 'cloud-rain',    // Heavy rain shower (day)
  15: 'cloud-rain',    // Heavy rain
  16: 'cloud-hail',    // Sleet shower (night)
  17: 'cloud-hail',    // Sleet shower (day)
  18: 'cloud-hail',    // Sleet
  19: 'cloud-hail',    // Hail shower (night)
  20: 'cloud-hail',    // Hail shower (day)
  21: 'cloud-hail',    // Hail
  22: 'snowflake',     // Light snow shower (night)
  23: 'snowflake',     // Light snow shower (day)
  24: 'snowflake',     // Light snow
  25: 'snowflake',     // Heavy snow shower (night)
  26: 'snowflake',     // Heavy snow shower (day)
  27: 'snowflake',     // Heavy snow
  28: 'cloud-lightning', // Thunder shower (night)
  29: 'cloud-lightning', // Thunder shower (day)
  30: 'cloud-lightning', // Thunder
};

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  [-1]: '',
  0: 'Clear',
  1: 'Sunny',
  2: 'Partly cloudy',
  3: 'Partly cloudy',
  5: 'Mist',
  6: 'Fog',
  7: 'Cloudy',
  8: 'Overcast',
  9: 'Light rain shower',
  10: 'Light rain shower',
  11: 'Drizzle',
  12: 'Light rain',
  13: 'Heavy rain shower',
  14: 'Heavy rain shower',
  15: 'Heavy rain',
  16: 'Sleet shower',
  17: 'Sleet shower',
  18: 'Sleet',
  19: 'Hail shower',
  20: 'Hail shower',
  21: 'Hail',
  22: 'Light snow shower',
  23: 'Light snow shower',
  24: 'Light snow',
  25: 'Heavy snow shower',
  26: 'Heavy snow shower',
  27: 'Heavy snow',
  28: 'Thunder shower',
  29: 'Thunder shower',
  30: 'Thunder',
};

export function weatherCodeToIcon(code: number | undefined): WeatherIconName {
  if (code == null) return FALLBACK_ICON;
  return WEATHER_CODE_TO_ICON[code] ?? FALLBACK_ICON;
}

export function weatherCodeDescription(code: number | undefined): string {
  if (code == null) return '';
  return WEATHER_CODE_DESCRIPTIONS[code] ?? '';
}

// ── Met Office provider ──────────────────────────────────────────────

/** @internal */
export class MetOfficeProvider implements WeatherProvider {
  // Per-frequency, per-location cache. 30-min TTL aligns with Met Office's
  // hourly model-run cadence — any call inside the window would return
  // identical data anyway.
  private static cache = createTTLCache<MetOfficeResponse>(CACHE_TTL_MS);

  // Coalesces concurrent cache misses for the same key so we only issue one
  // upstream call and bump the counter once, instead of one per caller.
  private static inFlight = new Map<string, Promise<MetOfficeResponse>>();

  // Daily request counter (resets at UTC midnight). Guards against cache-bust
  // bugs or misconfigurations from blowing the Met Office daily quota.
  private static requestCount = 0;
  private static countDate = MetOfficeProvider.todayUtc();

  private apiKey: string;

  constructor(apiKey?: string) {
    if (!apiKey) throw new Error('Met Office requires an API key');
    this.apiKey = apiKey;
  }

  private static todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private static bumpAndCheckBudget(): void {
    const today = MetOfficeProvider.todayUtc();
    if (today !== MetOfficeProvider.countDate) {
      MetOfficeProvider.countDate = today;
      MetOfficeProvider.requestCount = 0;
    }
    MetOfficeProvider.requestCount += 1;
    const n = MetOfficeProvider.requestCount;
    if (n > DAILY_REQUEST_CAP) {
      throw new Error(
        `Met Office daily request cap reached (${DAILY_REQUEST_CAP} of 360/day free quota). ` +
          `Cache will serve stale data until UTC midnight. ` +
          `Consider reducing weather locations or upgrading your DataHub plan.`,
      );
    }
    if (n === DAILY_WARN_HIGH) {
      log.warn(`High request volume: ${n}/${DAILY_REQUEST_CAP} today`);
    } else if (n === DAILY_WARN_MED) {
      log.warn(`Request volume: ${n}/${DAILY_REQUEST_CAP} today`);
    }
  }

  private async fetchData(
    frequency: Frequency,
    lat: number,
    lon: number,
  ): Promise<MetOfficeResponse> {
    const latStr = lat.toFixed(4);
    const lonStr = lon.toFixed(4);
    const key = `${frequency}:${latStr},${lonStr}`;

    const cached = MetOfficeProvider.cache.get(key);
    if (cached) return cached;

    // If another caller is already fetching this key, reuse its promise so we
    // don't issue duplicate upstream calls (each of which would bump the counter).
    const existing = MetOfficeProvider.inFlight.get(key);
    if (existing) return existing;

    MetOfficeProvider.bumpAndCheckBudget();

    const url =
      `${ENDPOINT_BASE}/${frequency}` +
      `?latitude=${latStr}&longitude=${lonStr}` +
      `&excludeParameterMetadata=true&includeLocationName=false`;

    const promise = fetchWeatherJSON<MetOfficeResponse>(url, 'Met Office', {
      headers: { apikey: this.apiKey, Accept: 'application/json' },
    })
      .then((data) => {
        MetOfficeProvider.cache.set(key, data);
        return data;
      })
      .finally(() => {
        MetOfficeProvider.inFlight.delete(key);
      });

    MetOfficeProvider.inFlight.set(key, promise);
    return promise;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchData('hourly', lat, lon);
    const series = data.features[0]?.properties.timeSeries ?? [];
    const isMetric = units === 'metric';
    const nowMs = Date.now();

    return series
      .filter((e) => new Date(e.time).getTime() >= nowMs - 3600000)
      .slice(0, 48)
      .map((e) => ({
        time: e.time,
        temp: e.screenTemperature != null ? celsiusToUnit(e.screenTemperature, isMetric) : 0,
        feelsLike: e.feelsLikeTemperature != null
          ? celsiusToUnit(e.feelsLikeTemperature, isMetric)
          : undefined,
        humidity: e.screenRelativeHumidity,
        icon: weatherCodeToIcon(e.significantWeatherCode),
        description: weatherCodeDescription(e.significantWeatherCode),
        windSpeed: e.windSpeed10m != null
          ? Math.round(msToWindUnit(e.windSpeed10m, isMetric))
          : undefined,
        precipProbability: e.probOfPrecipitation,
        // mslp is in Pascals; divide by 100 for hPa to match the rest of the providers.
        pressure: e.mslp != null ? Math.round(e.mslp / 100) : undefined,
        dewPoint: e.screenDewPointTemperature != null
          ? celsiusToUnit(e.screenDewPointTemperature, isMetric)
          : undefined,
      }));
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    // Met Office's daily endpoint returns day/night temperature splits and
    // precipitation probability, but not wind speed or total precipitation
    // amount — those are hourly-only. Fetch both in parallel and aggregate
    // wind/precip by date so daily views show those stats for days 1-2
    // (the hourly endpoint's 48-hour window). Later days gracefully omit them.
    const [dailyData, hourlyData] = await Promise.all([
      this.fetchData('daily', lat, lon),
      this.fetchData('hourly', lat, lon),
    ]);
    const dailySeries = dailyData.features[0]?.properties.timeSeries ?? [];
    const hourlySeries = hourlyData.features[0]?.properties.timeSeries ?? [];
    const isMetric = units === 'metric';

    // Bucket hourly stats by date for aggregation
    const hourlyByDate = new Map<string, { winds: number[]; precipMm: number }>();
    for (const h of hourlySeries) {
      const d = h.time.split('T')[0];
      let bucket = hourlyByDate.get(d);
      if (!bucket) {
        bucket = { winds: [], precipMm: 0 };
        hourlyByDate.set(d, bucket);
      }
      if (h.windSpeed10m != null) bucket.winds.push(h.windSpeed10m);
      if (h.totalPrecipAmount != null) bucket.precipMm += h.totalPrecipAmount;
    }

    return dailySeries.slice(0, 7).map((e) => {
      const date = e.time.split('T')[0];
      // Daily endpoint gives explicit day/night splits. Use day code for icon
      // when present (the "what the day looks like" signal), falling back to
      // the night code so we still have something when the day is over.
      const code = e.daySignificantWeatherCode ?? e.nightSignificantWeatherCode;
      const high = e.dayMaxScreenTemperature;
      const low = e.nightMinScreenTemperature;
      const dayProb = e.dayProbabilityOfPrecipitation;
      const nightProb = e.nightProbabilityOfPrecipitation;
      const maxProb = dayProb != null && nightProb != null
        ? Math.max(dayProb, nightProb)
        : dayProb ?? nightProb;

      const hourlyBucket = hourlyByDate.get(date);
      const avgWindMs = hourlyBucket && hourlyBucket.winds.length
        ? hourlyBucket.winds.reduce((a, b) => a + b, 0) / hourlyBucket.winds.length
        : undefined;

      return {
        date,
        high: high != null ? Math.round(celsiusToUnit(high, isMetric)) : 0,
        low: low != null ? Math.round(celsiusToUnit(low, isMetric)) : 0,
        icon: weatherCodeToIcon(code),
        description: weatherCodeDescription(code),
        precipProbability: maxProb,
        precipAmount: hourlyBucket
          ? Math.round(mmToPrecipUnit(hourlyBucket.precipMm, isMetric) * 100) / 100
          : undefined,
        humidity: e.screenRelativeHumidity,
        windSpeed: avgWindMs != null
          ? Math.round(msToWindUnit(avgWindMs, isMetric))
          : undefined,
      };
    });
  }
}
