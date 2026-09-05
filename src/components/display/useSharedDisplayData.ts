'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Screen, GlobalSettings } from '@/types/config';
import { extractCalendarEvents, resolveProvider, type SharedDisplayData } from '@/lib/module-props';
import { getModuleDefinition } from '@/lib/module-registry';
import { useFetchData } from '@/hooks/useFetchData';
import { WEATHER_REFRESH_MS, CALENDAR_REFRESH_MS, DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { pluginEventBus } from '@/lib/plugin-events';
import { eventBus } from '@/lib/event-bus';
import { deriveWeatherConditions, deriveWeatherAlerts } from '@/lib/weather/derive';
import { getLocation } from '@/lib/location';
import { isModuleEnabled } from '@/lib/schedule';
import { getCalendarFetchWindow } from '@/lib/calendar-window';
import { buildCalendarUrl, googleCalendarIdList, hasCalendarFeedSources } from '@/lib/calendar-sources';
import { CALENDAR_STATE_KEY_LIST, deriveCalendarState } from '@/lib/calendar-state';
import { sharedStateStore } from '@/lib/shared-state-store';
import { CALENDAR_STATE_REPUBLISH_MS } from '@/lib/constants';
import { createTZDate } from '@/lib/timezone';
import { useFormattingLocale } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarEvent } from '@/types/config';
import type { HourlyWeather, WeatherAlert } from '@/lib/weather/types';
import type { FetchError } from '@/lib/fetch-error';

