import type { SecretKey } from '../shared/SecretField';

export type WeatherProviderId =
  | 'open-meteo'
  | 'weatherapi'
  | 'openweathermap'
  | 'pirateweather'
  | 'noaa'
  | 'yr'
  | 'smhi';

export type WeatherSecretKey = Extract<
  SecretKey,
  'weatherapi_key' | 'openweathermap_key' | 'pirateweather_key'
>;

export type ProviderStatusType =
  | 'default-ready'
  | 'default-configured'
  | 'default-needs-setup'
  | 'configured'
  | 'ready'
  | 'needs-setup';

export interface WeatherProvider {
  id: WeatherProviderId;
  name: string;
  tagline: string;
  helperText: string;
  secretKey: WeatherSecretKey | null;
  keyHint: string;
  placeholder: string;
  iconBg: string;
}

export const WEATHER_PROVIDERS: WeatherProvider[] = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    tagline: 'Free · global · no key',
    helperText: 'No API key required. Open-Meteo is free and open-source with global coverage.',
    secretKey: null,
    keyHint: '',
    placeholder: '',
    iconBg: '#0ea5e9',
  },
  {
    id: 'weatherapi',
    name: 'WeatherAPI.com',
    tagline: 'Free tier · no credit card',
    helperText: '',
    secretKey: 'weatherapi_key',
    keyHint: 'Free at weatherapi.com — no credit card required.',
    placeholder: 'Paste your WeatherAPI key',
    iconBg: '#f59e0b',
  },
  {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    tagline: 'One Call 3.0 subscription',
    helperText: '',
    secretKey: 'openweathermap_key',
    keyHint: 'Requires a One Call 3.0 subscription at openweathermap.org.',
    placeholder: 'Paste your OpenWeatherMap API key',
    iconBg: '#ea580c',
  },
  {
    id: 'pirateweather',
    name: 'Pirate Weather',
    tagline: 'Dark Sky replacement',
    helperText: '',
    secretKey: 'pirateweather_key',
    keyHint: 'Free at pirateweather.net — drop-in Dark Sky replacement.',
    placeholder: 'Paste your Pirate Weather API key',
    iconBg: '#0d9488',
  },
  {
    id: 'noaa',
    name: 'NOAA / NWS',
    tagline: 'Free · US only · no key',
    helperText: 'No API key required. NOAA data is free and public (US only).',
    secretKey: null,
    keyHint: '',
    placeholder: '',
    iconBg: '#1d4ed8',
  },
  {
    id: 'yr',
    name: 'Yr.no / MET Norway',
    tagline: 'Free · global · no key',
    helperText: 'No API key required. Provided by the Norwegian Meteorological Institute with global coverage. To test, use a Nordic lat/lon — e.g. Oslo (59.9139, 10.7522) — for the densest coverage.',
    secretKey: null,
    keyHint: '',
    placeholder: '',
    iconBg: '#0369a1',
  },
  {
    id: 'smhi',
    name: 'SMHI',
    tagline: 'Free · Nordic only · no key',
    helperText: 'No API key required. Provided by the Swedish Meteorological and Hydrological Institute. Nordic coverage only — to test, use a Nordic lat/lon (e.g. Stockholm: 59.3293, 18.0686). Returns no data outside the Nordic region.',
    secretKey: null,
    keyHint: '',
    placeholder: '',
    iconBg: '#005293',
  },
];

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
