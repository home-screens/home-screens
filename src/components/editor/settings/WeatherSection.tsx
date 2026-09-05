'use client';

import { useSecretStatus } from '@/hooks/useSecretStatus';
import { WEATHER_PROVIDERS } from './weather/providers';
import { weatherProviderName } from '@/lib/weather-provider-names';
import WeatherProviderCard from './weather/WeatherProviderCard';
import LabeledInput from '@/components/ui/LabeledInput';
import { DEFAULT_RADAR_SERVER_URL, normalizeRadarServerUrl } from '@/lib/radar-server';
import { useTranslate } from '@/i18n';

interface WeatherSettings {
  provider: string;
  units: string;
  lat: string;
  lon: string;
  radarServerUrl: string;
}

interface Props {
  values: WeatherSettings;
  onChange: (updates: Partial<WeatherSettings>) => void;
}

export default function WeatherSection({ values, onChange }: Props) {
  const { provider, units, lat, lon, radarServerUrl } = values;
  const t = useTranslate('editor');
  // Blank means the public server; anything else must be a full http(s)
  // address or the hub silently falls back to the default, so say so here.
  const radarServerInvalid = radarServerUrl.trim() !== '' && normalizeRadarServerUrl(radarServerUrl) === null;

  const { status, loading, refetch } = useSecretStatus();

  const hasLocation = parseFloat(lat) !== 0 || parseFloat(lon) !== 0;

  // The default provider is what every weather module uses unless it picks
  // its own; a keyed default with no key means the wall shows setup cards.
  // Say so at the top of the page and offer the free provider in one click.
  const defaultProvider = WEATHER_PROVIDERS.find((p) => p.id === provider);
  const defaultNeedsKey = !loading && !!defaultProvider?.secretKey && !status[defaultProvider.secretKey];

  return (
    <section>

      {/* Units — top of the section */}
      <div className="mb-6" data-field-id="weather.units">
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

      {/* Default provider has no key: weather modules are blank until fixed */}
      {defaultNeedsKey && defaultProvider && (
        <div data-testid="weather-default-needs-key" className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2.5 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-xs text-hs-warning flex-1 min-w-[16rem]">
            {t('settings.weatherPage.defaultNeedsKey.message', { provider: weatherProviderName(defaultProvider.id) })}
          </p>
          <button
            type="button"
            onClick={() => onChange({ provider: 'open-meteo' })}
            className="text-xs font-medium px-2.5 py-1 rounded-md text-hs-text-primary bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
          >
            {t('settings.weatherPage.defaultNeedsKey.useOpenMeteo')}
          </button>
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
              onSecretSaved={refetch}
              onSetDefault={() => onChange({ provider: p.id })}
              lat={lat}
              lon={lon}
              units={units}
            />
          ))
        )}
      </div>

      {/* Rain radar server: the rain map reads from LibreWXR's public
          instance unless a household points the hub at its own copy. */}
      <div className="mt-8" data-field-id="weather.radarServer">
        <div className="text-[11px] font-semibold text-hs-text-faint uppercase tracking-wider mb-2.5">
          {t('settings.weatherPage.radar.heading')}
        </div>
        <div className="max-w-[480px]">
          <LabeledInput
            label={t('settings.weatherPage.radar.serverLabel')}
            type="url"
            value={radarServerUrl}
            placeholder={DEFAULT_RADAR_SERVER_URL}
            onChange={(v) => onChange({ radarServerUrl: v })}
          />
        </div>
        {radarServerInvalid ? (
          <p className="mt-1.5 text-xs text-hs-warning" data-testid="radar-server-invalid">
            {t('settings.weatherPage.radar.invalid')}
          </p>
        ) : (
          <p className="mt-1.5 max-w-[640px] text-xs text-hs-text-faint">
            {t('settings.weatherPage.radar.help')}
          </p>
        )}
      </div>
    </section>
  );
}
