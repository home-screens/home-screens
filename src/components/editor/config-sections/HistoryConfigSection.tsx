'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';

export function HistoryConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; rotationIntervalMs?: number; accentColor?: string; showDividers?: boolean; sourceMuffinLabs?: boolean; sourceWikipedia?: boolean }>(mod, screenId);

  return (
    <>
      <Slider
        label={t('configSections.history.cycleEventsSeconds')}
        value={(c.rotationIntervalMs ?? 10000) / 1000}
        min={5}
        max={120}
        step={5}
        onChange={(v) => set({ rotationIntervalMs: v * 1000 })}
      />
      <Slider
        label={t('configSections.history.refreshMinutes')}
        value={(c.refreshIntervalMs ?? 86400000) / 60000}
        min={5}
        max={1440}
        step={5}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
      <Toggle label={t('configSections.history.showDividers')} checked={c.showDividers !== false} onChange={(v) => set({ showDividers: v })} />
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
      <Toggle label={t('configSections.history.sourceWikipedia')} checked={c.sourceWikipedia !== false} onChange={(v) => set({ sourceWikipedia: v })} />
      <Toggle label={t('configSections.history.sourceMuffinLabs')} checked={c.sourceMuffinLabs !== false} onChange={(v) => set({ sourceMuffinLabs: v })} />
    </>
  );
}
