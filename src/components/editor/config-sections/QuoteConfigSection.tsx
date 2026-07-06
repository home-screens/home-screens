'use client';

import { useTranslate } from '@/i18n';
import Slider from '@/components/ui/Slider';
import AccentColorPicker from '@/components/ui/AccentColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['quote']?.ttlMs ?? 3_600_000;

export function QuoteConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ refreshIntervalMs?: number; accentColor?: string }>(mod, screenId);

  return (
    <>
      <Slider
        label={t('common.refreshSeconds')}
        value={(c.refreshIntervalMs ?? DEFAULT_REFRESH_MS) / 1000}
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
