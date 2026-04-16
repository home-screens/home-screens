'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance } from '@/types/config';

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every other week' },
] as const;

const HIGHLIGHT_OPTIONS = [
  { value: 'day-before', label: 'Day Before (put bins out)' },
  { value: 'day-of', label: 'Day Of (collection day)' },
] as const;

export function GarbageDayConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    trashDay?: number; trashFrequency?: string; trashStartDate?: string; trashColor?: string;
    recyclingDay?: number; recyclingFrequency?: string; recyclingStartDate?: string; recyclingColor?: string;
    customDay?: number; customFrequency?: string; customStartDate?: string; customColor?: string;
    customLabel?: string; highlightMode?: string;
  }>(mod, screenId);

  const dayOptions = [
    { label: 'Disabled', value: -1 },
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  const defaultColors: Record<string, string> = { trash: '#6ee7b7', recycling: '#93c5fd', custom: '#fbbf24' };

  const wasteTypes = [
    { key: 'trash', label: 'Trash', day: c.trashDay, freq: c.trashFrequency, start: c.trashStartDate, color: c.trashColor },
    { key: 'recycling', label: 'Recycling', day: c.recyclingDay, freq: c.recyclingFrequency, start: c.recyclingStartDate, color: c.recyclingColor },
    { key: 'custom', label: c.customLabel || 'Custom', day: c.customDay, freq: c.customFrequency, start: c.customStartDate, color: c.customColor },
  ] as const;

  return (
    <>
      {wasteTypes.map(({ key, label, day, freq, start, color }) => (
        <div key={key} className="space-y-1.5 pb-2 border-b border-hs-border last:border-0">
          <LabeledField label={`${label} Day`}>
            <select className={INPUT_CLASS} value={day ?? -1} onChange={(e) => set({ [`${key}Day`]: Number(e.target.value) })}>
              {dayOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </LabeledField>
          {(day ?? -1) >= 0 && (
            <>
              <LabeledSelect
                label="Frequency"
                value={freq ?? 'weekly'}
                onChange={(v) => set({ [`${key}Frequency`]: v })}
                options={FREQUENCY_OPTIONS}
              />
              {freq === 'biweekly' && (
                <LabeledField label={`A known ${label.toLowerCase()} date`}>
                  <input type="date" className={INPUT_CLASS} value={start ?? ''} onChange={(e) => set({ [`${key}StartDate`]: e.target.value })} />
                  <span className="text-[10px] text-hs-text-faint">Pick any date when {label.toLowerCase()} was/will be collected</span>
                </LabeledField>
              )}
              <ColorPicker label="Icon Color" value={color || defaultColors[key]} onChange={(v) => set({ [`${key}Color`]: v })} />
            </>
          )}
        </div>
      ))}
      {(c.customDay ?? -1) >= 0 && (
        <LabeledInput
          label="Custom Category Name"
          value={c.customLabel ?? 'Yard Waste'}
          onChange={(v) => set({ customLabel: v })}
        />
      )}
      <LabeledSelect
        label="Highlight When"
        value={c.highlightMode ?? 'day-before'}
        onChange={(v) => set({ highlightMode: v })}
        options={HIGHLIGHT_OPTIONS}
      />
    </>
  );
}
