import type { TranslateFn } from '@/i18n';

/**
 * Map a weather icon id (the vocabulary produced by `src/lib/weather/icons.ts`
 * — `'sun'`, `'cloud-rain'`, etc.) to the matching `weather.conditions.<key>`
 * translation key, then return the translated label.
 *
 * Used for ARIA labels on weather icons so screen readers hear the localized
 * description instead of the English fallback baked into `weather-icons.ts`.
 */
const ICON_KEY_MAP: Record<string, string> = {
  sun: 'sunny',
  moon: 'clearNight',
  cloud: 'cloudy',
  'cloud-sun': 'partlyCloudy',
  'cloud-moon': 'partlyCloudyNight',
  'cloud-rain': 'rain',
  'cloud-drizzle': 'drizzle',
  'cloud-snow': 'snow',
  'cloud-lightning': 'thunderstorm',
  'cloud-fog': 'fog',
  snowflake: 'snow',
  thermometer: 'temperature',
  'cloud-hail': 'hail',
};

export function getLocalizedConditionLabel(iconId: string, t: TranslateFn): string {
  const key = ICON_KEY_MAP[iconId];
  return key ? t(`conditions.${key}`) : t('conditions.weather');
}
