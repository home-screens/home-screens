'use client';

import RefreshIntervalSlider from './RefreshIntervalSlider';
import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import ColorPicker from '@/components/ui/ColorPicker';

export function DadJokeConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; accentColor?: string; showDividers?: boolean }>(mod, screenId);

  return (
    <>
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="dad-joke"
        fallbackMs={60_000}
        unit="seconds"
        min={30}
        max={3600}
        step={30}
      />
      <Toggle label={t('configSections.dad-joke.showDividers')} checked={c.showDividers !== false} onChange={(v) => set({ showDividers: v })} />
      <ColorPicker
        label={t('accentColorPicker.label')}
        swatches="accent-or-none"
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
