'use client';

import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import ColorPicker from '@/components/ui/ColorPicker';

export function WordOfDayConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ accentColor?: string; showDividers?: boolean }>(mod, screenId);
  const t = useTranslate('editor');

  return (
    <>
      <Toggle label={t('configSections.word-of-day.showDividers')} checked={c.showDividers !== false} onChange={(v) => set({ showDividers: v })} />
      <ColorPicker
        label={t('accentColorPicker.label')}
        swatches="accent-or-none"
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
