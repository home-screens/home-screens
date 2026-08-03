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
import { useTranslate } from '@/i18n';
import type { ModuleInstance, WeatherView, WeatherIconSet, WeatherProviderOption } from '@/types/config';

// Provider capabilities — controls which toggles and views are visible
const PROVIDER_CAPS: Record<string, { minutely?: boolean; alerts?: boolean; pressure?: boolean; visibility?: boolean; dewPoint?: boolean }> = {
  openweathermap: {},
  weatherapi: {},
  pirateweather: { minutely: true, alerts: true },
  noaa: { alerts: true, pressure: true, visibility: true, dewPoint: true },
  'open-meteo': { pressure: true, dewPoint: true },
  yr: { pressure: true },
  smhi: { pressure: true },
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
  const { config: c, set } = useModuleConfig<{
    view?: WeatherView;
    iconSet?: WeatherIconSet;
    provider?: WeatherProviderOption;
    hoursToShow?: number;
    showFeelsLike?: boolean;
    daysToShow?: number;
    showHighLow?: boolean;
    showPrecipitation?: boolean;
    showPrecipAmount?: boolean;
    showHumidity?: boolean;
    showWind?: boolean;
    showPressure?: boolean;
    showVisibility?: boolean;
    showDewPoint?: boolean;
    hideWhenNoAlerts?: boolean;
  }>(mod, screenId);

  const globalProvider = useEditorStore((s) => s.config?.settings?.weather?.provider);

  const { status: secrets, loading: secretsLoading } = useSecretStatus();
  const configuredProviders = useMemo<string[]>(() => {
    if (secretsLoading) return [];
    // On a failed status fetch `secrets` is {}, so the keyed providers drop
    // out but the keyless ones below stay pickable.
    const providers: string[] = [];
    if (secrets.openweathermap_key) providers.push('openweathermap');
    if (secrets.weatherapi_key) providers.push('weatherapi');
    if (secrets.pirateweather_key) providers.push('pirateweather');
    if (secrets.metoffice_key) providers.push('metoffice');
    // The rest need no API key and are always available.
    providers.push('noaa', 'open-meteo', 'yr', 'smhi', 'envcanada');
    return providers;
  }, [secrets, secretsLoading]);

  // Resolve effective provider for capability gating
  const effectiveProvider = (c.provider && c.provider !== 'global') ? c.provider : (globalProvider ?? 'openweathermap');
  const caps = PROVIDER_CAPS[effectiveProvider] ?? {};

  // Filter views to only those supported by the current provider
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

  // Filter providers: when a capability-specific view is selected, only show compatible providers
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
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={availableViews}
      />
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
