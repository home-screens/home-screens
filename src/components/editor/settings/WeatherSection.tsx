'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { SecretStatus } from './shared/SecretField';
import { WEATHER_PROVIDERS } from './weather/providers';
import WeatherProviderCard from './weather/WeatherProviderCard';

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
      console.debug('Failed to fetch secret status:', err);
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
        <h2 className="text-lg font-semibold text-hs-text-primary mb-1.5">Weather</h2>
        <p className="text-[13px] text-hs-text-faint">
          Configure any of the weather providers below. Individual weather widgets can pick any
          configured provider; one is used as the default.
        </p>
      </div>

      {/* Units — top of the section */}
      <div className="mb-6">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          Units
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
            Imperial (°F, mph)
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
            Metric (°C, km/h)
          </button>
        </div>
      </div>

      {/* Location warning */}
      {!hasLocation && (
        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-6">
          <p className="text-xs text-hs-warning">
            Set your location for weather to work. Enter a zip code or city name, or use Detect.
          </p>
        </div>
      )}

      {/* Providers */}
      <div>
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          Providers
        </div>
        {loading ? (
          <p className="text-xs text-hs-text-faint">Loading provider status…</p>
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
