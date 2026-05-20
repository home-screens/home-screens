'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function MoonPhaseConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ showIllumination?: boolean; showMoonTimes?: boolean }>(mod, screenId);

  return (
    <>
      <Toggle label={t('configSections.moon-phase.showIllumination')} checked={c.showIllumination !== false} onChange={(v) => set({ showIllumination: v })} />
      <Toggle label={t('configSections.moon-phase.showMoonTimes')} checked={c.showMoonTimes !== false} onChange={(v) => set({ showMoonTimes: v })} />
      <p className="text-xs text-hs-text-faint">{t('configSections.moon-phase.locationHelp')}</p>
    </>
  );
}
