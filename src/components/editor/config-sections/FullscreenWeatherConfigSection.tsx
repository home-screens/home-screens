'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledInput from '@/components/ui/LabeledInput';
import SectionHeading from '@/components/ui/SectionHeading';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, FullscreenWeatherConfig } from '@/types/config';
import { clampDaysToShow } from '@/components/modules/fullscreen-weather/weather-view-utils';
import { resolveWeatherCards } from '@/lib/fullscreen-weather-cards';
import { WeatherCardsList } from './WeatherCardsList';
import { WeatherApiKeyMissingRow, WeatherSourceSelect, useModuleWeatherSource } from './WeatherSourceSelect';
import { automaticLocationLabel } from '@/components/modules/weather/location-label';
import { ForecastDaysHint } from './ForecastDaysHint';
import { useDensityOptions } from './option-hooks';

type Config = Partial<FullscreenWeatherConfig>;

export function FullscreenWeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const typographySizeOptions = useTypographySizeOptions();
  const view = c.view ?? 'panorama';

  // The same source picker as the Weather module. Absent or `global`
  // follows the household source, which is what every module did before
  // the picker existed.
  const { followsHousehold, effectiveProvider, caps, configuredProviders, apiKeyMissing } = useModuleWeatherSource(c.provider);
  // What the wall prints when the label is left empty, shown as the box's
  // placeholder so it previews its own fallback.
  const automaticLabel = useEditorStore((s) => automaticLocationLabel(s.config?.settings));
  const daysToShow = clampDaysToShow(c.daysToShow);

  const VIEWS = [
    { value: 'panorama', label: t('configSections.fullscreen-weather.viewPanorama') },
    { value: 'strip', label: t('configSections.fullscreen-weather.viewStrip') },
    { value: 'almanac', label: t('configSections.fullscreen-weather.viewAlmanac') },
    { value: 'ambient', label: t('configSections.fullscreen-weather.viewAmbient') },
    { value: 'week', label: t('configSections.fullscreen-weather.viewWeek') },
    { value: 'hourly', label: t('configSections.fullscreen-weather.viewHourly') },
    { value: 'forecast', label: t('configSections.fullscreen-weather.viewForecast') },
    { value: 'conditions', label: t('configSections.fullscreen-weather.viewConditions') },
  ] as const;
  const cardView = view === 'forecast' || view === 'conditions';

  const DENSITY_OPTIONS = useDensityOptions();

  const SKY_OPTIONS = [
    { value: 'living', label: t('configSections.fullscreen-weather.skyLiving') },
    { value: 'still', label: t('configSections.fullscreen-weather.skyStill') },
    { value: 'off', label: t('configSections.fullscreen-weather.skyOff') },
  ] as const;

  const MAP_STYLE_OPTIONS = [
    { value: 'light', label: t('configSections.fullscreen-weather.mapStyleLight') },
    { value: 'standard', label: t('configSections.fullscreen-weather.mapStyleStandard') },
    { value: 'dark', label: t('configSections.fullscreen-weather.mapStyleDark') },
  ] as const;

  // The panel is long enough that a hint between two toggles reads as one
  // more row, so the controls sit under named groups: the view first, since
  // it decides which groups exist, then source, look, what shows, and the
  // view's own parts.
  return (
    <>
      {apiKeyMissing && <WeatherApiKeyMissingRow />}
      <LabeledSelect
        label={t('configSections.fullscreen-weather.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      <SectionHeading>{t('configSections.weather.sections.source')}</SectionHeading>
      <WeatherSourceSelect
        value={c.provider ?? 'global'}
        onChange={(provider) => set({ provider })}
        providers={configuredProviders}
      />
      <LabeledInput
        label={t('configSections.fullscreen-weather.locationLabel')}
        value={c.locationLabel ?? ''}
        onChange={(v) => set({ locationLabel: v })}
        placeholder={automaticLabel}
      />
      {/* The days field lives with the source, so the "only sends 3 days"
          warning sits under the picker that fixes it. */}
      {(view === 'panorama' || view === 'strip' || view === 'week' || view === 'forecast') && (
        <>
          <LabeledInput
            label={t('configSections.fullscreen-weather.daysToShow')}
            type="number"
            min={3}
            max={7}
            value={c.daysToShow ?? 7}
            onChange={(v) => set({ daysToShow: clampDaysToShow(Number(v) || undefined) })}
          />
          <ForecastDaysHint
            provider={effectiveProvider}
            requested={daysToShow}
            followsHousehold={followsHousehold}
            onPickOpenMeteo={() => set({ provider: 'open-meteo' })}
          />
        </>
      )}

      <SectionHeading>{t('configSections.weather.sections.look')}</SectionHeading>
      {/* The living sky paints its own colours over the theme (white text,
          translucent cards), so the theme picker only shows when a theme
          would be seen: Still and Off. */}
      {(c.skyLayer ?? 'living') !== 'living' && (
        <FullscreenThemeSelect
          value={c.theme}
          onChange={(theme) => set({ theme })}
          defaultOptionKey="configSections.fullscreen-weather.themeDefault"
        />
      )}

      <LabeledSelect
        label={t('common.density')}
        value={c.density ?? 'snug'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.fullscreen-weather.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* Sky */}
      <LabeledSelect
        label={t('configSections.fullscreen-weather.skyLayer')}
        value={c.skyLayer ?? 'living'}
        onChange={(v) => set({ skyLayer: v })}
        options={SKY_OPTIONS}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-weather.skyLayerHint')}
      </p>

      <SectionHeading>{t('configSections.weather.sections.show')}</SectionHeading>
      <Toggle
        label={t('configSections.fullscreen-weather.showTime')}
        checked={c.showTime !== false}
        onChange={(v) => set({ showTime: v })}
      />

      <Toggle
        label={t('configSections.fullscreen-weather.showAlerts')}
        checked={c.showAlerts !== false}
        onChange={(v) => set({ showAlerts: v })}
      />
      {/* Only two sources send warnings. On any other the switch is on and
          the wall never shows one, so say so here instead of letting a
          household believe the wall will warn them. */}
      {!caps.alerts && (
        <p className="text-[11px] text-hs-text-faint leading-relaxed" data-testid="fsw-alerts-hint">
          {t('configSections.fullscreen-weather.showAlertsHint')}
        </p>
      )}

      {/* Wide strip is Panorama's parts side by side and reads the same three flags. */}
      {(view === 'panorama' || view === 'strip') && (
        <>
          <Toggle
            label={t('configSections.fullscreen-weather.showRibbon')}
            checked={c.showRibbon !== false}
            onChange={(v) => set({ showRibbon: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-weather.showStatRail')}
            checked={c.showStatRail !== false}
            onChange={(v) => set({ showStatRail: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-weather.showNowcast')}
            checked={c.showNowcast !== false}
            onChange={(v) => set({ showNowcast: v })}
          />
          {/* Only Pirate Weather returns minute-by-minute data today, so the
              strip stays hidden on every other source. Say so here rather than
              rendering an empty panel on the wall. */}
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {t('configSections.fullscreen-weather.showNowcastHint')}
          </p>
        </>
      )}

      {cardView && (
        <>
          {view === 'forecast' && (
            <SectionHeading>{t('configSections.weather.sections.map')}</SectionHeading>
          )}
          {view === 'forecast' && (
            <Toggle
              label={t('configSections.fullscreen-weather.showMap')}
              checked={c.showMap !== false}
              onChange={(v) => set({ showMap: v })}
            />
          )}
          {c.showMap !== false && view === 'forecast' && (
            <>
              <LabeledInput
                label={t('configSections.fullscreen-weather.mapZoom')}
                type="number"
                value={c.mapZoom ?? 6}
                onChange={(v) => set({ mapZoom: Math.max(1, Math.min(12, Number(v) || 6)) })}
              />
              <LabeledSelect
                label={t('configSections.fullscreen-weather.mapStyle')}
                value={c.mapStyle ?? 'light'}
                onChange={(v) => set({ mapStyle: v })}
                options={MAP_STYLE_OPTIONS}
              />
              <Toggle
                label={t('configSections.fullscreen-weather.mapAnimate')}
                checked={c.mapAnimate !== false}
                onChange={(v) => set({ mapAnimate: v })}
              />
            </>
          )}
          <SectionHeading>{t('configSections.weather.sections.cards')}</SectionHeading>
          <WeatherCardsList value={resolveWeatherCards(c)} onChange={(cards) => set({ cards })} view={view} />
        </>
      )}

      {/* An empty accentColor means "follow the weather": amber for clear,
          blue for rain, violet for storms. The picker can only ever write a
          colour, so the way back to empty has to be its own control. The
          Forecast and Conditions pages draw nothing with the accent, so they
          do not offer it. */}
      {!cardView && (
        <>
          <SectionHeading>{t('configSections.weather.sections.accent')}</SectionHeading>
          <Toggle
            label={t('configSections.fullscreen-weather.accentAuto')}
            checked={!c.accentColor}
            onChange={(auto) => set({ accentColor: auto ? '' : '#f59e0b' })}
          />
          {c.accentColor ? (
            <ColorPicker
              label={t('configSections.fullscreen-weather.accentColor')}
              value={c.accentColor}
              onChange={(v) => set({ accentColor: v })}
            />
          ) : null}
        </>
      )}
    </>
  );
}