/** Fetch weather + calendar data once, shared across all screen rotations. */
export function useSharedDisplayData(screens: Screen[], settings: GlobalSettings): SharedDisplayData {
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

  const [owmData, owmError] = useFetchData(weatherUrl('openweathermap'), WEATHER_REFRESH_MS);
  const [wapiData, wapiError] = useFetchData(weatherUrl('weatherapi'), WEATHER_REFRESH_MS);
  const [pirateData, pirateError] = useFetchData(weatherUrl('pirateweather'), WEATHER_REFRESH_MS);
  const [noaaData, noaaError] = useFetchData(weatherUrl('noaa'), WEATHER_REFRESH_MS);
  const [openMeteoData, openMeteoError] = useFetchData(weatherUrl('open-meteo'), WEATHER_REFRESH_MS);
  const [yrData, yrError] = useFetchData(weatherUrl('yr'), WEATHER_REFRESH_MS);
  const [smhiData, smhiError] = useFetchData(weatherUrl('smhi'), WEATHER_REFRESH_MS);
  const [metofficeData, metofficeError] = useFetchData(weatherUrl('metoffice'), WEATHER_REFRESH_MS);
  const [envcanadaData, envcanadaError] = useFetchData(weatherUrl('envcanada'), WEATHER_REFRESH_MS);

  // Failing providers, so a weather module with no payload can say why
  // (setup card for a missing key, quiet "not updating" for an outage)
  // instead of "No weather data" forever. Only failing entries are kept, so
  // a healthy display builds the same object every render.
  const weatherErrors = useMemo(() => {
    const errors: Partial<Record<string, FetchError>> = {};
    const entries: Array<[string, FetchError | null]> = [
      ['openweathermap', owmError], ['weatherapi', wapiError], ['pirateweather', pirateError],
      ['noaa', noaaError], ['open-meteo', openMeteoError], ['yr', yrError], ['smhi', smhiError],
      ['metoffice', metofficeError], ['envcanada', envcanadaError],
    ];
    for (const [provider, error] of entries) if (error) errors[provider] = error;
    return errors;
  }, [owmError, wapiError, pirateError, noaaError, openMeteoError, yrError, smhiError, metofficeError, envcanadaError]);

  // Resolve which provider's data represents the global weather state for the event bus
  const globalWeatherData = useMemo(() => {
    switch (globalProvider) {
      case 'openweathermap': return owmData;
      case 'weatherapi': return wapiData;
      case 'pirateweather': return pirateData;
      case 'noaa': return noaaData;
      case 'open-meteo': return openMeteoData;
      case 'yr': return yrData;
      case 'smhi': return smhiData;
      case 'metoffice': return metofficeData;
      case 'envcanada': return envcanadaData;
      default: return null;
    }
  }, [globalProvider, owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData]);

  // Publish derived weather events to the bus
  useEffect(() => {
    if (!globalWeatherData) return;
    const raw = globalWeatherData as Record<string, unknown>;
    const units = settings.weather.units as 'imperial' | 'metric';

    const conditions = deriveWeatherConditions(
      (raw.hourly as HourlyWeather[] | undefined) ?? [],
      units,
    );
    if (conditions) eventBus.publish('weather.conditions', conditions);

    const alertsEvent = deriveWeatherAlerts(raw.alerts as WeatherAlert[] | undefined);
    if (alertsEvent) eventBus.publish('weather.alerts', alertsEvent);
  }, [globalWeatherData, settings.weather.units]);

  const calendarIdList = googleCalendarIdList(settings.calendar);
  const hasFeedSources = hasCalendarFeedSources(settings.calendar);
  // Widen the fetch window when a month/week grid view is on some screen;
  // day-boundary based, so the URL stays stable across renders.
  const fetchWindow = getCalendarFetchWindow(
    screens,
    createTZDate(settings.timezone),
    settings.calendar.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD,
  );
  const calendarUrl = buildCalendarUrl(calendarIdList, hasFeedSources, fetchWindow, refreshEpoch);
  // The same sources without the window or the refresh bump: every URL this
  // display builds for these sources is one dataset, so a midnight window
  // advance or a forced refresh keeps the events already on the wall while
  // the new request is in flight or failing.
  const calendarDatasetKey = buildCalendarUrl(calendarIdList, hasFeedSources, null, 0);
  const [calendarData, calendarError, calendarUpdatedAt] = useFetchData(
    calendarUrl,
    CALENDAR_REFRESH_MS,
    calendarDatasetKey,
  );

  // Failure ≠ empty: the calendar modules must distinguish "the fetch is
  // failing" (keep last-good events, badge them as saved) from "the calendar
  // is genuinely empty", so the fetch status rides along with the payload.
  const calendarErrorMessage = calendarError?.message ?? null;
  const calendarStatus = useMemo(
    () => ({ error: calendarErrorMessage, updatedAt: calendarUpdatedAt }),
    [calendarErrorMessage, calendarUpdatedAt],
  );

  // Publish calendar facts to the shared-state bus (see calendar-state.ts).
  // Deliberately here rather than in a calendar module: these values must
  // survive screen rotation and exist on displays that show no calendar.
  //
  // The interval recomputes without touching React state — "in 12 minutes"
  // and "busy now" go stale on the clock, not on new data, and a ticking
  // `useState` in this hook would re-render the whole rotator every minute
  // on a Pi. Only modules subscribed to these exact keys re-render.
  const timezone = settings.timezone;
  const timeFormat = settings.timeFormat ?? DEFAULT_TIME_FORMAT;
  const locale = useFormattingLocale();
  useEffect(() => {
    const events = extractCalendarEvents(calendarData) as CalendarEvent[] | null;
    // No payload means nothing is being fetched: either no calendar source is
    // configured, or the first fetch hasn't landed. The producer genuinely has
    // no values, so release the keys instead of leaving the last ones frozen
    // on the bus — `useFetchData` nulls its data the moment the URL empties,
    // and config is live-polled, so deleting the last calendar reaches a
    // running display within seconds. A failing fetch keeps its last-good
    // payload, so an upstream outage never takes this path.
    if (!events) {
      for (const key of CALENDAR_STATE_KEY_LIST) sharedStateStore.clearKey(key);
      return;
    }
    const tick = () => {
      const values = deriveCalendarState(events, createTZDate(timezone), { timezone, timeFormat, locale });
      for (const [key, value] of Object.entries(values)) sharedStateStore.publish(key, value);
    };
    tick();
    const timer = setInterval(tick, CALENDAR_STATE_REPUBLISH_MS);
    return () => clearInterval(timer);
  }, [calendarData, timezone, timeFormat, locale]);

  // Memoized so consumers (BackgroundProviderLayer is React.memo'd) don't see
  // a new object identity on every ScreenRotator render tick.
  return useMemo(
    () => ({ owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData, weatherErrors, calendarData, calendarStatus }),
    [owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData, weatherErrors, calendarData, calendarStatus],
  );
}
