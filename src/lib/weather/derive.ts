import type { HourlyWeather, ForecastDay, WeatherAlert } from './types';
import type { WeatherConditionsEvent, WeatherAlertsEvent, WeatherCondition } from '../event-bus';

/**
 * Extract a semantic weather condition from a description string.
 * Checks in priority order — "thunderstorm" beats "rain" since
 * thunderstorms also involve rain.
 */
function mapDescriptionToCondition(description: string): WeatherCondition {
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

function mapSeverity(s: string): 'minor' | 'moderate' | 'severe' | 'extreme' {
  switch (s) {
    case 'Extreme': return 'extreme';
    case 'Severe': return 'severe';
    case 'Moderate': return 'moderate';
    default: return 'minor';
  }
}

/** Derive a WeatherAlertsEvent from raw provider alerts. */
export function deriveWeatherAlerts(
  alerts: WeatherAlert[] | undefined,
): WeatherAlertsEvent | null {
  if (!alerts || alerts.length === 0) return null;

  return {
    alerts: alerts.map((a) => ({
      headline: a.title,
      severity: mapSeverity(a.severity),
      event: a.title,
      expires: a.expires ? new Date(a.expires).toISOString() : undefined,
    })),
  };
}
