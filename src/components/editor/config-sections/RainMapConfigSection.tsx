'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000;

export function RainMapConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
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

  const MAP_STYLE_OPTIONS = [
    { value: 'dark', label: t('configSections.rain-map.styleDark') },
    { value: 'standard', label: t('configSections.rain-map.styleStandard') },
  ] as const;

  return (
    <>
      <LabeledInput
        label={t('configSections.rain-map.latitude')}
        type="number"
        step="0.01"
        value={c.latitude ?? 0}
        onChange={(v) => set({ latitude: Number(v) })}
      />
      <LabeledInput
        label={t('configSections.rain-map.longitude')}
        type="number"
        step="0.01"
        value={c.longitude ?? 0}
        onChange={(v) => set({ longitude: Number(v) })}
      />
      <Slider label={t('configSections.rain-map.zoom')} value={c.zoom ?? 6} min={1} max={12} step={1} onChange={(v) => set({ zoom: v })} />
      <Slider label={t('configSections.rain-map.animationSpeed')} value={c.animationSpeedMs ?? 500} min={200} max={2000} step={100} onChange={(v) => set({ animationSpeedMs: v })} />
      <Slider label={t('configSections.rain-map.endPause')} value={c.extraDelayLastFrameMs ?? 2000} min={0} max={5000} step={500} onChange={(v) => set({ extraDelayLastFrameMs: v })} />
      <Slider label={t('configSections.rain-map.radarOpacity')} value={Math.round((c.opacity ?? 0.7) * 100)} min={10} max={100} step={5} onChange={(v) => set({ opacity: v / 100 })} />
      <Toggle label={t('configSections.rain-map.smoothRadar')} checked={c.smooth !== false} onChange={(v) => set({ smooth: v })} />
      <Toggle label={t('configSections.rain-map.showSnow')} checked={c.showSnow !== false} onChange={(v) => set({ showSnow: v })} />
      <Toggle label={t('configSections.rain-map.showTimestamp')} checked={c.showTimestamp !== false} onChange={(v) => set({ showTimestamp: v })} />
      <Toggle label={t('configSections.rain-map.showTimeline')} checked={c.showTimeline !== false} onChange={(v) => set({ showTimeline: v })} />
      <LabeledSelect
        label={t('configSections.rain-map.mapStyle')}
        value={c.mapStyle ?? 'dark'}
        onChange={(v) => set({ mapStyle: v })}
        options={MAP_STYLE_OPTIONS}
      />
      <Slider label={t('common.refreshMinutes')} value={(c.refreshIntervalMs ?? DEFAULT_REFRESH_MS) / 60000} min={5} max={30} step={5} onChange={(v) => set({ refreshIntervalMs: v * 60000 })} />
      <p className="text-xs text-hs-text-faint">{t('configSections.rain-map.locationHelp')}</p>
    </>
  );
}
