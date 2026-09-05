'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledInput from '@/components/ui/LabeledInput';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, FullscreenWeatherConfig } from '@/types/config';
import { clampDaysToShow } from '@/components/modules/fullscreen-weather/weather-view-utils';

type Config = Partial<FullscreenWeatherConfig>;

export function FullscreenWeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const typographySizeOptions = useTypographySizeOptions();
  const view = c.view ?? 'panorama';

  const VIEWS = [
    { value: 'panorama', label: t('configSections.fullscreen-weather.viewPanorama') },
    { value: 'strip', label: t('configSections.fullscreen-weather.viewStrip') },
    { value: 'almanac', label: t('configSections.fullscreen-weather.viewAlmanac') },
    { value: 'ambient', label: t('configSections.fullscreen-weather.viewAmbient') },
    { value: 'week', label: t('configSections.fullscreen-weather.viewWeek') },
    { value: 'hourly', label: t('configSections.fullscreen-weather.viewHourly') },
  ] as const;

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-weather.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-weather.densitySnug') },
  ] as const;

  const SKY_OPTIONS = [
    { value: 'auto', label: t('configSections.fullscreen-weather.skyAuto') },
    { value: 'off', label: t('configSections.fullscreen-weather.skyOff') },
  ] as const;

  return (
    <>
      <FullscreenThemeSelect
        value={c.theme}
        onChange={(theme) => set({ theme })}
        defaultOptionKey="configSections.fullscreen-weather.themeDefault"
      />

      <LabeledSelect
        label={t('configSections.fullscreen-weather.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

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

      {/* Sky layer */}
      <LabeledSelect
        label={t('configSections.fullscreen-weather.skyLayer')}
        value={c.skyLayer ?? 'auto'}
        onChange={(v) => set({ skyLayer: v })}
        options={SKY_OPTIONS}
      />
      <Toggle
        label={t('configSections.fullscreen-weather.animateConditions')}
        checked={c.animateConditions !== false}
        onChange={(v) => set({ animateConditions: v })}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-weather.animateConditionsHint')}
      </p>

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

      {view === 'panorama' && (
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

      {(view === 'panorama' || view === 'week') && (
        <LabeledInput
          label={t('configSections.fullscreen-weather.daysToShow')}
          type="number"
          value={c.daysToShow ?? 7}
          onChange={(v) => set({ daysToShow: clampDaysToShow(Number(v) || undefined) })}
        />
      )}

      <LabeledInput
        label={t('configSections.fullscreen-weather.locationLabel')}
        value={c.locationLabel ?? ''}
        onChange={(v) => set({ locationLabel: v })}
      />

      {/* An empty accentColor means "follow the weather": amber for clear,
          blue for rain, violet for storms. The picker can only ever write a
          colour, so the way back to empty has to be its own control. */}
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
  );
}
