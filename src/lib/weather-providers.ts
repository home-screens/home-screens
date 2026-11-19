import type { WeatherProviderOption, WeatherSettings } from '@/types/config';
import type { SecretKey } from '@/lib/secrets';

/**
 * The one table of weather sources: which exist, which need an API key and
 * what each one's payload can carry. The wall's fetch loop, the editor's
 * pickers and preview, the settings search and the weather route all read it,
 * so a new source is added here (plus its provider file, its name in
 * `weather-provider-names.ts` and its Settings card) and the compiler names
 * every place that still lacks it. Data only: no React, safe in server routes.
 *
 * The id union itself stays in `src/types/config.ts`, which the website's
 * schema is generated from; the tuple below is checked against it both ways.
 */
export type WeatherProviderId = WeatherSettings['provider'];

/** Every source, in the order the per-module picker lists them. */
export const WEATHER_PROVIDER_IDS = [
  'openweathermap', 'weatherapi', 'pirateweather', 'noaa', 'open-meteo', 'yr', 'smhi', 'metoffice', 'envcanada',
] as const satisfies readonly WeatherProviderId[];

// A source added to the union but not to the tuple fails here.
type MissingFromTuple = Exclude<WeatherProviderId, (typeof WEATHER_PROVIDER_IDS)[number]>;
const tupleIsComplete: MissingFromTuple extends never ? true : never = true;
void tupleIsComplete;

// The per-module choice is spelled out in config.ts too (the schema and the
// E2E ratchets read literal unions): it must be `global` plus exactly these.
type OptionDrift =
  | Exclude<WeatherProviderOption, WeatherProviderId | 'global'>
  | Exclude<WeatherProviderId | 'global', WeatherProviderOption>;
const optionMatches: OptionDrift extends never ? true : never = true;
void optionMatches;

/** What a household gets before it picks a source: free, worldwide, no key. */
export const DEFAULT_WEATHER_PROVIDER: WeatherProviderId = 'open-meteo';

export function isWeatherProviderId(id: unknown): id is WeatherProviderId {
  return typeof id === 'string' && (WEATHER_PROVIDER_IDS as readonly string[]).includes(id);
}

/** A payload record with nothing in it yet, one null per source. */
export function emptyWeatherPayloads(): Record<WeatherProviderId, unknown> {
  return Object.fromEntries(WEATHER_PROVIDER_IDS.map((id) => [id, null])) as Record<WeatherProviderId, unknown>;
}

export type WeatherSecretKey = Extract<
  SecretKey,
  'weatherapi_key' | 'openweathermap_key' | 'pirateweather_key' | 'metoffice_key'
>;

/** The saved key each source needs, or null for one that runs without a key. */
export const WEATHER_PROVIDER_SECRET: Record<WeatherProviderId, WeatherSecretKey | null> = {
  openweathermap: 'openweathermap_key',
  weatherapi: 'weatherapi_key',
  pirateweather: 'pirateweather_key',
  noaa: null,
  'open-meteo': null,
  yr: null,
  smhi: null,
  metoffice: 'metoffice_key',
  envcanada: null,
};

/** The key a source needs, or null when it needs none (or is not a source at all). */
export function weatherProviderSecret(id: string): WeatherSecretKey | null {
  return isWeatherProviderId(id) ? WEATHER_PROVIDER_SECRET[id] : null;
}

/**
 * The sources that can run with the keys saved so far: every keyless one,
 * plus each keyed one whose key is present. `secrets` is the key status map
 * (key name to "is saved"), in the picker's order.
 */
export function configuredWeatherProviders(secrets: Partial<Record<string, unknown>>): WeatherProviderId[] {
  return WEATHER_PROVIDER_IDS.filter((id) => {
    const key = WEATHER_PROVIDER_SECRET[id];
    return key === null || !!secrets[key];
  });
}

/**
 * What a provider's payload can carry, so the editor offers a toggle or a
 * view only where the wall could show something. Each flag is read off the
 * provider file in `src/lib/weather/`: a flag set here for a field the
 * provider never emits is a control that does nothing.
 */
export interface WeatherProviderCaps {
  minutely?: boolean;
  alerts?: boolean;
  feelsLike?: boolean;
  /** Daily precipitation total on the forecast days. */
  precipAmount?: boolean;
  windDirection?: boolean;
  gust?: boolean;
  pressure?: boolean;
  visibility?: boolean;
  dewPoint?: boolean;
  uv?: boolean;
}

export const WEATHER_PROVIDER_CAPS: Record<WeatherProviderId, WeatherProviderCaps> = {
  openweathermap: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true },
  weatherapi: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, uv: true },
  pirateweather: { minutely: true, alerts: true, feelsLike: true, precipAmount: true, windDirection: true, gust: true, uv: true, pressure: true, visibility: true, dewPoint: true },
  // NOAA's hourly feed names the direction as compass text and gives no gust.
  // Feels-like, pressure and visibility all come from the same station
  // observation and only land on the current hour; feels-like further
  // depends on the station reporting a wind chill or heat index.
  noaa: { alerts: true, feelsLike: true, windDirection: true, pressure: true, visibility: true, dewPoint: true },
  'open-meteo': { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true, dewPoint: true, uv: true },
  yr: { precipAmount: true, windDirection: true, gust: true, pressure: true },
  smhi: { precipAmount: true, windDirection: true, gust: true, pressure: true },
  metoffice: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true, visibility: true, dewPoint: true, uv: true },
  // ECCC's hourly blocks carry a compass direction and a km/h gust, but no
  // feels-like and no precipitation amount anywhere in the citypage feed.
  envcanada: { windDirection: true, gust: true },
};

const NO_CAPS: WeatherProviderCaps = {};

/** A source's capabilities; an unknown id has none, so nothing is offered for it. */
export function weatherProviderCaps(id: string | undefined): WeatherProviderCaps {
  return isWeatherProviderId(id) ? WEATHER_PROVIDER_CAPS[id] : NO_CAPS;
}
