'use client';

import { useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import SectionHeading from '@/components/ui/SectionHeading';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { automaticLocationLabel } from '@/components/modules/weather/location-label';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, WeatherConfig, WeatherView, WeatherIconSet } from '@/types/config';
import { WeatherApiKeyMissingRow, WeatherSourceSelect, useModuleWeatherSource } from './WeatherSourceSelect';
import { weatherProviderCaps, type WeatherProviderCaps } from '@/lib/weather-providers';
import { ForecastDaysHint } from './ForecastDaysHint';
import { useForecastHoursSent } from '@/stores/preview-weather-store';

// Which provider capability a view requires (omit = available for all providers)
const VIEW_REQUIRES: Partial<Record<WeatherView, 'minutely' | 'alerts'>> = {
  precipitation: 'minutely',
  alerts: 'alerts',
};

/**
 * The settings each view reads, so the panel offers a toggle only where it
 * changes the wall. Built from what the view components read: a toggle shown
 * for a view that ignores it (Dew Point on Week ahead, Humidity on the written
 * forecast) is a control that does nothing.
 */
type Field =
  | 'icons' | 'hours' | 'days' | 'featuredDay' | 'relativeDays' | 'feelsLike' | 'highLow'
  | 'precipitation' | 'precipAmount' | 'humidity' | 'wind' | 'pressure' | 'visibility' | 'dewPoint'
  | 'uv' | 'sunTimes';
const STATION: readonly Field[] = ['precipitation', 'humidity', 'wind', 'pressure', 'visibility', 'dewPoint'];
const VIEW_FIELDS: Record<WeatherView, readonly Field[]> = {
  current: ['icons', 'feelsLike', ...STATION, 'uv', 'sunTimes'],
  hourly: ['icons', 'hours', 'feelsLike', 'precipitation', 'humidity', 'wind'],
  daily: ['icons', 'days', 'featuredDay', 'relativeDays', 'highLow', 'precipitation', 'precipAmount', 'humidity', 'wind'],
  combined: ['icons', 'hours', 'days', 'relativeDays', 'feelsLike', 'highLow', ...STATION, 'uv', 'sunTimes'],
  compact: ['icons', 'feelsLike', 'highLow', ...STATION, 'uv', 'sunTimes'],
  table: ['icons', 'days', 'relativeDays', 'highLow', 'precipitation', 'precipAmount', 'humidity', 'wind'],
  precipitation: [],
  alerts: [],
  ribbon: ['hours'],
  week: ['icons', 'days', 'relativeDays', 'highLow', 'precipitation', 'humidity', 'wind'],
  timeline: ['icons', 'hours'],
  stats: [],
  sun: [],
  narrative: ['icons', 'days', 'relativeDays', 'highLow'],
};

/**
 * The hours field's ceiling while the preview has not yet said how many hours
 * the module's source sends. Most sources send two days; once the real count
 * lands (48 for Pirate Weather, 155 for NOAA) the field caps there instead.
 * A fixed 36 here refused the 48 the wall could draw and told the household
 * no source went further.
 */
