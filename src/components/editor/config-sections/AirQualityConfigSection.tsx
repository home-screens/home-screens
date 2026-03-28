'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function AirQualityConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ showAQI?: boolean; showPollutants?: boolean; refreshIntervalMs?: number }>(mod, screenId);

  return (
    <>
      <Toggle label="Show AQI" checked={c.showAQI !== false} onChange={(v) => set({ showAQI: v })} />
      <Toggle label="Show Pollutants" checked={!!c.showPollutants} onChange={(v) => set({ showPollutants: v })} />
      <Slider
        label="Refresh (minutes)"
        value={(c.refreshIntervalMs ?? 600000) / 60000}
        min={5}
        max={120}
        step={5}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
    </>
  );
}
