'use client';

import Toggle from '@/components/ui/Toggle';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function YearProgressConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ showYear?: boolean; showMonth?: boolean; showWeek?: boolean; showDay?: boolean; showPercentage?: boolean; accentColor?: string }>(mod, screenId);
  const t = useTranslate('editor');

  return (
    <>
      <Toggle label={t('configSections.year-progress.showYear')} checked={c.showYear !== false} onChange={(v) => set({ showYear: v })} />
      <Toggle label={t('configSections.year-progress.showMonth')} checked={c.showMonth !== false} onChange={(v) => set({ showMonth: v })} />
      <Toggle label={t('configSections.year-progress.showWeek')} checked={c.showWeek !== false} onChange={(v) => set({ showWeek: v })} />
      <Toggle label={t('configSections.year-progress.showDay')} checked={c.showDay !== false} onChange={(v) => set({ showDay: v })} />
      <Toggle label={t('configSections.year-progress.showPercentage')} checked={c.showPercentage !== false} onChange={(v) => set({ showPercentage: v })} />
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
