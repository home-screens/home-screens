'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, DateView } from '@/types/config';

const VIEWS: { value: DateView; label: string }[] = [
  { value: 'full', label: 'Full (Calendar Page)' },
  { value: 'minimal', label: 'Minimal (Single Line)' },
  { value: 'stacked', label: 'Stacked (Vertical)' },
  { value: 'editorial', label: 'Editorial (Magazine)' },
  { value: 'banner', label: 'Banner (Horizontal)' },
];

const DATE_PRESETS: { label: string; value: string }[] = [
  { label: 'January 5', value: 'MMMM d' },
  { label: 'Monday, January 5', value: 'EEEE, MMMM d' },
  { label: 'Mon, Jan 5', value: 'EEE, MMM d' },
  { label: 'January 5, 2026', value: 'MMMM d, yyyy' },
  { label: 'Jan 5, 2026', value: 'MMM d, yyyy' },
  { label: '01/05/2026', value: 'MM/dd/yyyy' },
  { label: '05/01/2026', value: 'dd/MM/yyyy' },
  { label: '2026-01-05', value: 'yyyy-MM-dd' },
];

/** Which config fields are relevant for each view */
const VIEW_FIELDS: Record<DateView, Set<string>> = {
  full:      new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  minimal:   new Set(['dateFormat', 'showWeekNumber', 'showDayOfYear']),
  stacked:   new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  editorial: new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
  banner:    new Set(['showDayName', 'showYear', 'showWeekNumber', 'showDayOfYear', 'accentColor']),
};

type DateConfigType = {
  view?: DateView;
  dateFormat?: string;
  showDayName?: boolean;
  showYear?: boolean;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
  accentColor?: string;
};

export function DateConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<DateConfigType>(mod, screenId);

  const view = c.view ?? 'full';
  const fields = VIEW_FIELDS[view] ?? new Set<string>();
  const dateFormatVal = c.dateFormat ?? 'MMMM d';
  const isCustomDateFormat = !DATE_PRESETS.some((p) => p.value === dateFormatVal);
  const [showCustomDate, setShowCustomDate] = useState(isCustomDateFormat);

  // Live date format preview
  let datePreview = '';
  try {
    datePreview = format(new Date(), dateFormatVal);
  } catch {
    datePreview = 'Invalid format';
  }

  const has = (field: string) => fields.has(field);

  return (
    <>
      {/* View Selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Date Format (only for minimal view) */}
      {has('dateFormat') && (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Date Format</span>
            <select
              value={showCustomDate ? '__custom__' : dateFormatVal}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setShowCustomDate(true);
                } else {
                  setShowCustomDate(false);
                  set({ dateFormat: e.target.value });
                }
              }}
              className={INPUT_CLASS}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
          </label>
          {showCustomDate && (
            <input
              type="text"
              value={dateFormatVal}
              onChange={(e) => set({ dateFormat: e.target.value })}
              placeholder="e.g. EEEE, MMMM d"
              className={INPUT_CLASS}
            />
          )}
          <span className="text-xs text-hs-text-faint">{datePreview}</span>
        </div>
      )}

      {/* Show Day Name */}
      {has('showDayName') && (
        <Toggle label="Show Day Name" checked={c.showDayName !== false} onChange={(v) => set({ showDayName: v })} />
      )}

      {/* Show Year */}
      {has('showYear') && (
        <Toggle label="Show Year" checked={!!c.showYear} onChange={(v) => set({ showYear: v })} />
      )}

      {/* Week/Day info */}
      {has('showWeekNumber') && (
        <Toggle label="Show Week Number" checked={!!c.showWeekNumber} onChange={(v) => set({ showWeekNumber: v })} />
      )}
      {has('showDayOfYear') && (
        <Toggle label="Show Day of Year" checked={!!c.showDayOfYear} onChange={(v) => set({ showDayOfYear: v })} />
      )}

      {/* Accent Color */}
      {has('accentColor') && (
        <ColorPicker
          label="Accent Color"
          value={c.accentColor ?? '#22d3ee'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}
    </>
  );
}
