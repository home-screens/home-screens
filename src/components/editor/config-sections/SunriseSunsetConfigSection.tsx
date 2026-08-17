'use client';

import Toggle from '@/components/ui/Toggle';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, SunriseSunsetView } from '@/types/config';

type SunriseSunsetConfigType = {
  view?: SunriseSunsetView;
  showDayLength?: boolean;
  showGoldenHour?: boolean;
  showAstroDark?: boolean;
};

export function SunriseSunsetConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<SunriseSunsetConfigType>(mod, screenId);
  const t = useTranslate('editor');

  const VIEWS: { value: SunriseSunsetView; label: string }[] = [
    { value: 'default', label: t('configSections.sunrise-sunset.views.default') },
    { value: 'arc', label: t('configSections.sunrise-sunset.views.arc') },
    { value: 'circle', label: t('configSections.sunrise-sunset.views.circle') },
  ];

  return (
    <>
      <ViewSelect
        value={c.view ?? 'default'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />
      <Toggle label={t('configSections.sunrise-sunset.showDayLength')} checked={c.showDayLength !== false} onChange={(v) => set({ showDayLength: v })} />
      <Toggle label={t('configSections.sunrise-sunset.showGoldenHour')} checked={!!c.showGoldenHour} onChange={(v) => set({ showGoldenHour: v })} />
      <Toggle label={t('configSections.sunrise-sunset.showAstroDark')} checked={!!c.showAstroDark} onChange={(v) => set({ showAstroDark: v })} />
      <p className="text-xs text-hs-text-faint">{t('configSections.sunrise-sunset.locationHint')}</p>
    </>
  );
}
