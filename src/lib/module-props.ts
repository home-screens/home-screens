import { DEFAULT_TIME_FORMAT, type CalendarFetchStatus, type CalendarPerson, type CalendarSettings, type CalendarSourceStatus, type ModuleType, type TimeFormat } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { hasAnyCalendarSource } from '@/lib/calendar-sources';
import { settingsPath } from './settings-route';
import type { FetchError } from './fetch-error';

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
  /** Providers whose latest fetch failed, keyed by provider id. */
  weatherErrors: Partial<Record<string, FetchError>>;
  calendarData: unknown;
  calendarStatus: CalendarFetchStatus;
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
  /** Settings > Calendar > People, for the per-person calendar views. */
  calendarPeople: CalendarPerson[] | undefined;
  /** Whether Settings > Calendar names anything to fetch (see `hasAnyCalendarSource`). */
  calendarConfigured: boolean;
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
  /** Providers the preview could not fetch (no key yet, route error), keyed by provider id. */
  weatherErrors: Record<string, FetchError>;
  calendarEvents: unknown[] | null;
  /** Per-source health from the same payload, so the preview badges saved rows like the kiosk. */
  calendarSourceStatus: CalendarSourceStatus[] | null;
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
  /**
   * Which surface is rendering. The only behavioural difference today: a
   * module whose location is missing gets a `locationSettingsHref` in the
   * editor so its empty state can link to the Location page — on the wall
   * there is nothing to click, so the text stays plain.
   */
  surface: 'display' | 'editor';
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
    /** Why `payloadFor` is null for this provider, when the surface knows. */
    errorFor(provider: string): FetchError | null;
  };
  calendarEvents: unknown[] | null;
  /** null = surface has no fetch-health signal (editor preview). */
  calendarStatus: CalendarFetchStatus | null;
  /** Per-source health from the calendar payload; null when absent. */
  calendarSourceStatus: CalendarSourceStatus[] | null;
  /** Household people (Settings > Calendar); null when none are set up. */
  calendarPeople: CalendarPerson[] | null;
  /**
   * False when Settings > Calendar names nothing to fetch. The shared fetch
   * never starts in that case, so without this flag a calendar module could
   * not tell "no calendars picked yet" from "still loading".
   */
  calendarConfigured: boolean;
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
    // Per-module override: any module may carry a top-level `timezone` config
    // key (clock and date today); '' or absent follows the display setting.
    timezone: (mod.config.timezone as string | undefined) || source.timezone,
    fullscreenTheme: source.fullscreenTheme,
    // Ambient like timezone: every module (calendar, fullscreen-calendar,
    // future plugins) reads the same household clock preference.
    timeFormat: source.timeFormat ?? DEFAULT_TIME_FORMAT,
  };

  const def = getModuleDefinition(mod.type);
  const needsLocation = !!def?.dataRequirements?.includes('location');
  const needsWeather = !!def?.dataRequirements?.includes('weather');
  // Weather-bound modules get coordinates too: their location header falls
  // back to them, and the fullscreen views compute sun times from them.
  if ((needsLocation || needsWeather) && source.location) {
    props.latitude = source.location.lat;
    props.longitude = source.location.lon;
  }

  const needsCalendar = mod.type === 'calendar' || def?.dataRequirements?.includes('calendar');
  if (needsCalendar && source.calendarEvents) {
    props.events = source.calendarEvents;
  }
  // Presence semantic: attached only while nothing is configured, so a
  // household with calendars builds the same props as before.
  if (needsCalendar && !source.calendarConfigured) {
    props.calendarSetup = 'noSources';
  }
  // Attached only while the fetch is actually failing — that IS the
  // semantic: a healthy display and the editor preview (which has no fetch
  // loop) both mean "nothing to report", so they build identical props and
  // modules read the prop's mere presence as the failure signal.
  if (needsCalendar && source.calendarStatus?.error != null) {
    props.calendarStatus = source.calendarStatus;
  }
  // Same presence semantic per source: attached only while at least one
  // source is failing, so healthy displays and the editor build identical
  // props and never re-render over an all-ok status array.
  if (needsCalendar && source.calendarSourceStatus?.some((s) => !s.ok)) {
    props.sourceStatus = source.calendarSourceStatus;
  }
  // Only attached while people exist, so a household without them builds the
  // same props as before and the per-person views take their fallback path.
  if (needsCalendar && source.calendarPeople && source.calendarPeople.length > 0) {
    props.people = source.calendarPeople;
  }

  if (needsWeather) {
    if (!source.location) props.locationMissing = true;
    const provider = resolveProvider(mod, source.weather.globalProvider);
    const payload = source.weather.payloadFor(provider);
    if (payload) {
      props.hourly = payload.hourly ?? [];
      props.forecast = payload.forecast ?? [];
      props.minutely = payload.minutely ?? undefined;
      props.alerts = payload.alerts ?? undefined;
    } else {
      // Presence semantic again: only while there is no payload AND the
      // fetch has failed, so a module can tell "still loading" (no props)
      // from "waiting on setup" / "not updating" (this prop).
      const error = source.weather.errorFor(provider);
      if (error) props.weatherError = error;
    }
    props.units = source.weather.units;
    // The "show location" header needs the geocoded name (coordinates as
    // its fallback were injected above).
    props.locationName = source.locationName;
  }

  if (mod.type === 'display-control') {
    props.availableDisplays = source.availableDisplays;
  }

  // Editor preview of a location-dependent module with no location: the
  // empty state becomes a link to the Location page. The display never gets
  // this prop, so the same component renders plain text on the wall.
  if (source.surface === 'editor' && !source.location && (needsLocation || needsWeather) && !def?.locationOptional) {
    props.locationSettingsHref = settingsPath({ kind: 'defaults', page: 'location' });
  }

  return props;
}

