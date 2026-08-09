'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import type { Screen, GlobalSettings } from '@/types/config';
import { resolveProvider, type SharedDisplayData } from '@/lib/module-props';
import { getModuleDefinition } from '@/lib/module-registry';
import { useFetchData } from '@/hooks/useFetchData';
import { WEATHER_REFRESH_MS, CALENDAR_REFRESH_MS, DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { pluginEventBus } from '@/lib/plugin-events';
import { eventBus } from '@/lib/event-bus';
import { deriveWeatherConditions, deriveWeatherAlerts } from '@/lib/weather/derive';
import { getLocation } from '@/lib/location';
import { isModuleEnabled } from '@/lib/schedule';
import { getCalendarFetchWindow, buildCalendarUrl } from '@/lib/calendar-window';
import { createTZDate } from '@/lib/timezone';
import type { HourlyWeather, WeatherAlert } from '@/lib/weather/types';

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
    // Always fetch global-provider weather for the event bus
    needed.add(globalProvider);
    for (const screen of screens) {
      for (const mod of screen.modules) {
        if (!isModuleEnabled(mod)) continue;
        // Fetch weather for built-in weather modules
        if (mod.type === 'weather') {
          needed.add(resolveProvider(mod, globalProvider));
        }
        // Also fetch for plugins that declare a weather data requirement
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

  const [owmData] = useFetchData(weatherUrl('openweathermap'), WEATHER_REFRESH_MS);
  const [wapiData] = useFetchData(weatherUrl('weatherapi'), WEATHER_REFRESH_MS);
  const [pirateData] = useFetchData(weatherUrl('pirateweather'), WEATHER_REFRESH_MS);
  const [noaaData] = useFetchData(weatherUrl('noaa'), WEATHER_REFRESH_MS);
  const [openMeteoData] = useFetchData(weatherUrl('open-meteo'), WEATHER_REFRESH_MS);
  const [yrData] = useFetchData(weatherUrl('yr'), WEATHER_REFRESH_MS);
  const [smhiData] = useFetchData(weatherUrl('smhi'), WEATHER_REFRESH_MS);
  const [metofficeData] = useFetchData(weatherUrl('metoffice'), WEATHER_REFRESH_MS);
  const [envcanadaData] = useFetchData(weatherUrl('envcanada'), WEATHER_REFRESH_MS);

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

  const calendarIdList = settings.calendar.googleCalendarIds?.length
    ? settings.calendar.googleCalendarIds
    : settings.calendar.googleCalendarId ? [settings.calendar.googleCalendarId] : [];
  const hasIcalSources = settings.calendar.icalSources?.some(s => s.enabled);
  const hasHolidays = !!settings.calendar.holidayCountry;
  // Widen the fetch window when a month/week grid view is on some screen;
  // day-boundary based, so the URL stays stable across renders.
  const fetchWindow = getCalendarFetchWindow(
    screens,
    createTZDate(settings.timezone),
    settings.calendar.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD,
  );
  const calendarUrl = buildCalendarUrl(
    calendarIdList, !!hasIcalSources, hasHolidays, fetchWindow, refreshEpoch,
  );
  const [calendarData] = useFetchData(calendarUrl, CALENDAR_REFRESH_MS);

  // Memoized so consumers (BackgroundProviderLayer is React.memo'd) don't see
  // a new object identity on every ScreenRotator render tick.
  return useMemo(
    () => ({ owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData, calendarData }),
    [owmData, wapiData, pirateData, noaaData, openMeteoData, yrData, smhiData, metofficeData, envcanadaData, calendarData],
  );
}
