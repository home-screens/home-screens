'use client';

import { useEffect, useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEditorStore } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { formatCoords } from '@/components/modules/weather/location-label';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, WeatherConfig, WeatherView, WeatherIconSet, WeatherProviderOption } from '@/types/config';
import { settingsPath } from '@/lib/settings-route';
import { WEATHER_PROVIDERS } from '@/components/editor/settings/weather/providers';

/** Providers that cannot run without an API key, from the one provider table. */
const KEYED_PROVIDER_IDS: ReadonlySet<string> = new Set(
  WEATHER_PROVIDERS.filter((p) => p.secretKey !== null).map((p) => p.id),
);

// Provider capabilities — controls which toggles and views are visible
const PROVIDER_CAPS: Record<string, { minutely?: boolean; alerts?: boolean; pressure?: boolean; visibility?: boolean; dewPoint?: boolean; uv?: boolean }> = {
  openweathermap: {},
  weatherapi: { uv: true },
  pirateweather: { minutely: true, alerts: true, uv: true, pressure: true, visibility: true, dewPoint: true },
  noaa: { alerts: true, pressure: true, visibility: true, dewPoint: true },
  'open-meteo': { pressure: true, dewPoint: true, uv: true },
  yr: { pressure: true },
  smhi: { pressure: true },
  // Met Office was missing entirely, so the editor reported it as having no
  // optional fields even though the provider emits all of these.
  metoffice: { pressure: true, dewPoint: true, uv: true },
  envcanada: {},
};

// Which provider capability a view requires (omit = available for all providers)
const VIEW_REQUIRES: Partial<Record<WeatherView, 'minutely' | 'alerts'>> = {
  precipitation: 'minutely',
  alerts: 'alerts',
};

