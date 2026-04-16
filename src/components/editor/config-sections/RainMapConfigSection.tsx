'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

const MAP_STYLE_OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'standard', label: 'Standard' },
] as const;

export function RainMapConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    latitude?: number;
    longitude?: number;
    zoom?: number;
    animationSpeedMs?: number;
    extraDelayLastFrameMs?: number;
    smooth?: boolean;
    showSnow?: boolean;
    opacity?: number;
    showTimestamp?: boolean;
    showTimeline?: boolean;
    refreshIntervalMs?: number;
    mapStyle?: string;
  }>(mod, screenId);

  return (
    <>
      <LabeledInput
        label="Latitude (0 = global)"
        type="number"
        step="0.01"
        value={c.latitude ?? 0}
        onChange={(v) => set({ latitude: Number(v) })}
      />
      <LabeledInput
        label="Longitude (0 = global)"
        type="number"
        step="0.01"
        value={c.longitude ?? 0}
        onChange={(v) => set({ longitude: Number(v) })}
      />
      <Slider label="Zoom" value={c.zoom ?? 6} min={1} max={12} step={1} onChange={(v) => set({ zoom: v })} />
      <Slider label="Animation Speed (ms)" value={c.animationSpeedMs ?? 500} min={200} max={2000} step={100} onChange={(v) => set({ animationSpeedMs: v })} />
      <Slider label="End Pause (ms)" value={c.extraDelayLastFrameMs ?? 2000} min={0} max={5000} step={500} onChange={(v) => set({ extraDelayLastFrameMs: v })} />
      <Slider label="Radar Opacity %" value={Math.round((c.opacity ?? 0.7) * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} />
      <Toggle label="Smooth Radar" checked={c.smooth !== false} onChange={(v) => set({ smooth: v })} />
      <Toggle label="Show Snow" checked={c.showSnow !== false} onChange={(v) => set({ showSnow: v })} />
      <Toggle label="Show Timestamp" checked={c.showTimestamp !== false} onChange={(v) => set({ showTimestamp: v })} />
      <Toggle label="Show Timeline" checked={c.showTimeline !== false} onChange={(v) => set({ showTimeline: v })} />
      <LabeledSelect
        label="Map Style"
        value={c.mapStyle ?? 'dark'}
        onChange={(v) => set({ mapStyle: v })}
        options={MAP_STYLE_OPTIONS}
      />
      <Slider label="Refresh (minutes)" value={(c.refreshIntervalMs ?? 600000) / 60000} min={5} max={30} step={5} onChange={(v) => set({ refreshIntervalMs: v * 60000 })} />
      <p className="text-xs text-hs-text-faint">Uses location from global settings when lat/lon are 0.</p>
    </>
  );
}
