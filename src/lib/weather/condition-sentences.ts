/**
 * The one-line readings under the Conditions and Forecast views' instrument cards, as pure
 * rules that return translation keys and their variables. The view turns
 * them into words; nothing here knows about React or a locale.
 */
import { hoursWithin } from './hourly-window';
import { windUnitLabel } from './units';
import type { ForecastDay, HourlyWeather } from './types';

export interface Sentence {
  key: string;
  vars?: Record<string, string | number>;
}

/** "Similar to the actual temperature", or why it feels warmer or colder. */
export function feelsLikeSentence(temp: number, feelsLike: number, units: 'metric' | 'imperial'): Sentence {
  const diff = feelsLike - temp;
  const threshold = units === 'metric' ? 2 : 3;
  if (Math.abs(diff) < threshold) return { key: 'feelsSimilar' };
  return { key: diff > 0 ? 'feelsWarmer' : 'feelsColder' };
}

/** The dew point when the source sends one, else a word for the humidity. */
export function humiditySentence(humidity: number, dewPoint: number | undefined): Sentence {
  if (dewPoint != null) return { key: 'dewPointNow', vars: { temp: Math.round(dewPoint) } };
  if (humidity < 30) return { key: 'humidityDry' };
  if (humidity <= 60) return { key: 'humidityComfortable' };
  if (humidity <= 80) return { key: 'humidityHumid' };
  return { key: 'humidityVeryHumid' };
}

/** How far one can see, in words. `visibility` is in km (metric) or miles (imperial). */
export function visibilitySentence(visibility: number, units: 'metric' | 'imperial'): Sentence {
  const km = units === 'metric' ? visibility : visibility * 1.609;
  if (km >= 16) return { key: 'visibilityPerfect' };
  if (km >= 8) return { key: 'visibilityClear' };
  if (km >= 3) return { key: 'visibilityReduced' };
  return { key: 'visibilityPoor' };
}

/**
 * A precipitation amount in the household's unit: "0.1 in" or "3 mm", with
 * the decimal mark of the formatting language ("0,5 mm" in German).
 */
export function formatPrecipAmount(amount: number, units: 'metric' | 'imperial', locale = 'en-US'): string {
  const fixed = (n: number, min: number, max: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }).format(n);
  if (units === 'metric') return `${amount < 1 && amount > 0 ? fixed(amount, 1, 1) : Math.round(amount)} mm`;
  if (amount === 0) return '0 in';
  return `${amount < 1 ? fixed(amount, 1, 2) : fixed(amount, 1, 1)} in`;
}

/** The smallest daily amount worth calling rain. */
const WET_DAY = { metric: 0.5, imperial: 0.02 } as const;

/**
 * Today's total and the next day with rain in it. `null` when the source
 * sends no daily amounts at all, so the card can hide.
 */
export function precipitationReading(forecast: ForecastDay[], units: 'metric' | 'imperial', locale = 'en-US'): { today: number; next: Sentence } | null {
  if (!forecast.some((d) => d.precipAmount != null)) return null;
  const today = forecast[0]?.precipAmount ?? 0;
  const later = forecast.slice(1);
  const wet = later.find((d) => (d.precipAmount ?? 0) >= WET_DAY[units]);
  if (wet) return { today, next: { key: 'precipNext', vars: { amount: formatPrecipAmount(wet.precipAmount!, units, locale), date: wet.date } } };
  return { today, next: { key: 'precipNone', vars: { days: forecast.length } } };
}

/** Air quality on the OpenWeatherMap 1 (good) to 5 (very poor) scale. */
export const AQI_LEVELS = ['good', 'fair', 'moderate', 'poor', 'veryPoor'] as const;
export type AqiLevel = (typeof AQI_LEVELS)[number];

export function airQualityLevel(aqi: number): AqiLevel {
  return AQI_LEVELS[Math.min(5, Math.max(1, Math.round(aqi))) - 1];
}

/** Where the level sits on the card's gradient bar, 0 to 100. */
export function airQualityPosition(aqi: number): number {
  return ((Math.min(5, Math.max(1, aqi)) - 1) / 4) * 85 + 7;
}

/** The UV band and the word for it. */
export type UvLevel = 'low' | 'moderate' | 'high' | 'veryHigh';
export function uvLevel(uv: number): UvLevel {
  return uv >= 8 ? 'veryHigh' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low';
}

/** The colour a UV reading is drawn in: green, yellow, orange, red. */
export const UV_LEVEL_COLOR: Record<UvLevel, string> = { low: '#22c55e', moderate: '#eab308', high: '#f97316', veryHigh: '#dc2626' };

/** The highest UV still to come today, for "Low for the rest of the day". */
export function uvRestOfDay(hourly: HourlyWeather[], sunsetMs: number | null): number | null {
  const end = sunsetMs ?? Number.POSITIVE_INFINITY;
  let max: number | null = null;
  for (const h of hourly) {
    if (new Date(h.time).getTime() > end) break;
    if (h.uvIndex != null) max = Math.max(max ?? 0, h.uvIndex);
  }
  return max;
}

/** The window every pressure trend reads, in hours by the clock. */
export const PRESSURE_TREND_HOURS = 12;

/** The forecast pressures inside the trend window, oldest first. */
export function pressureSeries(hourly: HourlyWeather[], hours = PRESSURE_TREND_HOURS): number[] {
  return hoursWithin(hourly, hours).map((h) => h.pressure).filter((v): v is number => v != null);
}

/**
 * Pressure trend from the next hours of forecast pressure, where the source
 * sends it hourly. Rising or falling means more than about 1 hPa over the
 * window. The window is hours by the clock, not a count of entries, so a
 * three-hourly source is read over the same span as an hourly one, and every
 * view that names the trend (the Conditions card, the Almanac card, the
 * small Stats view) reads the same one.
 */
export function pressureTrend(hourly: HourlyWeather[], hours = PRESSURE_TREND_HOURS): 'rising' | 'falling' | 'steady' {
  const series = pressureSeries(hourly, hours);
  if (series.length < 2) return 'steady';
  const delta = series[series.length - 1] - series[0];
  return delta > 1 ? 'rising' : delta < -1 ? 'falling' : 'steady';
}

/** The Almanac's and the small Stats view's sentence for each trend. */
export const PRESSURE_NOTE_KEY = {
  falling: 'fullscreen-weather.cards.pressureFalling',
  rising: 'fullscreen-weather.cards.pressureRising',
  steady: 'fullscreen-weather.cards.pressureSteady',
} as const;

/**
 * The line under a wind reading: the gust when the source sends one, else
 * where the wind is from, else nothing. `direction` is in degrees; the view
 * turns it into a compass point in its own language.
 */
export function windFootline(
  now: Pick<HourlyWeather, 'windGust' | 'windDirection'>,
  units: 'metric' | 'imperial',
): { key: 'gusts' | 'windFrom'; speed?: number; unit: string; direction?: number } | null {
  const unit = windUnitLabel(units);
  if (now.windGust != null) return { key: 'gusts', speed: Math.round(now.windGust), unit, direction: now.windDirection };
  if (now.windDirection != null) return { key: 'windFrom', unit, direction: now.windDirection };
  return null;
}

/**
 * Where a pressure sits between a low and a high reading, 0 to 1, for the
 * gauge needle. 980 to 1050 hPa covers everything but a hurricane.
 */
export function pressurePosition(hPa: number): number {
  return Math.max(0, Math.min(1, (hPa - 980) / 70));
}
