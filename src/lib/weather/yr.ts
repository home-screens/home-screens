import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import type { WeatherIconName } from './icons';
import { FALLBACK_ICON } from './icons';
import { celsiusToUnit, msToWindUnit, mmToPrecipUnit } from './units';
import pkg from '../../../package.json';

// ── Yr.no / MET Norway API response types ────────────────────────────
// https://api.met.no/weatherapi/locationforecast/2.0/documentation

interface YrInstantDetails {
  air_temperature?: number;
  relative_humidity?: number;
  wind_speed?: number;
  air_pressure_at_sea_level?: number;
  cloud_area_fraction?: number;
}

interface YrSummary {
  symbol_code?: string;
}

interface YrPeriodDetails {
  precipitation_amount?: number;
  probability_of_precipitation?: number;
}

interface YrTimeseriesEntry {
  time: string;
  data: {
    instant: { details?: YrInstantDetails };
    next_1_hours?: { summary?: YrSummary; details?: YrPeriodDetails };
    next_6_hours?: { summary?: YrSummary; details?: YrPeriodDetails };
    next_12_hours?: { summary?: YrSummary; details?: YrPeriodDetails };
  };
}

interface YrResponse {
  properties: {
    timeseries: YrTimeseriesEntry[];
  };
}

// ── Yr symbol_code → icon vocabulary ─────────────────────────────────
// Symbol codes look like "partlycloudy_day", "fair_night", "rain",
// "snowshowers_polartwilight". We strip the daypart suffix, look up the
// base, then swap to night variants when needed.

const SYMBOL_TO_ICON: Record<string, WeatherIconName> = {
  clearsky: 'sun',
  fair: 'cloud-sun',
  partlycloudy: 'cloud-sun',
  cloudy: 'cloud',
  fog: 'cloud-fog',
  rain: 'cloud-rain',
  rainshowers: 'cloud-rain',
  heavyrain: 'cloud-rain',
  heavyrainshowers: 'cloud-rain',
  lightrain: 'cloud-drizzle',
  lightrainshowers: 'cloud-drizzle',
  sleet: 'cloud-hail',
  sleetshowers: 'cloud-hail',
  heavysleet: 'cloud-hail',
  heavysleetshowers: 'cloud-hail',
  lightsleet: 'cloud-hail',
  lightsleetshowers: 'cloud-hail',
  snow: 'snowflake',
  snowshowers: 'snowflake',
  heavysnow: 'snowflake',
  heavysnowshowers: 'snowflake',
  lightsnow: 'snowflake',
  lightsnowshowers: 'snowflake',
  rainandthunder: 'cloud-lightning',
  rainshowersandthunder: 'cloud-lightning',
  heavyrainandthunder: 'cloud-lightning',
  heavyrainshowersandthunder: 'cloud-lightning',
  lightrainandthunder: 'cloud-lightning',
  lightrainshowersandthunder: 'cloud-lightning',
  sleetandthunder: 'cloud-lightning',
  sleetshowersandthunder: 'cloud-lightning',
  heavysleetandthunder: 'cloud-lightning',
  heavysleetshowersandthunder: 'cloud-lightning',
  lightsleetandthunder: 'cloud-lightning',
  lightsleetshowersandthunder: 'cloud-lightning',
  snowandthunder: 'cloud-lightning',
  snowshowersandthunder: 'cloud-lightning',
  heavysnowandthunder: 'cloud-lightning',
  heavysnowshowersandthunder: 'cloud-lightning',
  lightsnowandthunder: 'cloud-lightning',
  lightsnowshowersandthunder: 'cloud-lightning',
};

const NIGHT_VARIANTS: Partial<Record<WeatherIconName, WeatherIconName>> = {
  sun: 'moon',
  'cloud-sun': 'cloud-moon',
};

export function symbolToIcon(symbolCode: string | undefined): WeatherIconName {
  if (!symbolCode) return FALLBACK_ICON;
  const idx = symbolCode.lastIndexOf('_');
  const base = idx === -1 ? symbolCode : symbolCode.slice(0, idx);
  const daypart = idx === -1 ? '' : symbolCode.slice(idx + 1);
  const icon = SYMBOL_TO_ICON[base] ?? FALLBACK_ICON;
  if (daypart === 'night' || daypart === 'polartwilight') {
    return NIGHT_VARIANTS[icon] ?? icon;
  }
  return icon;
}

