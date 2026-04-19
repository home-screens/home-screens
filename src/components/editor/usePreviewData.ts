'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
import { eventBus } from '@/lib/event-bus';
import { deriveWeatherConditions, deriveWeatherAlerts } from '@/lib/weather/derive';
import type { HourlyWeather, WeatherAlert } from '@/lib/weather/types';

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

const ALL_PROVIDERS = ['openweathermap', 'weatherapi', 'pirateweather', 'noaa', 'open-meteo', 'yr', 'smhi'];
const NO_KEY_NEEDED = new Set(['noaa', 'open-meteo', 'yr', 'smhi']);
const PROVIDER_KEY_MAP: Record<string, string> = {
  openweathermap: 'openweathermap_key',
  weatherapi: 'weatherapi_key',
  pirateweather: 'pirateweather_key',
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

  // Configured-providers list. Fetched once per mount — secrets only change
  // via the Integrations tab, which forces a config reload anyway. Splitting
  // this out of the weather effect avoids hitting /api/secrets on every
  // coordinate keystroke.
  const [providers, setProviders] = useState<string[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await editorFetch('/api/secrets', { signal: controller.signal });
        if (!res.ok) {
          setProviders(ALL_PROVIDERS);
          return;
        }
        const secrets: Record<string, boolean> = await res.json();
        setProviders(
          ALL_PROVIDERS.filter((p) => NO_KEY_NEEDED.has(p) || secrets[PROVIDER_KEY_MAP[p]]),
        );
      } catch {
        // Fall back to all providers if secrets check fails
        if (!controller.signal.aborted) setProviders(ALL_PROVIDERS);
      }
    })();
    return () => controller.abort();
  }, []);

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

      try {
        const calRes = await editorFetch('/api/calendar', { signal });
        if (calRes.ok) {
          const calData = await calRes.json();
          const events = Array.isArray(calData.events) ? calData.events : Array.isArray(calData) ? calData : [];
          if (!signal.aborted) {
            setPreviewData((prev) => ({ ...prev, calendarEvents: events }));
          }
        }
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.debug('Failed to fetch calendar preview:', err);
        }
      }
    }

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [providers, provider, latitude, longitude, units]);

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
