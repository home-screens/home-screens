'use client';

import Slider from '@/components/ui/Slider';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function QuoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; accentColor?: string }>(mod, screenId);

  return (
    <>
      <Slider
        label="Refresh (seconds)"
        value={(c.refreshIntervalMs ?? 300000) / 1000}
        min={30}
        max={3600}
        step={30}
        onChange={(v) => set({ refreshIntervalMs: v * 1000 })}
      />
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