export function WeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const ICON_SETS: { value: WeatherIconSet; label: string }[] = [
    { value: 'outline', label: t('configSections.weather.iconSets.outline') },
    { value: 'color', label: t('configSections.weather.iconSets.color') },
  ];

  const ALL_WEATHER_VIEWS: { value: WeatherView; label: string }[] = [
    { value: 'current', label: t('configSections.weather.views.current') },
    { value: 'hourly', label: t('configSections.weather.views.hourly') },
    { value: 'daily', label: t('configSections.weather.views.daily') },
    { value: 'combined', label: t('configSections.weather.views.combined') },
    { value: 'compact', label: t('configSections.weather.views.compact') },
    { value: 'table', label: t('configSections.weather.views.table') },
    { value: 'precipitation', label: t('configSections.weather.views.precipitation') },
    { value: 'alerts', label: t('configSections.weather.views.alerts') },
  ];
  const { config: c, set } = useModuleConfig<Partial<WeatherConfig>>(mod, screenId);

  const globalProvider = useEditorStore((s) => s.config?.settings?.weather?.provider);
  const settings = useEditorStore((s) => s.config?.settings);

  // What the module renders when the custom label is left empty — shown as the
  // input's placeholder so the box previews its own fallback.
  const location = getLocation(settings);
  const automaticLabel = settings?.locationName?.trim()
    || (location ? formatCoords(location.lat, location.lon) : '');

  const { status: secrets, loading: secretsLoading, error: secretsError, hasStatus } = useSecretStatus();
  const configuredProviders = useMemo<string[]>(() => {
    // Until a good status has landed, return [] and keep the picker hidden:
    // rendering the select without the saved keyed provider in its options
    // would misreport it and let a change event overwrite the real value.
    // A failed refetch after a good status keeps using that last snapshot.
    if (secretsLoading || (secretsError && !hasStatus)) return [];
    const providers: string[] = [];
    if (secrets.openweathermap_key) providers.push('openweathermap');
    if (secrets.weatherapi_key) providers.push('weatherapi');
    if (secrets.pirateweather_key) providers.push('pirateweather');
    if (secrets.metoffice_key) providers.push('metoffice');
    // The rest need no API key and are always available.
    providers.push('noaa', 'open-meteo', 'yr', 'smhi', 'envcanada');
    return providers;
  }, [secrets, secretsLoading, secretsError, hasStatus]);

  const effectiveProvider = (c.provider && c.provider !== 'global') ? c.provider : (globalProvider ?? 'openweathermap');
  const caps = PROVIDER_CAPS[effectiveProvider] ?? {};
  // A keyed provider with no key renders nothing but "No weather data" on the
  // wall, and nothing in the editor says why. Surface it here, next to the
  // module, with a link to where the key goes. Only judged once a real
  // secret status has landed, so a slow first fetch never flashes a warning.
  const apiKeyMissing = hasStatus && !secretsLoading
    && KEYED_PROVIDER_IDS.has(effectiveProvider)
    && !configuredProviders.includes(effectiveProvider);

  const availableViews = ALL_WEATHER_VIEWS.filter((v) => {
    const req = VIEW_REQUIRES[v.value];
    return !req || caps[req];
  });

  const view = c.view ?? 'hourly';

  // Auto-reset view if the current provider doesn't support it
  const viewReq = VIEW_REQUIRES[view];
  const viewIncompatible = !!(viewReq && !caps[viewReq]);
  useEffect(() => {
    if (viewIncompatible) set({ view: 'hourly' });
  }, [viewIncompatible, set]);

  const viewRequirement = VIEW_REQUIRES[view];
  const filteredProviders = viewRequirement
    ? configuredProviders.filter((p) => PROVIDER_CAPS[p]?.[viewRequirement])
    : configuredProviders;

  const showsHours = view === 'hourly' || view === 'combined';
  const showsDays = view === 'daily' || view === 'combined' || view === 'table';
  const showsCurrent = ['current', 'hourly', 'combined', 'compact'].includes(view);
  // Alerts and precipitation views have no configurable data toggles
  const showsStats = !['alerts', 'precipitation'].includes(view);

  return (
    <>
      {apiKeyMissing && (
        <div className="rounded-md border border-hs-warning/30 bg-hs-warning/10 px-3 py-2 text-xs" data-testid="weather-api-key-row">
          <p className="text-hs-text-body">{t('configSections.weather.apiKeyMissing')}</p>
          <a
            href={settingsPath({ kind: 'defaults', page: 'weather' })}
            className="mt-1 inline-block font-medium text-hs-accent hover:underline"
          >
            {t('configSections.weather.addApiKey')}
          </a>
        </div>
      )}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={availableViews}
      />
      {/* Outside the showsStats guard on purpose: the alerts and precipitation
          views want the place name most ("which area is this alert for?"). */}
      <Toggle
        label={t('configSections.weather.showLocation')}
        checked={!!c.showLocation}
        onChange={(v) => set({ showLocation: v })}
      />
      {c.showLocation && (
        <LabeledInput
          label={t('configSections.weather.locationLabel')}
          value={c.locationLabel ?? ''}
          onChange={(v) => set({ locationLabel: v })}
          placeholder={automaticLabel}
        />
      )}
      {view === 'alerts' && caps.alerts && (
        <Toggle label={t('configSections.weather.hideWhenNoAlerts')} checked={!!c.hideWhenNoAlerts} onChange={(v) => set({ hideWhenNoAlerts: v })} />
      )}
      {showsStats && (
        <LabeledSelect
          label={t('configSections.weather.iconStyle')}
          value={c.iconSet ?? 'color'}
          onChange={(v) => set({ iconSet: v })}
          options={ICON_SETS}
        />
      )}
      {filteredProviders.length > 0 && (
        <LabeledField label={t('configSections.weather.dataProvider')}>
          <select
            value={c.provider ?? 'global'}
            onChange={(e) => set({ provider: e.target.value as WeatherProviderOption })}
            className={INPUT_CLASS}
          >
            {!viewRequirement && <option value="global">{t('configSections.weather.providers.global')}</option>}
            {filteredProviders.includes('openweathermap') && (
              <option value="openweathermap">{t('configSections.weather.providers.openweathermap')}</option>
            )}
            {filteredProviders.includes('weatherapi') && (
              <option value="weatherapi">{t('configSections.weather.providers.weatherapi')}</option>
            )}
            {filteredProviders.includes('pirateweather') && (
              <option value="pirateweather">{t('configSections.weather.providers.pirateweather')}</option>
            )}
            {filteredProviders.includes('noaa') && (
              <option value="noaa">{t('configSections.weather.providers.noaa')}</option>
            )}
            {filteredProviders.includes('open-meteo') && (
              <option value="open-meteo">{t('configSections.weather.providers.openMeteo')}</option>
            )}
            {filteredProviders.includes('yr') && (
              <option value="yr">{t('configSections.weather.providers.yr')}</option>
            )}
            {filteredProviders.includes('smhi') && (
              <option value="smhi">{t('configSections.weather.providers.smhi')}</option>
            )}
            {filteredProviders.includes('metoffice') && (
              <option value="metoffice">{t('configSections.weather.providers.metoffice')}</option>
            )}
            {filteredProviders.includes('envcanada') && (
              <option value="envcanada">{t('configSections.weather.providers.envcanada')}</option>
            )}
          </select>
        </LabeledField>
      )}
      {showsHours && (
        <LabeledInput
          label={t('configSections.weather.hoursToShow')}
          type="number"
          value={c.hoursToShow ?? 8}
          onChange={(v) => set({ hoursToShow: Number(v) })}
        />
      )}
      {showsDays && (
        <LabeledInput
          label={t('configSections.weather.daysToShow')}
          type="number"
          value={c.daysToShow ?? 5}
          onChange={(v) => set({ daysToShow: Number(v) })}
        />
      )}
      {showsCurrent && (
        <Toggle label={t('configSections.weather.feelsLike')} checked={c.showFeelsLike !== false} onChange={(v) => set({ showFeelsLike: v })} />
      )}
      {showsDays && (
        <Toggle label={t('configSections.weather.highLow')} checked={c.showHighLow !== false} onChange={(v) => set({ showHighLow: v })} />
      )}
      {showsStats && (
        <>
          <Toggle label={t('configSections.weather.precipitation')} checked={c.showPrecipitation !== false} onChange={(v) => set({ showPrecipitation: v })} />
          {showsDays && (
            <Toggle label={t('configSections.weather.precipitationAmount')} checked={!!c.showPrecipAmount} onChange={(v) => set({ showPrecipAmount: v })} />
          )}
          <Toggle label={t('configSections.weather.humidity')} checked={!!c.showHumidity} onChange={(v) => set({ showHumidity: v })} />
          <Toggle label={t('configSections.weather.windSpeed')} checked={!!c.showWind} onChange={(v) => set({ showWind: v })} />
          {caps.pressure && (
            <Toggle label={t('configSections.weather.pressure')} checked={!!c.showPressure} onChange={(v) => set({ showPressure: v })} />
          )}
          {caps.visibility && (
            <Toggle label={t('configSections.weather.visibility')} checked={!!c.showVisibility} onChange={(v) => set({ showVisibility: v })} />
          )}
          {caps.dewPoint && (
            <Toggle label={t('configSections.weather.dewPoint')} checked={!!c.showDewPoint} onChange={(v) => set({ showDewPoint: v })} />
          )}
        </>
      )}
    </>
  );
}
