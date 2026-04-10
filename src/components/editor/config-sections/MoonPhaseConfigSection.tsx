'use client';

import Toggle from '@/components/ui/Toggle';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

export function MoonPhaseConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ showIllumination?: boolean; showMoonTimes?: boolean }>(mod, screenId);

  return (
    <>
      <Toggle label="Show Illumination %" checked={c.showIllumination !== false} onChange={(v) => set({ showIllumination: v })} />
      <Toggle label="Show Moon Times" checked={c.showMoonTimes !== false} onChange={(v) => set({ showMoonTimes: v })} />
      <p className="text-xs text-hs-text-faint">Uses location from global settings.</p>
    </>
  );
}
