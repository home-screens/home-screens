import { DEFAULT_TIME_FORMAT, type ModuleType, type TimeFormat } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';

/**
 * Raw per-provider weather payloads plus the calendar payload, fetched once by
 * the display and shared across every screen rotation. Lives here rather than
 * beside its fetching hook so `toDisplaySource` can consume it without the
 * lib layer importing a React component.
 */
export interface SharedDisplayData {
  owmData: unknown;
  wapiData: unknown;
  pirateData: unknown;
  noaaData: unknown;
  openMeteoData: unknown;
  yrData: unknown;
  smhiData: unknown;
  metofficeData: unknown;
  envcanadaData: unknown;
  calendarData: unknown;
}

const PROVIDER_KEY: Record<string, keyof SharedDisplayData> = {
  openweathermap: 'owmData',
  weatherapi: 'wapiData',
  pirateweather: 'pirateData',
  noaa: 'noaaData',
  'open-meteo': 'openMeteoData',
  yr: 'yrData',
  smhi: 'smhiData',
  metoffice: 'metofficeData',
  envcanada: 'envcanadaData',
};

/** One provider's weather response, as far as the prop builder cares. */
export interface WeatherPayload {
  hourly?: unknown;
  forecast?: unknown;
  minutely?: unknown;
  alerts?: unknown;
}

/** Editor-side settings snapshot driving the WYSIWYG canvas preview. */
export interface PreviewSettings {
  latitude: number | undefined;
  longitude: number | undefined;
  locationName: string | undefined;
  timezone: string | undefined;
  globalProvider: string;
  units: 'metric' | 'imperial';
  fullscreenTheme: string | undefined;
  timeFormat: TimeFormat | undefined;
}

interface ProviderWeatherData {
  hourly: unknown[] | null;
  forecast: unknown[] | null;
  minutely: unknown[] | null;
  alerts: unknown[] | null;
}

/** Editor-side fetched preview payloads (see `usePreviewData`). */
export interface PreviewData {
  weatherByProvider: Record<string, ProviderWeatherData>;
  calendarEvents: unknown[] | null;
}

/**
 * Normalized view of everything a module component might need, independent of
 * which surface is rendering it. The display and the editor each supply one of
 * these through a thin adapter; `buildModuleProps` knows nothing else.
 *
 * The point of the indirection: a new field added here is a compile error in
 * any adapter that doesn't supply it, so a prop can no longer be wired into the
 * display and silently forgotten in the editor preview (or vice versa).
 */
export interface ModuleDataSource {
  timezone?: string;
  fullscreenTheme?: string;
  /** Household 12/24-hour preference (GlobalSettings.timeFormat). */
  timeFormat?: TimeFormat;
  /** null = no usable coordinates; drives `locationMissing`. */
  location: { lat: number; lon: number } | null;
  /** Human-readable place name for the configured coordinates, when known. */
  locationName?: string;
  weather: {
    globalProvider: string;
    units: 'metric' | 'imperial';
    payloadFor(provider: string): WeatherPayload | null;
  };
  calendarEvents: unknown[] | null;
  availableDisplays: Array<{ id: string; name: string }>;
}

/** Resolve a weather module's effective provider ('global' defers to settings). */
export function resolveProvider(
  mod: { type: string; config: Record<string, unknown> },
  globalProvider: string,
): string {
  if (mod.type === 'weather') {
    const p = mod.config.provider as string | undefined;
    return (p && p !== 'global') ? p : globalProvider;
  }
  return globalProvider;
}

/**
 * Assemble the shared/extra props a module component needs (location, calendar
 * events, weather data, display registry).
 *
 * Used by the display renderer, the background-provider layer, and the editor
 * canvas preview — all three go through this one function so a module sees the
 * same props wherever it renders.
 */
