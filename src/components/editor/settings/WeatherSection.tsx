'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { SecretStatus } from './shared/SecretField';
import { WEATHER_PROVIDERS } from './weather/providers';
import WeatherProviderCard from './weather/WeatherProviderCard';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';

const log = logger('weather-settings');

interface WeatherSettings {
  provider: string;
  units: string;
  lat: string;
  lon: string;
}

interface Props {
  values: WeatherSettings;
  onChange: (updates: Partial<WeatherSettings>) => void;
}

export default function WeatherSection({ values, onChange }: Props) {
  const { provider, units, lat, lon } = values;
  const t = useTranslate('editor');

  const [status, setStatus] = useState<SecretStatus>({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await editorFetch('/api/secrets');
      if (res.ok) {
        const data: SecretStatus = await res.json();
        setStatus(data);
      }
    } catch (err) {
      log.debug('Failed to fetch secret status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const hasLocation = parseFloat(lat) !== 0 || parseFloat(lon) !== 0;

  return (
    <section>
      {/* Header */}
      <div className="mb-7">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-1.5">{t('settings.weatherPage.heading')}</h2>
        <p className="text-[13px] text-hs-text-faint">
          {t('settings.weatherPage.description')}
        </p>
      </div>

      {/* Units — top of the section */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.weatherPage.unitsLabel')}
        </div>
        <div className="inline-flex rounded-lg border border-hs-border-strong bg-hs-card p-0.5">
          <button
            type="button"
            onClick={() => onChange({ units: 'imperial' })}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              units === 'imperial'
                ? 'bg-hs-accent-soft text-hs-accent-hover'
                : 'text-hs-text-muted hover:text-hs-text-body'
            }`}
          >
            {t('settings.weatherPage.imperialOption')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ units: 'metric' })}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              units === 'metric'
                ? 'bg-hs-accent-soft text-hs-accent-hover'
                : 'text-hs-text-muted hover:text-hs-text-body'
            }`}
          >
            {t('settings.weatherPage.metricOption')}
          </button>
        </div>
      </div>

      {/* Location warning */}
      {!hasLocation && (
        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-6">
          <p className="text-xs text-hs-warning">
            {t('settings.weatherPage.locationWarning')}
          </p>
        </div>
      )}

      {/* Providers */}
      <div>
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.weatherPage.providersLabel')}
        </div>
        {loading ? (
          <p className="text-xs text-hs-text-faint">{t('settings.weatherPage.loadingProviderStatus')}</p>
        ) : (
          WEATHER_PROVIDERS.map((p) => (
            <WeatherProviderCard
              key={p.id}
              provider={p}
              isDefault={provider === p.id}
              keyConfigured={p.secretKey ? !!status[p.secretKey] : true}
              onSecretSaved={fetchStatus}
              onSetDefault={() => onChange({ provider: p.id })}
              lat={lat}
              lon={lon}
              units={units}
            />
          ))
        )}
      </div>
    </section>
  );
}
