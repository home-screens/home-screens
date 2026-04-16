'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import LabeledSelect from '@/components/ui/LabeledSelect';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

const START_DAY_OPTIONS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
] as const;

export function MultiMonthConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{ view?: string; monthCount?: number; startDay?: string; showWeekNumbers?: boolean; highlightWeekends?: boolean; showAdjacentDays?: boolean }>(mod, screenId);

  return (
    <>
      <ViewSelect
        label="Layout"
        value={c.view ?? 'vertical'}
        onChange={(v) => set({ view: v })}
        options={[
          { value: 'vertical', label: 'Vertical (stacked)' },
          { value: 'horizontal', label: 'Horizontal (side by side)' },
        ]}
      />
      <Slider label="Months to Show" value={c.monthCount ?? 3} min={1} max={6} step={1} onChange={(v) => set({ monthCount: v })} />
      <LabeledSelect
        label="Week Starts On"
        value={c.startDay ?? 'sunday'}
        onChange={(v) => set({ startDay: v })}
        options={START_DAY_OPTIONS}
      />
      <Toggle label="Show Week Numbers" checked={c.showWeekNumbers === true} onChange={(v) => set({ showWeekNumbers: v })} />
      <Toggle label="Highlight Weekends" checked={c.highlightWeekends !== false} onChange={(v) => set({ highlightWeekends: v })} />
      <Toggle label="Show Adjacent Days" checked={c.showAdjacentDays !== false} onChange={(v) => set({ showAdjacentDays: v })} />
    </>
  );
}
