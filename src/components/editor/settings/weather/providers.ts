import type { WeatherProviderId, WeatherSecretKey } from '@/lib/weather-providers';
import { WEATHER_PROVIDER_SECRET } from '@/lib/weather-providers';

export type { WeatherProviderId, WeatherSecretKey };

export type ProviderStatusType =
  | 'default-ready'
  | 'default-configured'
  | 'default-needs-setup'
  | 'configured'
  | 'ready'
  | 'needs-setup';

/**
 * Provider records describe their user-visible copy via dotted i18n key
 * paths rather than English literals. The consuming component (`WeatherProviderCard`)
 * resolves them through `useTranslate('editor')` at render time so this
 * module stays data-only and free of React/i18n imports.
 *
 * - `taglineKey` is required for every provider (the short subtitle under
 *   the provider name).
 * - `helperTextKey` is set on free providers (no secret) and carries the
 *   longer explanatory paragraph rendered in lieu of an API-key field.
 * - `keyHintKey` and `placeholderKey` are set on paid providers (those with
 *   a `secretKey`) and feed the API-key input's helper line + placeholder.
 *
 * Optional keys are intentionally `undefined` (not empty strings) so the
 * card can `if (key) t(key)` without leaking blank lines into the DOM.
 */
export interface WeatherProvider {
  id: WeatherProviderId;
  taglineKey: string;
  helperTextKey?: string;
  secretKey: WeatherSecretKey | null;
  keyHintKey?: string;
  placeholderKey?: string;
  iconBg: string;
  /**
   * For regional providers, a known-good coordinate inside the coverage
   * area used by the editor's Test button so connectivity verification
   * doesn't fail when the user's configured location sits outside the
   * provider's bounding box. Omitted for global providers.
   */
  testCoords?: { lat: number; lon: number };
}

/** A card's own copy and colour; whether it needs a key comes from the shared table. */
const PROVIDER_CARDS: Omit<WeatherProvider, 'secretKey'>[] = [
  {
    id: 'open-meteo',
    taglineKey: 'settings.weatherPage.providers.openMeteo.tagline',
    helperTextKey: 'settings.weatherPage.providers.openMeteo.helperText',
    iconBg: '#0ea5e9',
  },
  {
    id: 'weatherapi',
    taglineKey: 'settings.weatherPage.providers.weatherApi.tagline',
    keyHintKey: 'settings.weatherPage.providers.weatherApi.keyHint',
    placeholderKey: 'settings.weatherPage.providers.weatherApi.placeholder',
    iconBg: '#f59e0b',
  },
  {
    id: 'openweathermap',
    taglineKey: 'settings.weatherPage.providers.openWeatherMap.tagline',
    keyHintKey: 'settings.weatherPage.providers.openWeatherMap.keyHint',
    placeholderKey: 'settings.weatherPage.providers.openWeatherMap.placeholder',
    iconBg: '#ea580c',
  },
  {
    id: 'pirateweather',
    taglineKey: 'settings.weatherPage.providers.pirateWeather.tagline',
    keyHintKey: 'settings.weatherPage.providers.pirateWeather.keyHint',
    placeholderKey: 'settings.weatherPage.providers.pirateWeather.placeholder',
    iconBg: '#0d9488',
  },
  {
    id: 'noaa',
    taglineKey: 'settings.weatherPage.providers.noaa.tagline',
    helperTextKey: 'settings.weatherPage.providers.noaa.helperText',
    iconBg: '#1d4ed8',
  },
  {
    id: 'yr',
    taglineKey: 'settings.weatherPage.providers.yr.tagline',
    helperTextKey: 'settings.weatherPage.providers.yr.helperText',
    iconBg: '#0369a1',
  },
  {
    id: 'smhi',
    taglineKey: 'settings.weatherPage.providers.smhi.tagline',
    helperTextKey: 'settings.weatherPage.providers.smhi.helperText',
    iconBg: '#005293',
    // Stockholm — dead-center in SMHI's Nordic bbox. Used by the Test
    // button so users outside the coverage area can still verify the
    // integration is wired up.
    testCoords: { lat: 59.3293, lon: 18.0686 },
  },
  {
    id: 'metoffice',
    taglineKey: 'settings.weatherPage.providers.metOffice.tagline',
    keyHintKey: 'settings.weatherPage.providers.metOffice.keyHint',
    placeholderKey: 'settings.weatherPage.providers.metOffice.placeholder',
    iconBg: '#262626',
  },
  {
    id: 'envcanada',
    taglineKey: 'settings.weatherPage.providers.envCanada.tagline',
    helperTextKey: 'settings.weatherPage.providers.envCanada.helperText',
    iconBg: '#d62718',
  },
];

/** The Weather page's cards, in the order the page lists them. */
export const WEATHER_PROVIDERS: WeatherProvider[] = PROVIDER_CARDS.map((card) => ({
  ...card,
  secretKey: WEATHER_PROVIDER_SECRET[card.id],
}));

export function getProviderStatus(
  isDefault: boolean,
  keyConfigured: boolean,
  isFree: boolean,
): { label: string; type: ProviderStatusType } {
  if (isDefault) {
    if (isFree) return { label: 'Default · Ready', type: 'default-ready' };
    if (keyConfigured) return { label: 'Default · Configured', type: 'default-configured' };
    return { label: 'Default · Needs setup', type: 'default-needs-setup' };
  }
  if (isFree) return { label: 'Ready', type: 'ready' };
  if (keyConfigured) return { label: 'Configured', type: 'configured' };
  return { label: 'Needs setup', type: 'needs-setup' };
}