const FALLBACK_MAX_HOURS = 48;
/** No source sends more than a week of days; every provider trims to seven. */
const MAX_DAYS = 7;

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
    // The Full-Screen Weather module's pieces, one option each.
    { value: 'ribbon', label: t('configSections.weather.views.ribbon') },
    { value: 'week', label: t('configSections.weather.views.week') },
    { value: 'timeline', label: t('configSections.weather.views.timeline') },
    { value: 'stats', label: t('configSections.weather.views.stats') },
    { value: 'sun', label: t('configSections.weather.views.sun') },
    { value: 'narrative', label: t('configSections.weather.views.narrative') },
  ];
  const { config: c, set } = useModuleConfig<Partial<WeatherConfig>>(mod, screenId);

  // What the module renders when the custom label is left empty — shown as the
  // input's placeholder so the box previews its own fallback.
  const automaticLabel = useEditorStore((s) => automaticLocationLabel(s.config?.settings));

  const { followsHousehold, effectiveProvider, caps, configuredProviders, apiKeyMissing } = useModuleWeatherSource(c.provider);
  const hoursSent = useForecastHoursSent(effectiveProvider);
  const maxHours = hoursSent != null && hoursSent > 0 ? hoursSent : FALLBACK_MAX_HOURS;

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
    ? configuredProviders.filter((p) => weatherProviderCaps(p)[viewRequirement])
    : configuredProviders;

  const has = (field: Field) => VIEW_FIELDS[view].includes(field);
  // Icon style applies wherever a condition icon is drawn.
  const showsIcons = has('icons');
  // The "What shows" group only draws its heading when the view has at
  // least one toggle under it; the capability-gated ones count only when
  // the source sends that field.
  const CAP_GATED: Partial<Record<Field, keyof WeatherProviderCaps>> = {
    feelsLike: 'feelsLike', precipAmount: 'precipAmount',
    pressure: 'pressure', visibility: 'visibility', dewPoint: 'dewPoint', uv: 'uv',
  };
  const SHOW_FIELDS: readonly Field[] = [
    'featuredDay', 'relativeDays', 'feelsLike', 'highLow', 'precipitation', 'precipAmount',
    'humidity', 'wind', 'pressure', 'visibility', 'dewPoint', 'uv', 'sunTimes',
  ];
  const showsAnyToggle = SHOW_FIELDS.some((f) => {
    const cap = CAP_GATED[f];
    return has(f) && (!cap || caps[cap]);
  });
  const hasSourceGroup = filteredProviders.length > 0 || has('hours') || has('days');

  return (
    <>
      {apiKeyMissing && <WeatherApiKeyMissingRow />}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={availableViews}
      />
      {/* Named groups, because the panel is long enough that a hint between
          two toggles reads as one more row: source, look, then what shows. */}
      {hasSourceGroup && <SectionHeading>{t('configSections.weather.sections.source')}</SectionHeading>}
      <WeatherSourceSelect
        value={c.provider ?? 'global'}
        onChange={(provider) => set({ provider })}
        providers={filteredProviders}
        allowGlobal={!viewRequirement}
      />
      {has('hours') && (
        <>
          <LabeledInput
            label={t('configSections.weather.hoursToShow')}
            type="number"
            min={2}
            max={maxHours}
            value={c.hoursToShow ?? 8}
            onChange={(v) => set({ hoursToShow: Math.min(maxHours, Number(v)) })}
          />
          <ForecastDaysHint
            provider={effectiveProvider}
            requested={c.hoursToShow ?? 8}
            unit="hours"
            followsHousehold={followsHousehold}
            onPickOpenMeteo={() => set({ provider: 'open-meteo' })}
          />
        </>
      )}
      {has('days') && (
        <>
          <LabeledInput
            label={t('configSections.weather.daysToShow')}
            type="number"
            min={1}
            max={MAX_DAYS}
            value={c.daysToShow ?? 5}
            onChange={(v) => set({ daysToShow: Math.min(MAX_DAYS, Number(v)) })}
          />
          <ForecastDaysHint
            provider={effectiveProvider}
            requested={c.daysToShow ?? 5}
            followsHousehold={followsHousehold}
            onPickOpenMeteo={() => set({ provider: 'open-meteo' })}
          />
        </>
      )}
      <SectionHeading>{t('configSections.weather.sections.look')}</SectionHeading>
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
      {showsIcons && (
        <LabeledSelect
          label={t('configSections.weather.iconStyle')}
          value={c.iconSet ?? 'color'}
          onChange={(v) => set({ iconSet: v })}
          options={ICON_SETS}
        />
      )}
      {showsAnyToggle && <SectionHeading>{t('configSections.weather.sections.show')}</SectionHeading>}
      {has('featuredDay') && (
        <Toggle label={t('configSections.weather.showFeaturedDay')} checked={c.showFeaturedDay !== false} onChange={(v) => set({ showFeaturedDay: v })} />
      )}
      {has('relativeDays') && (
        <Toggle label={t('configSections.weather.showRelativeDayLabels')} checked={c.showRelativeDayLabels !== false} onChange={(v) => set({ showRelativeDayLabels: v })} />
      )}
      {has('feelsLike') && caps.feelsLike && (
        <Toggle label={t('configSections.weather.feelsLike')} checked={c.showFeelsLike !== false} onChange={(v) => set({ showFeelsLike: v })} />
      )}
      {has('highLow') && (
        <Toggle label={t('configSections.weather.highLow')} checked={c.showHighLow !== false} onChange={(v) => set({ showHighLow: v })} />
      )}
      {has('precipitation') && (
        <Toggle label={t('configSections.weather.precipitation')} checked={c.showPrecipitation !== false} onChange={(v) => set({ showPrecipitation: v })} />
      )}
      {has('precipAmount') && caps.precipAmount && (
        <Toggle label={t('configSections.weather.precipitationAmount')} checked={!!c.showPrecipAmount} onChange={(v) => set({ showPrecipAmount: v })} />
      )}
      {has('humidity') && (
        <Toggle label={t('configSections.weather.humidity')} checked={!!c.showHumidity} onChange={(v) => set({ showHumidity: v })} />
      )}
      {has('wind') && (
        <Toggle label={t('configSections.weather.windSpeed')} checked={!!c.showWind} onChange={(v) => set({ showWind: v })} />
      )}
      {has('pressure') && caps.pressure && (
        <Toggle label={t('configSections.weather.pressure')} checked={!!c.showPressure} onChange={(v) => set({ showPressure: v })} />
      )}
      {has('visibility') && caps.visibility && (
        <Toggle label={t('configSections.weather.visibility')} checked={!!c.showVisibility} onChange={(v) => set({ showVisibility: v })} />
      )}
      {has('dewPoint') && caps.dewPoint && (
        <Toggle label={t('configSections.weather.dewPoint')} checked={!!c.showDewPoint} onChange={(v) => set({ showDewPoint: v })} />
      )}
      {has('uv') && caps.uv && (
        <Toggle label={t('configSections.weather.uvIndex')} checked={!!c.showUV} onChange={(v) => set({ showUV: v })} />
      )}
      {has('sunTimes') && (
        <Toggle label={t('configSections.weather.sunTimes')} checked={!!c.showSunTimes} onChange={(v) => set({ showSunTimes: v })} />
      )}
    </>
  );
}