export function buildModuleProps(
  mod: { type: ModuleType; config: Record<string, unknown> },
  source: ModuleDataSource,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    timezone: source.timezone,
    fullscreenTheme: source.fullscreenTheme,
    // Ambient like timezone: every module (calendar, fullscreen-calendar,
    // future plugins) reads the same household clock preference.
    timeFormat: source.timeFormat ?? DEFAULT_TIME_FORMAT,
  };

  const def = getModuleDefinition(mod.type);
  if (def?.dataRequirements?.includes('location') && source.location) {
    props.latitude = source.location.lat;
    props.longitude = source.location.lon;
  }

  const needsCalendar = mod.type === 'calendar' || def?.dataRequirements?.includes('calendar');
  if (needsCalendar && source.calendarEvents) {
    props.events = source.calendarEvents;
  }

  const needsWeather = mod.type === 'weather' || def?.dataRequirements?.includes('weather');
  if (needsWeather) {
    if (!source.location) props.locationMissing = true;
    const payload = source.weather.payloadFor(resolveProvider(mod, source.weather.globalProvider));
    if (payload) {
      props.hourly = payload.hourly ?? [];
      props.forecast = payload.forecast ?? [];
      props.minutely = payload.minutely ?? undefined;
      props.alerts = payload.alerts ?? undefined;
    }
    props.units = source.weather.units;
    // Weather doesn't declare the `location` data requirement (it reads weather
    // through the shared fetch, not coordinates), but the "show location" header
    // needs both the geocoded name and a coordinate fallback.
    props.locationName = source.locationName;
    if (source.location) {
      props.latitude = source.location.lat;
      props.longitude = source.location.lon;
    }
  }

  if (mod.type === 'display-control') {
    props.availableDisplays = source.availableDisplays;
  }

  return props;
}

/** Adapter: kiosk display. Coordinates come from settings, payloads from the
 *  once-per-display shared fetch. */
export function toDisplaySource(
  settings: {
    timezone?: string;
    fullscreenTheme?: string;
    timeFormat?: TimeFormat;
    locationName?: string;
    weather: { provider: string; units: 'metric' | 'imperial' };
  },
  location: { lat: number; lon: number } | null,
  sharedData: SharedDisplayData,
  availableDisplays: Array<{ id: string; name: string }> = [],
): ModuleDataSource {
  const calendarData = sharedData.calendarData;
  return {
    timezone: settings.timezone,
    fullscreenTheme: settings.fullscreenTheme,
    timeFormat: settings.timeFormat,
    location,
    locationName: settings.locationName,
    weather: {
      globalProvider: settings.weather.provider,
      units: settings.weather.units,
      payloadFor: (provider) =>
        (sharedData[PROVIDER_KEY[provider]] as WeatherPayload | null | undefined) ?? null,
    },
    calendarEvents: calendarData
      ? (Array.isArray(calendarData)
        ? calendarData
        : ((calendarData as Record<string, unknown>).events as unknown[] | undefined) ?? [])
      : null,
    availableDisplays,
  };
}

/** Adapter: editor canvas preview. Falls back to the global provider's payload
 *  when a module's own provider hasn't been fetched yet, so a freshly-switched
 *  provider still previews something instead of blanking. */
export function toEditorSource(
  settings: PreviewSettings | null,
  previewData: PreviewData,
  displays: Array<{ id: string; name: string }> = [],
): ModuleDataSource {
  const globalProvider = settings?.globalProvider ?? 'weatherapi';
  return {
    timezone: settings?.timezone,
    fullscreenTheme: settings?.fullscreenTheme,
    timeFormat: settings?.timeFormat,
    location: settings && settings.latitude != null && settings.longitude != null
      ? { lat: settings.latitude, lon: settings.longitude }
      : null,
    locationName: settings?.locationName,
    weather: {
      globalProvider,
      units: settings?.units ?? 'imperial',
      payloadFor: (provider) =>
        previewData.weatherByProvider[provider] ?? previewData.weatherByProvider[globalProvider] ?? null,
    },
    calendarEvents: previewData.calendarEvents,
    availableDisplays: displays,
  };
}
