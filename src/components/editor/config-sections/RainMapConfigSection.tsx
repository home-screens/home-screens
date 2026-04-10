'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

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
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Latitude (0 = global)</span>
        <input
          type="number"
          step="0.01"
          value={c.latitude ?? 0}
          onChange={(e) => set({ latitude: Number(e.target.value) })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Longitude (0 = global)</span>
        <input
          type="number"
          step="0.01"
          value={c.longitude ?? 0}
          onChange={(e) => set({ longitude: Number(e.target.value) })}
          className={INPUT_CLASS}
        />
      </label>
      <Slider label="Zoom" value={c.zoom ?? 6} min={1} max={12} step={1} onChange={(v) => set({ zoom: v })} />
      <Slider label="Animation Speed (ms)" value={c.animationSpeedMs ?? 500} min={200} max={2000} step={100} onChange={(v) => set({ animationSpeedMs: v })} />
      <Slider label="End Pause (ms)" value={c.extraDelayLastFrameMs ?? 2000} min={0} max={5000} step={500} onChange={(v) => set({ extraDelayLastFrameMs: v })} />
      <Slider label="Radar Opacity %" value={Math.round((c.opacity ?? 0.7) * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} />
      <Toggle label="Smooth Radar" checked={c.smooth !== false} onChange={(v) => set({ smooth: v })} />
      <Toggle label="Show Snow" checked={c.showSnow !== false} onChange={(v) => set({ showSnow: v })} />
      <Toggle label="Show Timestamp" checked={c.showTimestamp !== false} onChange={(v) => set({ showTimestamp: v })} />
      <Toggle label="Show Timeline" checked={c.showTimeline !== false} onChange={(v) => set({ showTimeline: v })} />
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Map Style</span>
        <select
          value={c.mapStyle ?? 'dark'}
          onChange={(e) => set({ mapStyle: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="dark">Dark</option>
          <option value="standard">Standard</option>
        </select>
      </label>
      <Slider label="Refresh (minutes)" value={(c.refreshIntervalMs ?? 600000) / 60000} min={5} max={30} step={5} onChange={(v) => set({ refreshIntervalMs: v * 60000 })} />
      <p className="text-xs text-hs-text-faint">Uses location from global settings when lat/lon are 0.</p>
    </>
  );
}
