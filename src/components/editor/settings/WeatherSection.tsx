'use client';

import { useSecretStatus } from '@/hooks/useSecretStatus';
import { WEATHER_PROVIDERS } from './weather/providers';
import { weatherProviderName } from '@/lib/weather-provider-names';
import WeatherProviderCard from './weather/WeatherProviderCard';
import LabeledInput from '@/components/ui/LabeledInput';
import { DEFAULT_RADAR_SERVER_URL, normalizeRadarServerUrl } from '@/lib/radar-server';
import { useTranslate } from '@/i18n';
import { SettingsSectionHeading } from '@/components/editor/settings/shared/SettingsPanel';
import FieldHint from '@/components/ui/FieldHint';
import Notice from '@/components/ui/Notice';
import Button from '@/components/ui/Button';
import SegmentedControl from '@/components/ui/SegmentedControl';

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

      {/* Units, at the top of the section */}
      <div className="mb-6" data-field-id="weather.units">
        <SettingsSectionHeading>
          {t('settings.weatherPage.unitsLabel')}
        </SettingsSectionHeading>
        <SegmentedControl
          value={units}
          onChange={(next) => onChange({ units: next })}
          label={t('settings.weatherPage.unitsLabel')}
          fit="content"
          options={[
            { value: 'imperial', label: t('settings.weatherPage.imperialOption') },
            { value: 'metric', label: t('settings.weatherPage.metricOption') },
          ]}
        />
      </div>

      {/* Location warning */}
      {!hasLocation && (
        <Notice tone="warning" className="mb-6">{t('settings.weatherPage.locationWarning')}</Notice>
      )}

      {/* Default provider has no key: weather modules are blank until fixed */}
      {defaultNeedsKey && defaultProvider && (
        <Notice
          tone="warning"
          className="mb-6"
          testId="weather-default-needs-key"
          action={
            <Button size="sm" variant="warning" onClick={() => onChange({ provider: 'open-meteo' })}>
              {t('settings.weatherPage.defaultNeedsKey.useOpenMeteo')}
            </Button>
          }
        >
          {t('settings.weatherPage.defaultNeedsKey.message', { provider: weatherProviderName(defaultProvider.id) })}
        </Notice>
      )}

      {/* Providers */}
      <div>
        <SettingsSectionHeading>
          {t('settings.weatherPage.providersLabel')}
        </SettingsSectionHeading>
        {loading ? (
          <FieldHint>{t('settings.weatherPage.loadingProviderStatus')}</FieldHint>
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
        <SettingsSectionHeading>
          {t('settings.weatherPage.radar.heading')}
        </SettingsSectionHeading>
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
          <p className="mt-1.5 text-xs text-hs-warning-ink" data-testid="radar-server-invalid">
            {t('settings.weatherPage.radar.invalid')}
          </p>
        ) : (
          <FieldHint className="mt-1.5 max-w-[640px]">
            {t('settings.weatherPage.radar.help')}
          </FieldHint>
        )}
      </div>
    </section>
  );
}
