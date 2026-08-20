import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';

/**
 * Weather resolution for the fullscreen calendar's list views: day headers
 * get the daily forecast, event rows get the hourly forecast at the event's
 * own start time — falling back to that day's daily forecast when the start
 * is past the provider's hourly horizon (a gap would read as "no weather
 * worth mentioning", which is wrong in exactly the rainy cases that matter).
 *
 * Hourly entries are pre-indexed by hour bucket: the list views resolve
 * weather per event row on every 60s clock tick, so a linear scan that
 * re-parses every ISO timestamp would be the largest per-tick cost on a Pi.
 * The index is built once per fetch inside the module's memoized weather
 * bundle; lookups touch at most three buckets.
 */

/** How far an hourly entry may sit from the event start and still describe it. */
const HOURLY_MATCH_MS = 90 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

export interface EventWeather {
  temp: number;
  icon?: string;
  description?: string;
}

/** Hourly entries keyed by rounded hour bucket, with their parsed instant. */
export type HourlyIndex = Map<number, { entry: HourlyWeather; ms: number }>;

/**
 * An hourly entry's instant. `timeEpoch` (unix seconds) wins when a provider
 * supplies it: WeatherAPI's `time` strings are zone-less location-local
 * wall times, which are only safe to FORMAT — parsing one for arithmetic
 * shifts by the OS↔location offset.
 */
function hourlyInstant(h: HourlyWeather): number {
  if (h.timeEpoch != null) return h.timeEpoch * 1000;
  return new Date(h.time).getTime();
}

export function buildHourlyIndex(hourly?: HourlyWeather[]): HourlyIndex {
  const index: HourlyIndex = new Map();
  for (const entry of hourly ?? []) {
    const ms = hourlyInstant(entry);
    if (!Number.isFinite(ms)) continue;
    const key = Math.round(ms / HOUR_MS);
    const existing = index.get(key);
    if (!existing || Math.abs(ms - key * HOUR_MS) < Math.abs(existing.ms - key * HOUR_MS)) {
      index.set(key, { entry, ms });
    }
  }
  return index;
}

/** The indexed hourly entry nearest a time, or null when none is within the horizon. */
export function hourlyForTime(index: HourlyIndex, when: Date): HourlyWeather | null {
  const t = when.getTime();
  const centerKey = Math.round(t / HOUR_MS);
  let best: { entry: HourlyWeather; ms: number } | null = null;
  for (const key of [centerKey - 1, centerKey, centerKey + 1]) {
    const candidate = index.get(key);
    if (candidate && (!best || Math.abs(candidate.ms - t) < Math.abs(best.ms - t))) {
      best = candidate;
    }
  }
  return best && Math.abs(best.ms - t) <= HOURLY_MATCH_MS ? best.entry : null;
}

/** Local YYYY-MM-DD key for a day — ForecastDay.date is date-only in every provider. */
function dayKey(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The daily forecast entry covering a given day, or null. */
export function dailyForDay(forecast: ForecastDay[] | undefined, day: Date): ForecastDay | null {
  if (!forecast?.length) return null;
  const key = dayKey(day);
  return forecast.find((f) => f.date.slice(0, 10) === key) ?? null;
}

/**
 * Forecast for an event start: hourly when inside the horizon, otherwise
 * that day's daily forecast (high temp), otherwise null.
 */
export function weatherForEvent(
  index: HourlyIndex,
  forecast: ForecastDay[] | undefined,
  start: Date,
): EventWeather | null {
  const h = hourlyForTime(index, start);
  if (h) return { temp: h.temp, icon: h.icon, description: h.description };
  const d = dailyForDay(forecast, start);
  if (d) return { temp: d.high, icon: d.icon, description: d.description };
  return null;
}
