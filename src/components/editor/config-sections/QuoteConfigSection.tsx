'use client';

import RefreshIntervalSlider from './RefreshIntervalSlider';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function QuoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
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
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
