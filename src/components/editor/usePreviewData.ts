'use client';

import { useState, useEffect, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEditorStore } from '@/stores/editor-store';
import { usePreviewWeatherStore } from '@/stores/preview-weather-store';
import { useCalendarFetchQuery } from './useCalendarFetchQuery';
import { hasAnyCalendarSource } from '@/lib/calendar-sources';
import type { WeatherStatePayload } from '@/lib/weather-state';
import { useHostStatePublisher } from '@/hooks/useHostStatePublisher';
import { useFetchData } from '@/hooks/useFetchData';
import { notesUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { householdTimeFormat } from '@/lib/clock-time';
import { useFormattingLocale } from '@/i18n';
import { selectHouseholdTimezone } from './useEditorHouseholdClock';
import type { CalendarEvent } from '@/types/config';
import type { Note } from '@/types/notes';
import type { PreviewData } from '@/lib/module-props';
import { logger } from '@/lib/logger';
import { readFetchError, setupError, type FetchError } from '@/lib/fetch-error';
import { weatherProviderName } from '@/lib/weather-provider-names';
import { previewWeatherProviders } from '@/lib/weather-preview-providers';
import { DEFAULT_WEATHER_PROVIDER, WEATHER_PROVIDER_IDS, configuredWeatherProviders } from '@/lib/weather-providers';

const log = logger('preview-data');

type ProviderWeatherData = PreviewData['weatherByProvider'][string];

/** Delay applied before refetching weather after a setting change. Long
 *  enough to skip intermediate states while typing coordinates, short enough
 *  that the editor preview feels responsive. */
const REFETCH_DEBOUNCE_MS = 500;


export function usePreviewData(): PreviewData {
  const [previewData, setPreviewData] = useState<PreviewData>({
    weatherByProvider: {},
    weatherErrors: {},
    calendarEvents: null,
    calendarSourceStatus: null,
  });

  // Pull the weather-relevant settings from the editor store. Changing any
  // of these triggers a debounced refetch so the WYSIWYG preview reflects
  // unsaved editor state instead of staying frozen at mount.
  const weatherSettings = useEditorStore((s) => s.config?.settings?.weather);
  const provider = weatherSettings?.provider;
  const latitude = useEditorStore((s) => s.config?.settings?.latitude);
  const longitude = useEditorStore((s) => s.config?.settings?.longitude);
  const units = weatherSettings?.units;
  const requestedProviderKey = useEditorStore((s) => previewWeatherProviders(s.config).join('|'));
  const requestedProviders = useMemo(
    () => new Set(requestedProviderKey.split('|').filter(Boolean)),
    [requestedProviderKey],
  );

  // Available providers from the shared secret-status store. The store
  // keeps `status` identity-stable across refetches unless the payload
  // actually changed. Only providers used by the global setting or a weather
  // module are fetched: probing every keyless provider sends UK coordinates
  // to region-limited NOAA, SMHI and Environment Canada endpoints.
  const { status: secrets, loading: secretsLoading, error: secretsError, hasStatus } = useSecretStatus();
  const statusUnknown = secretsError && !hasStatus;
  const providers = useMemo<string[] | null>(() => {
    if (secretsLoading || requestedProviders.size === 0) return null;
    // With the key status unknown the preview asks anyway (the route answers
    // for a missing key); the per-module picker, by contrast, offers nothing.
    const runnable: readonly string[] = statusUnknown ? WEATHER_PROVIDER_IDS : configuredWeatherProviders(secrets);
    return WEATHER_PROVIDER_IDS.filter((p) => requestedProviders.has(p) && runnable.includes(p));
  }, [requestedProviders, secrets, secretsLoading, statusUnknown]);
  // Keyed providers with no key saved, judged from the key status alone. Not
  // "keyed and not fetched": a provider with a key that no module uses yet is
  // also not fetched, and must not read as missing its key when one switches to it.
  const missingKeyProviders = useMemo<string[]>(() => {
    if (secretsLoading || statusUnknown) return [];
    const runnable: readonly string[] = configuredWeatherProviders(secrets);
    return WEATHER_PROVIDER_IDS.filter((p) => !runnable.includes(p));
  }, [secrets, secretsLoading, statusUnknown]);

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
      const errors: Record<string, FetchError> = {};
      // Keyed providers without a key are never fetched (the route would only
      // answer 400), so the preview says so itself: the same setup card the
      // wall shows, here with a link to where the key goes.
      for (const p of missingKeyProviders) {
        errors[p] = setupError('key', weatherProviderName(p), { page: 'weather' });
      }
      const results = await Promise.allSettled(
        providers!.map(async (p) => {
          const res = await editorFetch(`/api/weather?provider=${p}`, { signal });
          if (!res.ok) {
            errors[p] = await readFetchError(res, `API error ${res.status}`);
            return null;
          }
          const data = await res.json();
          return { provider: p, hourly: data.hourly ?? null, forecast: data.forecast ?? null, minutely: data.minutely ?? null, alerts: data.alerts ?? null };
        }),
      );

      if (signal.aborted) return;

      const byProvider: Record<string, ProviderWeatherData> = {};
      const forecastDays: Record<string, number> = {};
      const forecastHours: Record<string, number> = {};
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          byProvider[result.value.provider] = {
            hourly: result.value.hourly,
            forecast: result.value.forecast,
            minutely: result.value.minutely,
            alerts: result.value.alerts,
          };
          if (Array.isArray(result.value.forecast)) {
            forecastDays[result.value.provider] = result.value.forecast.length;
          }
          if (Array.isArray(result.value.hourly)) {
            forecastHours[result.value.provider] = result.value.hourly.length;
          }
        }
      }
      setPreviewData((prev) => ({ ...prev, weatherByProvider: byProvider, weatherErrors: errors }));
      // The property panel's days and hours fields read these to say where
      // each source stops. A failed source is left out, so its field says nothing.
      usePreviewWeatherStore.getState().setForecastLengths({ days: forecastDays, hours: forecastHours });
    }

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [providers, missingKeyProviders, provider, latitude, longitude, units]);

  // Calendar fetch window derived from the active display's screens — same
  // computation the kiosk uses, so month/week grid views preview with past
  // events (WYSIWYG).
  const calendarQuery = useCalendarFetchQuery('active');
  // With no calendar set up there is nothing to preview, and asking anyway
  // only earns a 400 in the console of every fresh install.
  const hasCalendar = useEditorStore((s) => hasAnyCalendarSource(s.config?.settings?.calendar));

  useEffect(() => {
    if (!hasCalendar) {
      setPreviewData((prev) => (prev.calendarEvents === null && prev.calendarSourceStatus === null
        ? prev
        : { ...prev, calendarEvents: null, calendarSourceStatus: null }));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const calRes = await editorFetch(`/api/calendar${calendarQuery ? `?${calendarQuery}` : ''}`, { signal: controller.signal });
        if (calRes.ok) {
          const calData = await calRes.json();
          const events = Array.isArray(calData.events) ? calData.events : Array.isArray(calData) ? calData : [];
          const sourceStatus = Array.isArray(calData.sourceStatus) ? calData.sourceStatus : null;
          if (!controller.signal.aborted) {
            setPreviewData((prev) => ({ ...prev, calendarEvents: events, calendarSourceStatus: sourceStatus }));
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
  }, [calendarQuery, hasCalendar]);

  // Publish the same host facts the wall puts on its buses (weather events,
  // and the weather, calendar and notes keys) onto this tab's, from what the
  // preview already fetched. The canvas Text module reads its tokens and
  // looks from the tab's own bus, as plugin providers feed it through
  // EditorStateProviderLayer; without this the wall showed a weather look
  // while the canvas kept the plain text and "Outside it is – and –", and a
  // "{calendar.next_title}" or "{notes.count}" token stayed blank. The editor
  // never reports a heartbeat, so nothing here reaches the hub or a display,
  // and a fresh display snapshot still wins for the verdict chips.
  const globalProvider = provider ?? DEFAULT_WEATHER_PROVIDER;
  // The household's zone, as the wall resolves it: never this laptop's own.
  const timezone = useEditorStore(selectHouseholdTimezone);
  const savedTimeFormat = useEditorStore((s) => s.config?.settings?.timeFormat);
  const locale = useFormattingLocale();
  // The notes board, read the way a Notes module on the canvas reads it.
  const [notesData] = useFetchData<{ notes: Note[] }>(notesUrl(), FETCH_KEY_REGISTRY.notes.ttlMs);
  useHostStatePublisher({
    weather: (previewData.weatherByProvider[globalProvider] as WeatherStatePayload | undefined) ?? null,
    weatherUnits: (units as 'imperial' | 'metric') ?? 'imperial',
    calendarEvents: previewData.calendarEvents as CalendarEvent[] | null,
    notes: Array.isArray(notesData?.notes) ? notesData.notes : null,
    timezone,
    timeFormat: householdTimeFormat(savedTimeFormat, locale),
    locale,
  });

  return previewData;
}
