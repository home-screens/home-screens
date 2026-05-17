import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import type { WeatherIconName } from './icons';
import { FALLBACK_ICON } from './icons';
import { celsiusToUnit, msToWindUnit, mmToPrecipUnit } from './units';

// ── SMHI (Swedish Meteorological and Hydrological Institute) ─────────
// https://opendata.smhi.se/metfcst/snow1gv1
// Coverage: Nordic region — returns 404 outside the SMHI bbox.
//
// Migrated from the deprecated `pmp3g v2` endpoint (shut down 2026-03-31)
// to `snow1g v1`. Symbol codes (1–27) are preserved across both APIs.

interface SMHIDataPoint {
  air_temperature?: number;
  relative_humidity?: number;
  wind_speed?: number;
  air_pressure_at_mean_sea_level?: number;
  symbol_code?: number;
  precipitation_amount_mean?: number;
  probability_of_precipitation?: number;
}

interface SMHITimeseriesEntry {
  time: string;
  data: SMHIDataPoint;
}

interface SMHIResponse {
  timeSeries: SMHITimeseriesEntry[];
}

// ── SMHI symbol_code (1-27) → icon vocabulary ────────────────────────
// Same code space as the legacy Wsymb2 parameter. For day/night-sensitive
// symbols (clear/partial cloud) we resolve via an intermediate marker so
// the day/night swap stays in one place.

type SMHIIntermediate = WeatherIconName | 'clear' | 'partly-cloudy';

const WSYMB2_TO_ICON: Record<number, SMHIIntermediate> = {
  1: 'clear',           // Clear sky
  2: 'partly-cloudy',   // Nearly clear sky
  3: 'partly-cloudy',   // Variable cloudiness
  4: 'partly-cloudy',   // Halfclear sky
  5: 'cloud',           // Cloudy sky
  6: 'cloud',           // Overcast
  7: 'cloud-fog',       // Fog
  8: 'cloud-rain',      // Light rain showers
  9: 'cloud-rain',      // Moderate rain showers
  10: 'cloud-rain',     // Heavy rain showers
  11: 'cloud-lightning', // Thunderstorm
  12: 'cloud-hail',     // Light sleet showers
  13: 'cloud-hail',     // Moderate sleet showers
  14: 'cloud-hail',     // Heavy sleet showers
  15: 'snowflake',      // Light snow showers
  16: 'snowflake',      // Moderate snow showers
  17: 'snowflake',      // Heavy snow showers
  18: 'cloud-drizzle',  // Light rain
  19: 'cloud-rain',     // Moderate rain
  20: 'cloud-rain',     // Heavy rain
  21: 'cloud-lightning', // Thunder
  22: 'cloud-hail',     // Light sleet
  23: 'cloud-hail',     // Moderate sleet
  24: 'cloud-hail',     // Heavy sleet
  25: 'snowflake',      // Light snowfall
  26: 'snowflake',      // Moderate snowfall
  27: 'snowflake',      // Heavy snowfall
};

const WSYMB2_DESCRIPTIONS: Record<number, string> = {
  1: 'Clear sky',
  2: 'Nearly clear sky',
  3: 'Variable cloudiness',
  4: 'Halfclear sky',
  5: 'Cloudy sky',
  6: 'Overcast',
  7: 'Fog',
  8: 'Light rain showers',
  9: 'Moderate rain showers',
  10: 'Heavy rain showers',
  11: 'Thunderstorm',
  12: 'Light sleet showers',
  13: 'Moderate sleet showers',
  14: 'Heavy sleet showers',
  15: 'Light snow showers',
  16: 'Moderate snow showers',
  17: 'Heavy snow showers',
  18: 'Light rain',
  19: 'Moderate rain',
  20: 'Heavy rain',
  21: 'Thunder',
  22: 'Light sleet',
  23: 'Moderate sleet',
  24: 'Heavy sleet',
  25: 'Light snowfall',
  26: 'Moderate snowfall',
  27: 'Heavy snowfall',
};

export function wsymb2ToIcon(code: number, isDay: boolean): WeatherIconName {
  const intermediate = WSYMB2_TO_ICON[code];
  if (!intermediate) return FALLBACK_ICON;
  if (intermediate === 'clear') return isDay ? 'sun' : 'moon';
  if (intermediate === 'partly-cloudy') return isDay ? 'cloud-sun' : 'cloud-moon';
  return intermediate;
}

