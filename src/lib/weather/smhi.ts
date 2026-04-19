import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWeatherJSON } from './fetch';
import type { WeatherIconName } from './icons';
import { FALLBACK_ICON } from './icons';
import { celsiusToUnit, msToWindUnit, mmToPrecipUnit } from './units';

// ── SMHI (Swedish Meteorological and Hydrological Institute) ─────────
// https://opendata.smhi.se/apidocs/metfcst/index.html
// Coverage: Nordic region — returns 404 outside the SMHI bbox.

interface SMHIParameter {
  name: string;
  values: number[];
}

interface SMHITimeseriesEntry {
  validTime: string;
  parameters: SMHIParameter[];
}

interface SMHIResponse {
  timeSeries: SMHITimeseriesEntry[];
}

// ── SMHI Wsymb2 (1-27) → icon vocabulary ─────────────────────────────
// Reference: SMHI parameter table, "Wsymb2" weather symbol categories.
// For day/night-sensitive symbols (clear/partial cloud), we resolve via
// an intermediate marker so the day/night swap stays in one place.

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

function getParam(entry: SMHITimeseriesEntry, name: string): number | undefined {
  return entry.parameters.find((p) => p.name === name)?.values[0];
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
      `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lonStr}/lat/${latStr}/data.json`,
      'SMHI',
    );
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const data = await this.fetchData(lat, lon);
    const isMetric = units === 'metric';
    const nowMs = Date.now();

    return data.timeSeries
      .filter((entry) => new Date(entry.validTime).getTime() >= nowMs - 3600000)
      .slice(0, 48)
      .map((entry) => {
        const t = getParam(entry, 't');
        const r = getParam(entry, 'r');
        const ws = getParam(entry, 'ws');
        const msl = getParam(entry, 'msl');
        const wsymb = getParam(entry, 'Wsymb2');
        const pcat = getParam(entry, 'pcat');
        // SMHI doesn't provide a precipitation probability — use the
        // precipitation category as a binary signal instead.
        const precipProbability = pcat != null && pcat > 0 ? 100 : 0;
        const hour = new Date(entry.validTime).getUTCHours();
        const isDay = hour >= 6 && hour < 18;

        return {
          time: entry.validTime,
          temp: t != null ? celsiusToUnit(t, isMetric) : 0,
          humidity: r,
          icon: wsymb != null ? wsymb2ToIcon(wsymb, isDay) : FALLBACK_ICON,
          description: wsymb != null ? (WSYMB2_DESCRIPTIONS[wsymb] ?? 'Unknown') : 'Unknown',
          windSpeed: ws != null ? Math.round(msToWindUnit(ws, isMetric)) : undefined,
          precipProbability,
          pressure: msl != null ? Math.round(msl) : undefined,
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
      hasPrecip: boolean;
      windSpeedsMs: number[];
      humidities: number[];
    }>();

    for (const entry of data.timeSeries) {
      const date = entry.validTime.split('T')[0];
      let day = byDate.get(date);
      if (!day) {
        day = { temps: [], symbols: new Map(), precipMm: 0, hasPrecip: false, windSpeedsMs: [], humidities: [] };
        byDate.set(date, day);
      }
      const t = getParam(entry, 't');
      const r = getParam(entry, 'r');
      const ws = getParam(entry, 'ws');
      const wsymb = getParam(entry, 'Wsymb2');
      const pmean = getParam(entry, 'pmean');
      const pcat = getParam(entry, 'pcat');

      if (t != null) day.temps.push(t);
      if (r != null) day.humidities.push(r);
      if (ws != null) day.windSpeedsMs.push(ws);
      if (wsymb != null) day.symbols.set(wsymb, (day.symbols.get(wsymb) ?? 0) + 1);
      if (pmean != null) day.precipMm += pmean;
      // SMHI doesn't expose a true probability; mark the day "has precip"
      // if any hour has a non-zero pcat, then carry that forward as a binary.
      if (pcat != null && pcat > 0) day.hasPrecip = true;
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
        precipProbability: day.hasPrecip ? 100 : 0,
        precipAmount: Math.round(mmToPrecipUnit(day.precipMm, isMetric) * 100) / 100,
        humidity: avgHumidity != null ? Math.round(avgHumidity) : undefined,
        windSpeed: avgWindMs != null ? Math.round(msToWindUnit(avgWindMs, isMetric)) : undefined,
      };
    });
  }
}
