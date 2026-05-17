'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function DadJokeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; accentColor?: string; showDividers?: boolean }>(mod, screenId);

  return (
    <>
      <Slider
        label={t('common.refreshSeconds')}
        value={(c.refreshIntervalMs ?? 60000) / 1000}
        min={30}
        max={3600}
        step={30}
        onChange={(v) => set({ refreshIntervalMs: v * 1000 })}
      />
      <Toggle label={t('configSections.dad-joke.showDividers')} checked={c.showDividers !== false} onChange={(v) => set({ showDividers: v })} />
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
