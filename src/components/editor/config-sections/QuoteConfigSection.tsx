'use client';

import RefreshIntervalSlider from './RefreshIntervalSlider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';
import ColorPicker from '@/components/ui/ColorPicker';
import { useTranslate } from '@/i18n';

export function QuoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; accentColor?: string }>(mod, screenId);

  return (
    <>
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="quote"
        fallbackMs={3_600_000}
        // The hub keeps one quote for an hour, so a shorter wait would only
        // ask for the same quote again.
        unit="minutes"
        min={60}
        max={1440}
        step={60}
      />
      <ColorPicker
        label={t('accentColorPicker.label')}
        swatches="accent-or-none"
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
