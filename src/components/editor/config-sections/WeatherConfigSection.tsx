'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import { editorFetch } from '@/lib/editor-fetch';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import type { ModuleInstance, WeatherView, WeatherIconSet, WeatherProviderOption } from '@/types/config';

const ICON_SETS: { value: WeatherIconSet; label: string }[] = [
  { value: 'outline', label: 'Outline' },
  { value: 'color', label: 'Color' },
];

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

const ALL_WEATHER_VIEWS: { value: WeatherView; label: string }[] = [
  { value: 'current', label: 'Current Only' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily Forecast' },
  { value: 'combined', label: 'Combined' },
  { value: 'compact', label: 'Compact' },
  { value: 'table', label: 'Table' },
  { value: 'precipitation', label: 'Precipitation' },
  { value: 'alerts', label: 'Weather Alerts' },
];

export function WeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
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

  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  useEffect(() => {
    async function check() {
      try {
        const res = await editorFetch('/api/secrets');
        if (res.ok) {
          const data: Record<string, boolean> = await res.json();
          const providers: string[] = [];
          if (data.openweathermap_key) providers.push('openweathermap');
          if (data.weatherapi_key) providers.push('weatherapi');
          if (data.pirateweather_key) providers.push('pirateweather');
          if (data.metoffice_key) providers.push('metoffice');
          providers.push('noaa'); // NOAA always available (no key needed)
          providers.push('open-meteo'); // Open-Meteo always available (no key needed)
          providers.push('yr'); // Yr.no always available (no key needed)
          providers.push('smhi'); // SMHI always available (no key needed)
          providers.push('envcanada'); // Environment Canada always available (no key needed)
          setConfiguredProviders(providers);
        }
      } catch { /* ignore */ }
    }
    check();
  }, []);

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
        <Toggle label="Hide When No Alerts" checked={!!c.hideWhenNoAlerts} onChange={(v) => set({ hideWhenNoAlerts: v })} />
      )}
      {showsStats && (
        <LabeledSelect
          label="Icon Style"
          value={c.iconSet ?? 'color'}
          onChange={(v) => set({ iconSet: v })}
          options={ICON_SETS}
        />
      )}
      {filteredProviders.length > 0 && (
        <LabeledField label="Data Provider">
          <select
            value={c.provider ?? 'global'}
            onChange={(e) => set({ provider: e.target.value as WeatherProviderOption })}
            className={INPUT_CLASS}
          >
            {!viewRequirement && <option value="global">Global Default</option>}
            {filteredProviders.includes('openweathermap') && (
              <option value="openweathermap">OpenWeatherMap</option>
            )}
            {filteredProviders.includes('weatherapi') && (
              <option value="weatherapi">WeatherAPI</option>
            )}
            {filteredProviders.includes('pirateweather') && (
              <option value="pirateweather">Pirate Weather</option>
            )}
            {filteredProviders.includes('noaa') && (
              <option value="noaa">NOAA / NWS (US only)</option>
            )}
            {filteredProviders.includes('open-meteo') && (
              <option value="open-meteo">Open-Meteo (free, global)</option>
            )}
            {filteredProviders.includes('yr') && (
              <option value="yr">Yr.no / MET Norway (free, global)</option>
            )}
            {filteredProviders.includes('smhi') && (
              <option value="smhi">SMHI (free, Nordic only)</option>
            )}
            {filteredProviders.includes('metoffice') && (
              <option value="metoffice">UK Met Office (UK focus)</option>
            )}
            {filteredProviders.includes('envcanada') && (
              <option value="envcanada">Environment Canada (Canada only)</option>
            )}
          </select>
        </LabeledField>
      )}
      {showsHours && (
        <LabeledInput
          label="Hours to Show"
          type="number"
          value={c.hoursToShow ?? 8}
          onChange={(v) => set({ hoursToShow: Number(v) })}
        />
      )}
      {showsDays && (
        <LabeledInput
          label="Days to Show"
          type="number"
          value={c.daysToShow ?? 5}
          onChange={(v) => set({ daysToShow: Number(v) })}
        />
      )}
      {showsCurrent && (
        <Toggle label="Feels Like" checked={c.showFeelsLike !== false} onChange={(v) => set({ showFeelsLike: v })} />
      )}
      {showsDays && (
        <Toggle label="High / Low" checked={c.showHighLow !== false} onChange={(v) => set({ showHighLow: v })} />
      )}
      {showsStats && (
        <>
          <Toggle label="Precipitation" checked={c.showPrecipitation !== false} onChange={(v) => set({ showPrecipitation: v })} />
          {showsDays && (
            <Toggle label="Precipitation Amount" checked={!!c.showPrecipAmount} onChange={(v) => set({ showPrecipAmount: v })} />
          )}
          <Toggle label="Humidity" checked={!!c.showHumidity} onChange={(v) => set({ showHumidity: v })} />
          <Toggle label="Wind Speed" checked={!!c.showWind} onChange={(v) => set({ showWind: v })} />
          {caps.pressure && (
            <Toggle label="Pressure" checked={!!c.showPressure} onChange={(v) => set({ showPressure: v })} />
          )}
          {caps.visibility && (
            <Toggle label="Visibility" checked={!!c.showVisibility} onChange={(v) => set({ showVisibility: v })} />
          )}
          {caps.dewPoint && (
            <Toggle label="Dew Point" checked={!!c.showDewPoint} onChange={(v) => set({ showDewPoint: v })} />
          )}
        </>
      )}
    </>
  );
}
