import type { HourlyWeather, ForecastDay, WeatherAlert } from './types';
import type { WeatherConditionsEvent, WeatherAlertsEvent, WeatherCondition } from '../event-bus';

/**
 * Extract a semantic weather condition from a description string.
 * Checks in priority order — "thunderstorm" beats "rain" since
 * thunderstorms also involve rain. Shared with `weather-state.ts`, so the
 * event bus and the shared-state bus never disagree about the sky.
 */
export function mapDescriptionToCondition(description: string): WeatherCondition {
  const d = description.toLowerCase();
  if (d.includes('thunder')) return 'thunderstorm';
  if (d.includes('drizzle')) return 'drizzle';
  if (d.includes('rain') || d.includes('shower')) return 'rain';
  if (d.includes('snow') || d.includes('sleet') || d.includes('blizzard') || d.includes('flurr')) return 'snow';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return 'fog';
  if (d.includes('wind') || d.includes('gust')) return 'wind';
  if (d.includes('cloud') || d.includes('overcast') || d.includes('partly')) return 'clouds';
  return 'clear';
}

/**
 * Today's range, reconciled with what the day has actually done.
 *
 * A provider's day-0 high and low are what its model expected, and after
 * sunset two of them (NOAA, Environment Canada) have only "tonight" left and
 * report the night's low as both numbers. Either way the wall can say
 * "H 66°" while it is 80° outside. Two things are known for certain: the
 * current reading, which is the first hourly entry on every provider, and
 * the warmest and coldest readings the hub has recorded for this same day
 * (`seen`, from `today-record.ts`). Today's high cannot be below either,
 * nor its low above.
 */
export function reconcileTodayRange(
  forecast: ForecastDay[],
  hourly: HourlyWeather[],
  seen?: { date: string; high: number; low: number },
): ForecastDay[] {
  const today = forecast[0];
  const now = hourly[0];
  if (!today || !now || !Number.isFinite(now.temp)) return forecast;
  // The record is keyed by the forecast's own day; one from another day
  // (the provider rolled over since the last poll) is not today's.
  const sameDay = seen && seen.date === today.date ? seen : undefined;
  const high = Math.max(today.high, now.temp, sameDay?.high ?? -Infinity);
  const low = Math.min(today.low, now.temp, sameDay?.low ?? Infinity);
  if (high === today.high && low === today.low) return forecast;
  return [{ ...today, high, low }, ...forecast.slice(1)];
}

/**
 * A Today row for a forecast that has already moved on to tomorrow.
 *
 * Late in the evening OpenWeatherMap has no 3-hour slot left for today, so
 * its forecast starts tomorrow while the household is still on today. The
 * hub kept today's row from earlier polls (`seen.forecast`); it comes back
 * with its range widened by what the hub recorded and the current reading,
 * the same rule `reconcileTodayRange` applies. With no row kept (the hub
 * started after the last slot) it is built from the current reading alone.
 * Returns undefined when there is nothing to build from.
 */
export function rebuildTodayRow(
  today: string,
  hourly: HourlyWeather[],
  seen?: { date: string; high: number; low: number; forecast?: ForecastDay },
): ForecastDay | undefined {
  const now = hourly[0];
  const reading = now && Number.isFinite(now.temp) ? now.temp : undefined;
  const sameDay = seen && seen.date === today ? seen : undefined;
  const kept = sameDay?.forecast?.date === today ? sameDay.forecast : undefined;
  const base: ForecastDay | undefined = kept ?? (now && reading !== undefined
    ? {
      date: today,
      high: reading,
      low: reading,
      icon: now.icon,
      description: now.description,
      ...(now.precipProbability !== undefined ? { precipProbability: now.precipProbability } : {}),
      ...(now.humidity !== undefined ? { humidity: now.humidity } : {}),
      ...(now.windSpeed !== undefined ? { windSpeed: now.windSpeed } : {}),
    }
    : undefined);
  if (!base) return undefined;
  return {
    ...base,
    high: Math.max(base.high, reading ?? -Infinity, sameDay?.high ?? -Infinity),
    low: Math.min(base.low, reading ?? Infinity, sameDay?.low ?? Infinity),
  };
}

/** Derive a WeatherConditionsEvent from the first hourly entry (current conditions). */
export function deriveWeatherConditions(
  hourly: HourlyWeather[],
  units: 'imperial' | 'metric',
): WeatherConditionsEvent | null {
  if (!hourly || hourly.length === 0) return null;
  const current = hourly[0];

  return {
    condition: mapDescriptionToCondition(current.description),
    temp: current.temp,
    units,
    icon: current.icon,
    summary: current.description,
    humidity: current.humidity,
    feelsLike: current.feelsLike,
  };
}

export type AlertSeverity = 'minor' | 'moderate' | 'severe' | 'extreme';

/** Lowercase severity word, `Unknown` folded into `minor`. Shared with `weather-state.ts`. */
export function mapSeverity(s: string): AlertSeverity {
  switch (s) {
    case 'Extreme': return 'extreme';
    case 'Severe': return 'severe';
    case 'Moderate': return 'moderate';
    default: return 'minor';
  }
}

/**
 * When an alert expires, as a millisecond instant. Providers stamp `expires`
 * in seconds since the epoch (Pirate Weather sends it that way, NOAA is
 * floored to it), so reading it as milliseconds dated every alert to January
 * 1970. A value that is already in milliseconds is left alone.
 */
export function alertExpiresMs(expires: number | undefined): number | undefined {
  if (typeof expires !== 'number' || !Number.isFinite(expires) || expires <= 0) return undefined;
  return expires < 1e12 ? expires * 1000 : expires;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { minor: 1, moderate: 2, severe: 3, extreme: 4 };

/**
 * The warnings still in force, most serious first. One rule for the alert
 * banner, the Alerts view, the "hide when there are none" check and the
 * shared state keys, so they never disagree about whether a warning is up
 * or which one leads.
 *
 * An alert with no usable expiry counts as active: a provider that sends one
 * without a time means it, and dropping it would silence the one case the
 * household most wants to know about. Alerts of equal severity keep the
 * provider's order.
 */
export function activeAlerts(alerts: WeatherAlert[] | undefined, nowMs: number): WeatherAlert[] {
  if (!Array.isArray(alerts)) return [];
  return alerts
    .filter((alert) => {
      if (!alert || typeof alert !== 'object') return false;
      const expires = alertExpiresMs(alert.expires);
      return expires === undefined || expires > nowMs;
    })
    .map((alert, i) => ({ alert, i }))
    .sort((a, b) => SEVERITY_RANK[mapSeverity(b.alert.severity)] - SEVERITY_RANK[mapSeverity(a.alert.severity)] || a.i - b.i)
    .map(({ alert }) => alert);
}

/** Derive a WeatherAlertsEvent from raw provider alerts. */
export function deriveWeatherAlerts(
  alerts: WeatherAlert[] | undefined,
): WeatherAlertsEvent | null {
  if (!alerts || alerts.length === 0) return null;

  return {
    alerts: alerts.map((a) => {
      const expires = alertExpiresMs(a.expires);
      return {
        headline: a.title,
        severity: mapSeverity(a.severity),
        event: a.title,
        expires: expires ? new Date(expires).toISOString() : undefined,
      };
    }),
  };
}
