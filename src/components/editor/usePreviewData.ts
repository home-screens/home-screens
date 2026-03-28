'use client';

import { useState, useEffect } from 'react';

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

export function usePreviewData(): PreviewData {
  const [previewData, setPreviewData] = useState<PreviewData>({
    weatherByProvider: {},
    calendarEvents: null,
  });

  useEffect(() => {
    async function fetchPreviewData() {
      // Only fetch providers that have API keys configured (or need none).
      // Check secrets first to avoid 400/500 errors for unconfigured providers.
      const allProviders: string[] = ['openweathermap', 'weatherapi', 'pirateweather', 'noaa', 'open-meteo'];
      const noKeyNeeded = new Set(['noaa', 'open-meteo']);
      let providers = allProviders;
      try {
        const secretsRes = await fetch('/api/secrets');
        if (secretsRes.ok) {
          const secrets: Record<string, boolean> = await secretsRes.json();
          const keyMap: Record<string, string> = {
            openweathermap: 'openweathermap_key',
            weatherapi: 'weatherapi_key',
            pirateweather: 'pirateweather_key',
          };
          providers = allProviders.filter(p => noKeyNeeded.has(p) || secrets[keyMap[p]]);
        }
      } catch {
        // Fall back to all providers if secrets check fails
      }
      const results = await Promise.allSettled(
        providers.map(async (p) => {
          const res = await fetch(`/api/weather?provider=${p}`);
          if (!res.ok) return null;
          const data = await res.json();
          return { provider: p, hourly: data.hourly ?? null, forecast: data.forecast ?? null, minutely: data.minutely ?? null, alerts: data.alerts ?? null };
        }),
      );

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
        const calRes = await fetch('/api/calendar');
        if (calRes.ok) {
          const calData = await calRes.json();
          const events = Array.isArray(calData.events) ? calData.events : Array.isArray(calData) ? calData : [];
          setPreviewData((prev) => ({ ...prev, calendarEvents: events }));
        }
      } catch (err) {
        console.debug('Failed to fetch calendar preview:', err);
      }
    }
    fetchPreviewData();
  }, []);

  return previewData;
}
