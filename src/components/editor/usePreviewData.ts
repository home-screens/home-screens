'use client';

import { useState, useEffect, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import { getCalendarFetchWindow } from '@/lib/calendar-window';
import { DEFAULT_CALENDAR_DAYS_AHEAD } from '@/lib/constants';
import { createTZDate } from '@/lib/timezone';
import { eventBus } from '@/lib/event-bus';
import { deriveWeatherConditions, deriveWeatherAlerts } from '@/lib/weather/derive';
import type { HourlyWeather, WeatherAlert } from '@/lib/weather/types';
import { logger } from '@/lib/logger';

const log = logger('preview-data');

interface ProviderWeatherData {
  hourly: unknown[] | null;
  forecast: unknown[] | null;
  minutely: unknown[] | null;
  alerts: unknown[] | null;
}

export interface PreviewData {
  weatherByProvider: Record<string, ProviderWeatherData>;
  calendarEvents: unknown[] | null;
}

/** Delay applied before refetching weather after a setting change. Long
 *  enough to skip intermediate states while typing coordinates, short enough
 *  that the editor preview feels responsive. */
const REFETCH_DEBOUNCE_MS = 500;

const ALL_PROVIDERS = ['openweathermap', 'weatherapi', 'pirateweather', 'noaa', 'open-meteo', 'yr', 'smhi', 'metoffice', 'envcanada'];
const NO_KEY_NEEDED = new Set(['noaa', 'open-meteo', 'yr', 'smhi', 'envcanada']);
const PROVIDER_KEY_MAP: Record<string, string> = {
  openweathermap: 'openweathermap_key',
  weatherapi: 'weatherapi_key',
  pirateweather: 'pirateweather_key',
  metoffice: 'metoffice_key',
};

export function usePreviewData(): PreviewData {
  const [previewData, setPreviewData] = useState<PreviewData>({
    weatherByProvider: {},
    calendarEvents: null,
  });

  // Pull the weather-relevant settings from the editor store. Changing any
  // of these triggers a debounced refetch so the WYSIWYG preview reflects
  // unsaved editor state instead of staying frozen at mount.
  const weatherSettings = useEditorStore((s) => s.config?.settings?.weather);
  const provider = weatherSettings?.provider;
  const latitude = weatherSettings?.latitude;
  const longitude = weatherSettings?.longitude;
  const units = weatherSettings?.units;

  // Configured-providers list. Secrets are fetched once per mount — they only
  // change via the Integrations tab, which forces a config reload anyway.
  // Keeping this separate from the weather effect avoids hitting /api/secrets
  // on every coordinate keystroke. Null until the status arrives; on failure
  // fall back to trying all providers.
  const { status: secrets, loading: secretsLoading, error: secretsError } = useSecretStatus();
  const providers = useMemo<string[] | null>(() => {
    if (secretsLoading) return null;
    if (secretsError) return ALL_PROVIDERS;
    return ALL_PROVIDERS.filter((p) => NO_KEY_NEEDED.has(p) || secrets[PROVIDER_KEY_MAP[p]]);
  }, [secrets, secretsLoading, secretsError]);

  useEffect(() => {
    // Wait for the providers list before triggering any weather fetches
    if (!providers) return;

    // Debounce so rapid edits (e.g. typing latitude digit-by-digit) don't
    // flood the weather APIs. Each setting change resets the timer.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPreviewData(controller.signal).catch(() => {
        // Aborted or transient — ignore
      });
    }, REFETCH_DEBOUNCE_MS);

    async function fetchPreviewData(signal: AbortSignal) {
      const results = await Promise.allSettled(
        providers!.map(async (p) => {
          const res = await editorFetch(`/api/weather?provider=${p}`, { signal });
          if (!res.ok) return null;
          const data = await res.json();
          return { provider: p, hourly: data.hourly ?? null, forecast: data.forecast ?? null, minutely: data.minutely ?? null, alerts: data.alerts ?? null };
        }),
      );

      if (signal.aborted) return;

      const byProvider: Record<string, ProviderWeatherData> = {};
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          byProvider[result.value.provider] = {
            hourly: result.value.hourly,
            forecast: result.value.forecast,
            minutely: result.value.minutely,
            alerts: result.value.alerts,
          };
        }
      }
      setPreviewData((prev) => ({ ...prev, weatherByProvider: byProvider }));
    }

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [providers, provider, latitude, longitude, units]);

  // Calendar fetch window derived from the active display's screens — same
  // computation the kiosk uses, so month/week grid views preview with past
  // events (WYSIWYG). Selecting a query *string* keeps the effect below from
  // re-running on unrelated store changes (module drags, style edits).
  const calendarQuery = useEditorStore((s) => {
    if (!s.config) return '';
    const win = getCalendarFetchWindow(
      getActiveScreens(s.config, s.selectedDisplayId),
      createTZDate(s.config.settings.timezone),
      s.config.settings.calendar?.daysAhead ?? DEFAULT_CALENDAR_DAYS_AHEAD,
    );
    if (!win) return '';
    return `timeMin=${encodeURIComponent(win.timeMin)}`
      + (win.timeMax ? `&timeMax=${encodeURIComponent(win.timeMax)}` : '');
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const calRes = await editorFetch(`/api/calendar${calendarQuery ? `?${calendarQuery}` : ''}`, { signal: controller.signal });
        if (calRes.ok) {
          const calData = await calRes.json();
          const events = Array.isArray(calData.events) ? calData.events : Array.isArray(calData) ? calData : [];
          if (!controller.signal.aborted) {
            setPreviewData((prev) => ({ ...prev, calendarEvents: events }));
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          log.debug('Failed to fetch calendar preview:', err);
        }
      }
    }, REFETCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [calendarQuery]);

  // Publish weather events to the event bus so editor modules using
  // useEventBus('weather.conditions') see the same data as the display.
  const globalProvider = provider ?? 'weatherapi';
  const globalWeather = previewData.weatherByProvider[globalProvider];
  useEffect(() => {
    if (!globalWeather) return;
    const conditions = deriveWeatherConditions(
      (globalWeather.hourly as HourlyWeather[] | undefined) ?? [],
      (units as 'imperial' | 'metric') ?? 'imperial',
    );
    if (conditions) eventBus.publish('weather.conditions', conditions);

    const alertsEvent = deriveWeatherAlerts(globalWeather.alerts as WeatherAlert[] | undefined);
    if (alertsEvent) eventBus.publish('weather.alerts', alertsEvent);
  }, [globalWeather, units]);

  return previewData;
}
