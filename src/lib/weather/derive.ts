import type { HourlyWeather, WeatherAlert } from './types';
import type { WeatherConditionsEvent, WeatherAlertsEvent, WeatherCondition } from '../event-bus';

/**
 * Extract a semantic weather condition from a description string.
 * Checks in priority order — "thunderstorm" beats "rain" since
 * thunderstorms also involve rain.
 */
function mapDescriptionToCondition(description: string): WeatherCondition {
  const d = description.toLowerCase();
  if (d.includes('thunder') || d.includes('storm')) return 'thunderstorm';
  if (d.includes('drizzle')) return 'drizzle';
  if (d.includes('rain') || d.includes('shower')) return 'rain';
  if (d.includes('snow') || d.includes('sleet') || d.includes('blizzard') || d.includes('flurr')) return 'snow';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return 'fog';
  if (d.includes('wind') || d.includes('gust')) return 'wind';
  if (d.includes('cloud') || d.includes('overcast') || d.includes('partly')) return 'clouds';
  return 'clear';
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