export function symbolDescription(symbolCode: string | undefined): string {
  if (!symbolCode) return '';
  const idx = symbolCode.lastIndexOf('_');
  const base = idx === -1 ? symbolCode : symbolCode.slice(0, idx);
  // Inject spaces around known compound tokens, ordered specific → generic so
  // "showersandthunder" splits into three words, not "showers" + "andthunder".
  return base
    .replace(/^(heavy|light)/, '$1 ')
    .replace(/^partly/, 'partly ')
    .replace(/showersandthunder/, ' showers and thunder')
    .replace(/andthunder/, ' and thunder')
    .replace(/showers/, ' showers')
    .replace(/clearsky/, 'clear sky')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

// ── Yr.no provider ───────────────────────────────────────────────────

/** @internal */
export class YrProvider implements WeatherProvider {
  // MET Norway requires an identifying User-Agent in their documented format
  // (`AppName/version contact-url`). Without one, requests get a 403.
  private static USER_AGENT = `home-screens/${pkg.version} github.com/home-screens/home-screens`;
  // MET Norway asks clients to throttle to ≥10 minutes per location. The
  // route-level cache covers most cases, but this guards against accidental
  // hammering when the route cache is bypassed (cache busts, manual refresh).
  private static MIN_INTERVAL_MS = 10 * 60 * 1000;
  private static cache = new Map<string, { data: YrResponse; ts: number }>();
  private static MAX_CACHE = 20;

  // No API key needed
  constructor() {}

  private async fetchData(lat: number, lon: number): Promise<YrResponse> {
    // MET Norway requires lat/lon to ≤4 decimals
    const latStr = lat.toFixed(4);
    const lonStr = lon.toFixed(4);
    const key = `${latStr},${lonStr}`;

    const cached = YrProvider.cache.get(key);
    if (cached && Date.now() - cached.ts < YrProvider.MIN_INTERVAL_MS) return cached.data;

    const data = await fetchWeatherJSON<YrResponse>(
      `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latStr}&lon=${lonStr}`,
      'Yr.no',
      { headers: { 'User-Agent': YrProvider.USER_AGENT } },
    );

    YrProvider.cache.set(key, { data, ts: Date.now() });
    if (YrProvider.cache.size > YrProvider.MAX_CACHE) {
      const oldest = YrProvider.cache.keys().next().value;
      if (oldest) YrProvider.cache.delete(oldest);
    }
    return data;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchData(lat, lon);
    const isMetric = units === 'metric';
    const nowMs = Date.now();

    return data.properties.timeseries
      .filter((entry) => new Date(entry.time).getTime() >= nowMs - 3600000)
      .slice(0, 48)
      .map((entry) => {
        const inst = entry.data.instant.details ?? {};
        const next1 = entry.data.next_1_hours;
        const symbol = next1?.summary?.symbol_code;

        return {
          time: entry.time,
          temp: inst.air_temperature != null ? celsiusToUnit(inst.air_temperature, isMetric) : 0,
          humidity: inst.relative_humidity,
          icon: symbolToIcon(symbol),
          description: symbolDescription(symbol),
          windSpeed: inst.wind_speed != null
            ? Math.round(msToWindUnit(inst.wind_speed, isMetric))
            : undefined,
          precipProbability: next1?.details?.probability_of_precipitation ?? 0,
          pressure: inst.air_pressure_at_sea_level != null
            ? Math.round(inst.air_pressure_at_sea_level)
            : undefined,
        };
      });
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const data = await this.fetchData(lat, lon);
    const isMetric = units === 'metric';

    // Group timeseries by date, then derive high/low temps and the most
    // common 6-hour symbol per day.
    const byDate = new Map<string, {
      temps: number[];
      symbols: Map<string, number>;
      precipMm: number;
      precipProb: number;
      humidities: number[];
      windSpeedsMs: number[];
    }>();

    for (const entry of data.properties.timeseries) {
      const date = entry.time.split('T')[0];
      let day = byDate.get(date);
      if (!day) {
        day = { temps: [], symbols: new Map(), precipMm: 0, precipProb: 0, humidities: [], windSpeedsMs: [] };
        byDate.set(date, day);
      }

      const inst = entry.data.instant.details ?? {};
      if (inst.air_temperature != null) day.temps.push(inst.air_temperature);
      if (inst.relative_humidity != null) day.humidities.push(inst.relative_humidity);
      if (inst.wind_speed != null) day.windSpeedsMs.push(inst.wind_speed);

      const next6 = entry.data.next_6_hours;
      const sym = next6?.summary?.symbol_code;
      if (sym) day.symbols.set(sym, (day.symbols.get(sym) ?? 0) + 1);
      if (next6?.details?.precipitation_amount != null) {
        day.precipMm += next6.details.precipitation_amount;
      }
      if (next6?.details?.probability_of_precipitation != null) {
        day.precipProb = Math.max(day.precipProb, next6.details.probability_of_precipitation);
      }
    }

    return Array.from(byDate.entries()).slice(0, 7).map(([date, day]) => {
      const high = day.temps.length ? Math.max(...day.temps) : 0;
      const low = day.temps.length ? Math.min(...day.temps) : 0;

      let dominantSymbol: string | undefined;
      let dominantCount = 0;
      for (const [sym, count] of day.symbols) {
        if (count > dominantCount) {
          dominantSymbol = sym;
          dominantCount = count;
        }
      }

      const avgWindMs = day.windSpeedsMs.length
        ? day.windSpeedsMs.reduce((a, b) => a + b, 0) / day.windSpeedsMs.length
        : undefined;
      const avgHumidity = day.humidities.length
        ? day.humidities.reduce((a, b) => a + b, 0) / day.humidities.length
        : undefined;

      return {
        date,
        high: Math.round(celsiusToUnit(high, isMetric)),
        low: Math.round(celsiusToUnit(low, isMetric)),
        icon: symbolToIcon(dominantSymbol),
        description: symbolDescription(dominantSymbol),
        precipProbability: Math.round(day.precipProb),
        precipAmount: Math.round(mmToPrecipUnit(day.precipMm, isMetric) * 100) / 100,
        humidity: avgHumidity != null ? Math.round(avgHumidity) : undefined,
        windSpeed: avgWindMs != null ? Math.round(msToWindUnit(avgWindMs, isMetric)) : undefined,
      };
    });
  }
}
