'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance } from '@/types/config';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['air-quality']?.ttlMs ?? 300_000;

export function AirQualityConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ showAQI?: boolean; showPollutants?: boolean; refreshIntervalMs?: number }>(mod, screenId);

  return (
    <>
      <Toggle label={t('configSections.air-quality.showAQI')} checked={c.showAQI !== false} onChange={(v) => set({ showAQI: v })} />
      <Toggle label={t('configSections.air-quality.showPollutants')} checked={!!c.showPollutants} onChange={(v) => set({ showPollutants: v })} />
      <Slider
        label={t('common.refreshMinutes')}
        value={(c.refreshIntervalMs ?? DEFAULT_REFRESH_MS) / 60000}
        min={5}
        max={120}
        step={5}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
    </>
  );
}
