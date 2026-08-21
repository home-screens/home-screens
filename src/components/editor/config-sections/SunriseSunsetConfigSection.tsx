'use client';

import Toggle from '@/components/ui/Toggle';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, SunriseSunsetTheme, SunriseSunsetView } from '@/types/config';

type SunriseSunsetConfigType = {
  view?: SunriseSunsetView;
  showDayLength?: boolean;
  showGoldenHour?: boolean;
  showAstroDark?: boolean;
  theme?: SunriseSunsetTheme;
};

export function SunriseSunsetConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<SunriseSunsetConfigType>(mod, screenId);
  const t = useTranslate('editor');

  const VIEWS: { value: SunriseSunsetView; label: string }[] = [
    { value: 'default', label: t('configSections.sunrise-sunset.views.default') },
    { value: 'arc', label: t('configSections.sunrise-sunset.views.arc') },
    { value: 'circle', label: t('configSections.sunrise-sunset.views.circle') },
  ];

  const THEMES: { value: SunriseSunsetTheme; label: string }[] = [
    { value: 'simple', label: t('configSections.sunrise-sunset.themeSimple') },
    { value: 'sky', label: t('configSections.sunrise-sunset.themeSky') },
  ];

  // The sky theme always shows astro dark (the module forces it on), so the toggle
  // has no effect while it is selected — hide it instead of showing a dead control.
  const isCircle = (c.view ?? 'default') === 'circle';
  const skySelected = isCircle && (c.theme ?? 'simple') === 'sky';

  return (
    <>
      <ViewSelect
        value={c.view ?? 'default'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />
      {isCircle && (
        <LabeledSelect
          label={t('configSections.sunrise-sunset.theme')}
          value={c.theme ?? 'simple'}
          onChange={(v) => set({ theme: v })}
          options={THEMES}
        />
      )}
      <Toggle label={t('configSections.sunrise-sunset.showDayLength')} checked={c.showDayLength !== false} onChange={(v) => set({ showDayLength: v })} />
      <Toggle label={t('configSections.sunrise-sunset.showGoldenHour')} checked={!!c.showGoldenHour} onChange={(v) => set({ showGoldenHour: v })} />
      {!skySelected && (
        <Toggle label={t('configSections.sunrise-sunset.showAstroDark')} checked={!!c.showAstroDark} onChange={(v) => set({ showAstroDark: v })} />
      )}
      <p className="text-xs text-hs-text-faint">{t('configSections.sunrise-sunset.locationHint')}</p>
    </>
  );
}
