'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Screen } from '@/types/config';
import type { DisplaySettings } from './useLiveConfig';
import { extractCalendarEvents, resolveProvider, type SharedDisplayData } from '@/lib/module-props';
import { getModuleDefinition } from '@/lib/module-registry';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useFetchData } from '@/hooks/useFetchData';
import { WEATHER_REFRESH_MS, CALENDAR_REFRESH_MS, DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { pluginEventBus } from '@/lib/plugin-events';
import { getLocation } from '@/lib/location';
import { isModuleEnabled } from '@/lib/schedule';
import { getCalendarFetchWindow } from '@/lib/calendar-window';
import { useLookAheadStore } from '@/stores/look-ahead-store';
import { buildCalendarUrl, googleCalendarIdList, hasCalendarFeedSources } from '@/lib/calendar-sources';
import type { WeatherStatePayload } from '@/lib/weather-state';
import { useHostStatePublisher } from '@/hooks/useHostStatePublisher';
import { notesUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { Note } from '@/types/notes';
import { createTZDate } from '@/lib/timezone';
import { useFormattingLocale } from '@/i18n';
import type { CalendarEvent } from '@/types/config';
import type { FetchError } from '@/lib/fetch-error';
import { householdTimeFormat } from '@/lib/clock-time';
import { WEATHER_PROVIDER_IDS, isWeatherProviderId, type WeatherProviderId } from '@/lib/weather-providers';

/** Whether the hub asked walls to stop fetching calendars while asleep (see the calendar route). */
function pausesWhileAsleep(calendarData: unknown): boolean {
  return !!calendarData && typeof calendarData === 'object' && !Array.isArray(calendarData)
    && (calendarData as { pauseWhileAsleep?: unknown }).pauseWhileAsleep === true;
}

/**
 * Fetch weather + calendar data once, shared across all screen rotations.
 * `asleep` is the wall's sleep state: calendars rest while it sleeps when the
 * hub asks (hubs on Home Screens' own Google app, whose quota they share).
 */
export function useSharedDisplayData(
  screens: Screen[],
  settings: DisplaySettings,
  { asleep = false }: { asleep?: boolean } = {},
): SharedDisplayData {
  const { members: familyMembers, groups: familyGroups, revision: familyRevision, error: familyError } = useFamilyData();
  const familyState = familyRevision ? undefined : familyError ? 'failed' as const : 'loading' as const;
  // Bumped by plugin 'refresh' events to force re-fetch
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  const forceRefresh = useCallback(() => {
    setRefreshEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    return pluginEventBus.on((event) => {
      if (event.type === 'refresh') forceRefresh();
    });
  }, [forceRefresh]);

  const globalProvider = settings.weather.provider;
  const location = getLocation(settings);
  const hasLocation = location != null;
  const baseParams = location
    ? `lat=${location.lat}&lon=${location.lon}&units=${settings.weather.units}`
    : '';

  const neededProviders = useMemo(() => {
    const needed = new Set<string>();
    // Without a configured location every weather fetch is a guaranteed 400
    // and the modules render LocationRequired anyway, so don't start any
    // provider poll loops — an empty set makes every weatherUrl() below ''.
    if (!hasLocation) return needed;
    // for the event bus
    needed.add(globalProvider);
    for (const screen of screens) {
      for (const mod of screen.modules) {
        if (!isModuleEnabled(mod)) continue;
        const def = getModuleDefinition(mod.type);
        if (def?.dataRequirements?.includes('weather')) {
          needed.add(resolveProvider(mod, globalProvider));
        }
      }
    }
    return needed;
  }, [screens, globalProvider, hasLocation]);

  // Append refresh epoch to URLs so useFetchData re-runs on force refresh.
  // Epoch 0 is omitted to keep URLs clean during normal operation.
  const cacheBust = refreshEpoch > 0 ? `&_r=${refreshEpoch}` : '';

  const weatherUrl = (provider: string) =>
    neededProviders.has(provider) ? `/api/weather?${baseParams}&provider=${provider}${cacheBust}` : '';

  // One call per source, spelled out so the hook order never depends on a
  // loop. The two records below are typed by the provider table, so a source
  // added there and not here does not compile.
  const [owmData, owmError, owmAt] = useFetchData(weatherUrl('openweathermap'), WEATHER_REFRESH_MS);
  const [wapiData, wapiError, wapiAt] = useFetchData(weatherUrl('weatherapi'), WEATHER_REFRESH_MS);
  const [pirateData, pirateError, pirateAt] = useFetchData(weatherUrl('pirateweather'), WEATHER_REFRESH_MS);
  const [noaaData, noaaError, noaaAt] = useFetchData(weatherUrl('noaa'), WEATHER_REFRESH_MS);
  const [openMeteoData, openMeteoError, openMeteoAt] = useFetchData(weatherUrl('open-meteo'), WEATHER_REFRESH_MS);
  const [yrData, yrError, yrAt] = useFetchData(weatherUrl('yr'), WEATHER_REFRESH_MS);
  const [smhiData, smhiError, smhiAt] = useFetchData(weatherUrl('smhi'), WEATHER_REFRESH_MS);
  const [metofficeData, metofficeError, metofficeAt] = useFetchData(weatherUrl('metoffice'), WEATHER_REFRESH_MS);
  const [envcanadaData, envcanadaError, envcanadaAt] = useFetchData(weatherUrl('envcanada'), WEATHER_REFRESH_MS);

  // Memoized so a render that fetched nothing new hands every consumer the
  // same record (BackgroundProviderLayer is React.memo'd).
  const weatherByProvider = useMemo<Record<WeatherProviderId, unknown>>(() => ({
    openweathermap: owmData, weatherapi: wapiData, pirateweather: pirateData, noaa: noaaData,
    'open-meteo': openMeteoData, yr: yrData, smhi: smhiData, metoffice: metofficeData, envcanada: envcanadaData,
  }), [owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData]);

  // Failing providers, so a weather module with no payload can say why
  // (setup card for a missing key, quiet "not updating" for an outage)
  // instead of "No weather data" forever. Only failing entries are kept, so
  // a healthy display builds the same object every render.
  const weatherErrors = useMemo(() => {
    const latest: Record<WeatherProviderId, FetchError | null> = {
      openweathermap: owmError, weatherapi: wapiError, pirateweather: pirateError, noaa: noaaError,
      'open-meteo': openMeteoError, yr: yrError, smhi: smhiError, metoffice: metofficeError, envcanada: envcanadaError,
    };
    const errors: Partial<Record<string, FetchError>> = {};
    for (const provider of WEATHER_PROVIDER_IDS) {
      const error = latest[provider];
      if (error) errors[provider] = error;
    }
    return errors;
  }, [owmError, wapiError, pirateError, noaaError, openMeteoError, yrError, smhiError, metofficeError, envcanadaError]);

  // When each failing source last answered, while the reading it gave then is
  // still on screen: a card keeps that reading through an outage, and says
  // how old it is. `updatedAt` holds still while a failure lasts (it is the
  // last fetch that worked), so a healthy display builds an empty object and
  // an outage builds the same one on every render.
  const weatherStaleSince = useMemo(() => {
    const at: Record<WeatherProviderId, number | null> = {
      openweathermap: owmAt, weatherapi: wapiAt, pirateweather: pirateAt, noaa: noaaAt,
      'open-meteo': openMeteoAt, yr: yrAt, smhi: smhiAt, metoffice: metofficeAt, envcanada: envcanadaAt,
    };
    const since: Partial<Record<string, number>> = {};
    for (const provider of WEATHER_PROVIDER_IDS) {
      const fetchedAt = at[provider];
      if (weatherErrors[provider] && weatherByProvider[provider] && fetchedAt != null) since[provider] = fetchedAt;
    }
    return since;
  }, [weatherErrors, weatherByProvider, owmAt, wapiAt, pirateAt, noaaAt, openMeteoAt, yrAt, smhiAt, metofficeAt, envcanadaAt]);

  // The household source's payload feeds the event bus and the shared state.
  // A source this build does not know has no payload, which clears the keys.
  const globalWeatherData = isWeatherProviderId(globalProvider) ? weatherByProvider[globalProvider] : null;

  // The notes board, for its counts on the bus below. The same read every
  // Notes module makes, followed by the heartbeat's `notes` revision, so the
  // keys exist on a display that shows no Notes module and a layout can hide
  // a board that has nothing on it.
  const [notesData] = useFetchData<{ notes: Note[] }>(notesUrl(), FETCH_KEY_REGISTRY.notes.ttlMs);

  const calendarIdList = googleCalendarIdList(settings.calendar);
  const hasFeedSources = hasCalendarFeedSources(settings.calendar);
  // Widen the fetch window when a month/week grid view is on some screen;
  // day-boundary based, so the URL stays stable across renders.
  // A calendar stepped away from now (look-ahead arrows) widens it to all it may show.
  const lookStart = useLookAheadStore((s) => s.span?.start ?? null);
  const lookEnd = useLookAheadStore((s) => s.span?.end ?? null);
  const fetchWindow = getCalendarFetchWindow(
    screens,
    createTZDate(settings.timezone),
    settings.calendar.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD,
    lookStart !== null && lookEnd !== null ? { start: new Date(lookStart), end: new Date(lookEnd) } : null,
  );
  const calendarUrl = buildCalendarUrl(calendarIdList, hasFeedSources, fetchWindow, refreshEpoch);
  // The same sources without the window or the refresh bump: every URL this
  // display builds for these sources is one dataset, so a midnight window
  // advance or a forced refresh keeps the events already on the wall while
  // the new request is in flight or failing.
  const calendarDatasetKey = buildCalendarUrl(calendarIdList, hasFeedSources, null, 0);
  // The hub's own say on each answer: hubs on Home Screens' Google app share
  // one Google quota, so an asleep wall stops asking and the events on it
  // stay put; waking fetches straight away. Held in state so the answer that
  // sets it re-renders this hook, which is what turns the pause on.
  const [calendarRestsAsleep, setCalendarRestsAsleep] = useState(false);
  const [calendarData, calendarError, calendarUpdatedAt] = useFetchData(
    calendarUrl,
    CALENDAR_REFRESH_MS,
    { datasetKey: calendarDatasetKey, paused: asleep && calendarRestsAsleep },
  );
  useEffect(() => {
    setCalendarRestsAsleep(pausesWhileAsleep(calendarData));
  }, [calendarData]);

  // Failure ≠ empty: the calendar modules must distinguish "the fetch is
  // failing" (keep last-good events, badge them as saved) from "the calendar
  // is genuinely empty", so the fetch status rides along with the payload.
  const calendarErrorMessage = calendarError?.message ?? null;
  const calendarStatus = useMemo(
    () => ({ error: calendarErrorMessage, updatedAt: calendarUpdatedAt }),
    [calendarErrorMessage, calendarUpdatedAt],
  );

  // The host's own facts, published from here rather than from a module: the
  // values must survive screen rotation and exist on displays that show no
  // weather, calendar or notes module. `useFetchData` nulls its data the
  // moment the URL empties, and config is live-polled, so deleting the last
  // calendar reaches a running display within seconds and releases its keys.
  const locale = useFormattingLocale();
  const calendarEvents = useMemo(
    () => extractCalendarEvents(calendarData) as CalendarEvent[] | null,
    [calendarData],
  );
  useHostStatePublisher({
    weather: (globalWeatherData as WeatherStatePayload | null | undefined) || null,
    weatherUnits: settings.weather.units as 'imperial' | 'metric',
    calendarEvents,
    notes: Array.isArray(notesData?.notes) ? notesData.notes : null,
    timezone: settings.timezone,
    timeFormat: householdTimeFormat(settings.timeFormat, locale),
    locale,
  });

  // Memoized so consumers (BackgroundProviderLayer is React.memo'd) don't see
  // a new object identity on every ScreenRotator render tick.
  return useMemo(
    () => ({ weatherByProvider, weatherErrors, weatherStaleSince, calendarData, calendarStatus, familyMembers, familyGroups, familyState }),
    [weatherByProvider, weatherErrors, weatherStaleSince, calendarData, calendarStatus, familyMembers, familyGroups, familyState],
  );
}
