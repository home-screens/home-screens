/**
 * Shared weather-icon vocabulary and lookup tables.
 *
 * Every provider (OWM, Pirate Weather, WeatherAPI, NOAA, Open-Meteo) used to
 * maintain its own private `code → icon-name` table against the same target
 * vocabulary. This file is the single source of truth for that vocabulary,
 * the per-source lookups, and the keyword-based `inferIconFromText` fallback
 * used by NOAA (which returns English "short forecast" strings).
 */

export type WeatherIconName =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'cloud'
  | 'cloud-rain'
  | 'cloud-drizzle'
  | 'cloud-lightning'
  | 'cloud-hail'
  | 'cloud-fog'
  | 'snowflake'
  | 'thermometer';

export const FALLBACK_ICON: WeatherIconName = 'thermometer';

// ── OpenWeatherMap ─────────────────────────────────────────────────────
// OWM encodes day/night in the icon code itself ('01d' / '01n') so no
// dayNightSwap needed — the map already has both variants.

export const OWM_ICON_MAP: Record<string, WeatherIconName> = {
  '01d': 'sun',           '01n': 'moon',
  '02d': 'cloud-sun',     '02n': 'cloud-moon',
  '03d': 'cloud',         '03n': 'cloud',
  '04d': 'cloud',         '04n': 'cloud',
  '09d': 'cloud-rain',    '09n': 'cloud-rain',
  '10d': 'cloud-drizzle', '10n': 'cloud-rain',
  '11d': 'cloud-lightning', '11n': 'cloud-lightning',
  '13d': 'snowflake',     '13n': 'snowflake',
  '50d': 'cloud-fog',     '50n': 'cloud-fog',
};

// ── Pirate Weather ─────────────────────────────────────────────────────

export const PIRATE_ICON_MAP: Record<string, WeatherIconName> = {
  'clear-day': 'sun',
  'clear-night': 'moon',
  'partly-cloudy-day': 'cloud-sun',
  'partly-cloudy-night': 'cloud-moon',
  'cloudy': 'cloud',
  'rain': 'cloud-rain',
  'snow': 'snowflake',
  'sleet': 'cloud-hail',
  'thunderstorm': 'cloud-lightning',
  'fog': 'cloud-fog',
  'wind': 'cloud',
};

// ── WeatherAPI (code → intermediate-or-final) ───────────────────────────
// `weatherApiCodeToIcon` resolves the two day/night-sensitive intermediates
// ('clear' / 'partly-cloudy') internally — callers don't need a separate swap.

type WeatherAPIIntermediate = WeatherIconName | 'clear' | 'partly-cloudy';

const WEATHERAPI_CODE_MAP: Record<number, WeatherAPIIntermediate> = {
  // Clear / partly cloudy (need day/night swap)
  1000: 'clear',
  1003: 'partly-cloudy',
  // Cloudy / Overcast
  1006: 'cloud', 1009: 'cloud',
  // Mist / Fog / Freezing fog
  1030: 'cloud-fog', 1117: 'cloud-fog', 1135: 'cloud-fog', 1147: 'cloud-fog',
  // Drizzle / Light rain
  1063: 'cloud-drizzle', 1150: 'cloud-drizzle', 1153: 'cloud-drizzle',
  1180: 'cloud-drizzle', 1183: 'cloud-drizzle',
  // Rain
  1186: 'cloud-rain', 1189: 'cloud-rain', 1192: 'cloud-rain', 1195: 'cloud-rain',
  1240: 'cloud-rain', 1243: 'cloud-rain', 1246: 'cloud-rain',
  // Snow
  1066: 'snowflake', 1114: 'snowflake', 1210: 'snowflake', 1213: 'snowflake',
  1216: 'snowflake', 1219: 'snowflake', 1222: 'snowflake', 1225: 'snowflake',
  1255: 'snowflake', 1258: 'snowflake',
  // Sleet / Hail / Freezing rain
  1069: 'cloud-hail', 1072: 'cloud-hail', 1168: 'cloud-hail', 1171: 'cloud-hail',
  1198: 'cloud-hail', 1201: 'cloud-hail', 1204: 'cloud-hail', 1207: 'cloud-hail',
  1237: 'cloud-hail', 1249: 'cloud-hail', 1252: 'cloud-hail',
  // Thunder
  1087: 'cloud-lightning', 1273: 'cloud-lightning', 1276: 'cloud-lightning',
  1279: 'cloud-lightning', 1282: 'cloud-lightning',
};

export function weatherApiCodeToIcon(code: number, isDay: boolean): WeatherIconName {
  const intermediate = WEATHERAPI_CODE_MAP[code];
  if (!intermediate) return FALLBACK_ICON;
  if (intermediate === 'clear') return isDay ? 'sun' : 'moon';
  if (intermediate === 'partly-cloudy') return isDay ? 'cloud-sun' : 'cloud-moon';
  return intermediate;
}

// ── Open-Meteo (WMO codes are range-based, so a function fits better) ──
// Reference: https://open-meteo.com/en/docs#weathervariables

export function wmoCodeToIcon(code: number, isDay: boolean): WeatherIconName {
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code <= 2) return isDay ? 'cloud-sun' : 'cloud-moon'; // 1=mainly clear, 2=partly cloudy
  if (code === 3) return 'cloud'; // overcast
  if (code === 45 || code === 48) return 'cloud-fog';
  if (code >= 51 && code <= 57) return 'cloud-drizzle';
  if (code >= 61 && code <= 67) return 'cloud-rain';
  if (code >= 71 && code <= 77) return 'snowflake';
  if (code >= 80 && code <= 82) return 'cloud-rain';
  if (code >= 85 && code <= 86) return 'snowflake';
  if (code >= 95 && code <= 99) return 'cloud-lightning';
  return FALLBACK_ICON;
}

// ── NOAA-style English keyword matcher ─────────────────────────────────
// NOAA returns "Mostly Sunny", "Partly Cloudy with Scattered Thunderstorms",
// etc. This matcher is also a reasonable last-resort fallback for any other
// provider when handed a description but no recognized code — callers can
// opt-in by passing a description string to their own lookup layer.

export function inferIconFromText(description: string, isDay: boolean): WeatherIconName {
  const f = description.toLowerCase();
  if (f.includes('thunder') || f.includes('storm')) return 'cloud-lightning';
  if (f.includes('snow') || f.includes('blizzard') || f.includes('flurr')) return 'snowflake';
  if (f.includes('sleet') || f.includes('ice') || f.includes('freez')) return 'cloud-hail';
  if (f.includes('rain') || f.includes('shower') || f.includes('drizzle')) return 'cloud-rain';
  if (f.includes('fog') || f.includes('haze') || f.includes('mist')) return 'cloud-fog';
  if (f.includes('partly') || f.includes('mostly sunny') || f.includes('mostly clear'))
    return isDay ? 'cloud-sun' : 'cloud-moon';
  if (f.includes('cloud') || f.includes('overcast')) return 'cloud';
  if (f.includes('sunny') || f.includes('clear')) return isDay ? 'sun' : 'moon';
  return FALLBACK_ICON;
}
