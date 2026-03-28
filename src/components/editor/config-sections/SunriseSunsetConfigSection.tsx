'use client';

import Toggle from '@/components/ui/Toggle';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, SunriseSunsetView } from '@/types/config';

const VIEWS: { value: SunriseSunsetView; label: string }[] = [
  { value: 'default', label: 'Default (Text)' },
  { value: 'arc', label: 'Sun Arc (Visual)' },
];

type SunriseSunsetConfigType = {
  view?: SunriseSunsetView;
  showDayLength?: boolean;
  showGoldenHour?: boolean;
};

export function SunriseSunsetConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<SunriseSunsetConfigType>(mod, screenId);

  return (
    <>
      <ViewSelect
        value={c.view ?? 'default'}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />
      <Toggle label="Show Day Length" checked={c.showDayLength !== false} onChange={(v) => set({ showDayLength: v })} />
      <Toggle label="Show Golden Hour" checked={!!c.showGoldenHour} onChange={(v) => set({ showGoldenHour: v })} />
      <p className="text-xs text-neutral-500">Uses location from global settings.</p>
    </>
  );
}