/**
 * Events out of the raw `/api/calendar` payload, tolerating both shapes the
 * route has emitted: a bare array, and the `{ events, sourceStatus }` object
 * it returns today. `null` means "nothing fetched yet", which callers must
 * keep distinct from an empty feed.
 *
 * Shared with the shared-state publisher in `useSharedDisplayData`, so the
 * bus and the modules can never disagree about what the feed contained.
 */
export function extractCalendarEvents(calendarData: unknown): unknown[] | null {
  if (!calendarData) return null;
  if (Array.isArray(calendarData)) return calendarData;
  return ((calendarData as Record<string, unknown>).events as unknown[] | undefined) ?? [];
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
    calendar?: CalendarSettings;
  },
  location: { lat: number; lon: number } | null,
  sharedData: SharedDisplayData,
  availableDisplays: Array<{ id: string; name: string }> = [],
): ModuleDataSource {
  const calendarData = sharedData.calendarData;
  return {
    surface: 'display',
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
      errorFor: (provider) => sharedData.weatherErrors[provider] ?? null,
    },
    calendarEvents: extractCalendarEvents(calendarData),
    calendarStatus: sharedData.calendarStatus,
    // Rides the kept-last-good payload: while the whole fetch is failing the
    // display keeps serving the previous body, so the per-source statuses in
    // it persist too ("keeps the last status per source").
    calendarSourceStatus: calendarData && !Array.isArray(calendarData)
      ? ((calendarData as Record<string, unknown>).sourceStatus as CalendarSourceStatus[] | undefined) ?? null
      : null,
    calendarPeople: settings.calendar?.people ?? null,
    calendarConfigured: hasAnyCalendarSource(settings.calendar),
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
    surface: 'editor',
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
      // A provider that has actually failed (no key, rejected key) must show
      // the same setup card here as on the wall, not borrow another
      // provider's forecast; the global fallback only covers "still fetching".
      payloadFor: (provider) =>
        previewData.weatherByProvider[provider]
          ?? (previewData.weatherErrors[provider] ? null : previewData.weatherByProvider[globalProvider])
          ?? null,
      errorFor: (provider) => previewData.weatherErrors[provider] ?? null,
    },
    calendarEvents: previewData.calendarEvents,
    // The editor preview has no display fetch loop to report on (null reads
    // as healthy), but the payload's per-source health is real: a feed the
    // hub can't reach shows the same "not updating" pill and saved-row
    // suffixes here as on the kiosk, so the preview never passes off a
    // saved copy as live.
    calendarStatus: null,
    calendarSourceStatus: previewData.calendarSourceStatus,
    calendarPeople: settings?.calendarPeople ?? null,
    // No settings yet means the editor is still loading, not that the
    // household has no calendars: never flash the setup card over that.
    calendarConfigured: settings ? settings.calendarConfigured : true,
    availableDisplays: displays,
  };
}
