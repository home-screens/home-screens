'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function HistoryConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; rotationIntervalMs?: number; accentColor?: string; showDividers?: boolean }>(mod, screenId);

  return (
    <>
      <Slider
        label="Cycle Events (seconds)"
        value={(c.rotationIntervalMs ?? 10000) / 1000}
        min={5}
        max={120}
        step={5}
        onChange={(v) => set({ rotationIntervalMs: v * 1000 })}
      />
      <Slider
        label="Refresh (minutes)"
        value={(c.refreshIntervalMs ?? 86400000) / 60000}
        min={5}
        max={1440}
        step={5}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
      <Toggle label="Show Dividers" checked={c.showDividers !== false} onChange={(v) => set({ showDividers: v })} />
      <AccentColorPicker
        value={c.accentColor ?? '#000000'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
