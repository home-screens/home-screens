'use client';

import ColorPicker from '@/components/ui/ColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

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
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">{label} Day</span>
            <select className={INPUT_CLASS} value={day ?? -1} onChange={(e) => set({ [`${key}Day`]: Number(e.target.value) })}>
              {dayOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          {(day ?? -1) >= 0 && (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-hs-text-muted">Frequency</span>
                <select className={INPUT_CLASS} value={freq ?? 'weekly'} onChange={(e) => set({ [`${key}Frequency`]: e.target.value })}>
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every other week</option>
                </select>
              </label>
              {freq === 'biweekly' && (
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-hs-text-muted">A known {label.toLowerCase()} date</span>
                  <input type="date" className={INPUT_CLASS} value={start ?? ''} onChange={(e) => set({ [`${key}StartDate`]: e.target.value })} />
                  <span className="text-[10px] text-hs-text-faint">Pick any date when {label.toLowerCase()} was/will be collected</span>
                </label>
              )}
              <ColorPicker label="Icon Color" value={color || defaultColors[key]} onChange={(v) => set({ [`${key}Color`]: v })} />
            </>
          )}
        </div>
      ))}
      {(c.customDay ?? -1) >= 0 && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Custom Category Name</span>
          <input type="text" className={INPUT_CLASS} value={c.customLabel ?? 'Yard Waste'} onChange={(e) => set({ customLabel: e.target.value })} />
        </label>
      )}
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">Highlight When</span>
        <select className={INPUT_CLASS} value={c.highlightMode ?? 'day-before'} onChange={(e) => set({ highlightMode: e.target.value })}>
          <option value="day-before">Day Before (put bins out)</option>
          <option value="day-of">Day Of (collection day)</option>
        </select>
      </label>
    </>
  );
}