// ── SMHI provider ────────────────────────────────────────────────────

/** @internal */
export class SMHIProvider implements WeatherProvider {
  // No API key needed
  constructor() {}

  private async fetchData(lat: number, lon: number): Promise<SMHIResponse> {
    // SMHI accepts up to 6 decimals; lon comes before lat in the path
    const latStr = lat.toFixed(6);
    const lonStr = lon.toFixed(6);
    return fetchWeatherJSON<SMHIResponse>(
      `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lonStr}/lat/${latStr}/data.json`,
      'SMHI',
    );
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchData(lat, lon);
    const isMetric = units === 'metric';
    const nowMs = Date.now();

    return data.timeSeries
      .filter((entry) => new Date(entry.time).getTime() >= nowMs - 3600000)
      .slice(0, 48)
      .map((entry) => {
        const d = entry.data;
        const hour = new Date(entry.time).getUTCHours();
        const isDay = hour >= 6 && hour < 18;

        return {
          time: entry.time,
          temp: d.air_temperature != null ? celsiusToUnit(d.air_temperature, isMetric) : 0,
          humidity: d.relative_humidity,
          icon: d.symbol_code != null ? wsymb2ToIcon(d.symbol_code, isDay) : FALLBACK_ICON,
          description: d.symbol_code != null
            ? (WSYMB2_DESCRIPTIONS[d.symbol_code] ?? 'Unknown')
            : 'Unknown',
          windSpeed: d.wind_speed != null ? Math.round(msToWindUnit(d.wind_speed, isMetric)) : undefined,
          precipProbability: d.probability_of_precipitation ?? 0,
          pressure: d.air_pressure_at_mean_sea_level != null
            ? Math.round(d.air_pressure_at_mean_sea_level)
            : undefined,
        };
      });
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const data = await this.fetchData(lat, lon);
    const isMetric = units === 'metric';

    const byDate = new Map<string, {
      temps: number[];
      symbols: Map<number, number>;
      precipMm: number;
      maxPrecipProb: number;
      windSpeedsMs: number[];
      humidities: number[];
    }>();

    for (const entry of data.timeSeries) {
      const date = entry.time.split('T')[0];
      let day = byDate.get(date);
      if (!day) {
        day = { temps: [], symbols: new Map(), precipMm: 0, maxPrecipProb: 0, windSpeedsMs: [], humidities: [] };
        byDate.set(date, day);
      }
      const d = entry.data;
      if (d.air_temperature != null) day.temps.push(d.air_temperature);
      if (d.relative_humidity != null) day.humidities.push(d.relative_humidity);
      if (d.wind_speed != null) day.windSpeedsMs.push(d.wind_speed);
      if (d.symbol_code != null) day.symbols.set(d.symbol_code, (day.symbols.get(d.symbol_code) ?? 0) + 1);
      if (d.precipitation_amount_mean != null) day.precipMm += d.precipitation_amount_mean;
      if (d.probability_of_precipitation != null && d.probability_of_precipitation > day.maxPrecipProb) {
        day.maxPrecipProb = d.probability_of_precipitation;
      }
    }

    return Array.from(byDate.entries()).slice(0, 7).map(([date, day]) => {
      const high = day.temps.length ? Math.max(...day.temps) : 0;
      const low = day.temps.length ? Math.min(...day.temps) : 0;

      let dominantSymbol: number | undefined;
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
        icon: dominantSymbol != null ? wsymb2ToIcon(dominantSymbol, true) : FALLBACK_ICON,
        description: dominantSymbol != null
          ? (WSYMB2_DESCRIPTIONS[dominantSymbol] ?? 'Unknown')
          : 'Unknown',
        precipProbability: day.maxPrecipProb,
        precipAmount: Math.round(mmToPrecipUnit(day.precipMm, isMetric) * 100) / 100,
        humidity: avgHumidity != null ? Math.round(avgHumidity) : undefined,
        windSpeed: avgWindMs != null ? Math.round(msToWindUnit(avgWindMs, isMetric)) : undefined,
      };
    });
  }
}
