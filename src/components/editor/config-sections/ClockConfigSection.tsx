'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, ClockView, WorldClockZone } from '@/types/config';

const VIEWS: { value: ClockView; label: string }[] = [
  { value: 'classic', label: 'Classic (Centered)' },
  { value: 'digital', label: 'Digital (7-Segment LED)' },
  { value: 'analog', label: 'Analog (Clock Face)' },
  { value: 'minimal', label: 'Minimal (Time Only)' },
  { value: 'flip', label: 'Flip (Split-Flap)' },
  { value: 'word', label: 'Word (English Text)' },
  { value: 'binary', label: 'Binary (BCD Dots)' },
  { value: 'vertical', label: 'Vertical (Stacked)' },
  { value: 'split', label: 'Split (Time + Date)' },
  { value: 'progress', label: 'Progress (Day Ring)' },
  { value: 'fuzzy', label: 'Fuzzy (Approximate)' },
  { value: 'world', label: 'World (Time Zones)' },
  { value: 'dot-matrix', label: 'Dot Matrix (LED Grid)' },
  { value: 'radial', label: 'Radial (Concentric Rings)' },
  { value: 'arc', label: 'Arc (Sun Position)' },
  { value: 'neon', label: 'Neon (Glow Sign)' },
  { value: 'bar', label: 'Bar (Progress Bars)' },
  { value: 'elapsed', label: 'Elapsed (Since/Until)' },
];

const DATE_PRESETS: { label: string; value: string }[] = [
  { label: 'Monday, January 5', value: 'EEEE, MMMM d' },
  { label: 'Mon, Jan 5', value: 'EEE, MMM d' },
  { label: 'January 5, 2026', value: 'MMMM d, yyyy' },
  { label: 'Jan 5, 2026', value: 'MMM d, yyyy' },
  { label: '01/05/2026', value: 'MM/dd/yyyy' },
  { label: '05/01/2026', value: 'dd/MM/yyyy' },
  { label: '2026-01-05', value: 'yyyy-MM-dd' },
  { label: 'Monday', value: 'EEEE' },
];

const TIMEZONE_OPTIONS: { label: string; value: string }[] = [
  { label: 'New York', value: 'America/New_York' },
  { label: 'Chicago', value: 'America/Chicago' },
  { label: 'Denver', value: 'America/Denver' },
  { label: 'Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Anchorage', value: 'America/Anchorage' },
  { label: 'Honolulu', value: 'Pacific/Honolulu' },
  { label: 'Toronto', value: 'America/Toronto' },
  { label: 'Vancouver', value: 'America/Vancouver' },
  { label: 'Mexico City', value: 'America/Mexico_City' },
  { label: 'São Paulo', value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Berlin', value: 'Europe/Berlin' },
  { label: 'Amsterdam', value: 'Europe/Amsterdam' },
  { label: 'Rome', value: 'Europe/Rome' },
  { label: 'Madrid', value: 'Europe/Madrid' },
  { label: 'Zurich', value: 'Europe/Zurich' },
  { label: 'Stockholm', value: 'Europe/Stockholm' },
  { label: 'Moscow', value: 'Europe/Moscow' },
  { label: 'Istanbul', value: 'Europe/Istanbul' },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Mumbai', value: 'Asia/Kolkata' },
  { label: 'Bangkok', value: 'Asia/Bangkok' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
  { label: 'Shanghai', value: 'Asia/Shanghai' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Seoul', value: 'Asia/Seoul' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Melbourne', value: 'Australia/Melbourne' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
  { label: 'UTC', value: 'UTC' },
];

/** Which config fields are relevant for each view */
const VIEW_FIELDS: Record<ClockView, Set<string>> = {
  classic:     new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  digital:     new Set(['format24h', 'showSeconds', 'accentColor']),
  analog:      new Set(['showSeconds', 'showNumerals', 'accentColor']),
  minimal:     new Set(['format24h']),
  flip:        new Set(['format24h', 'showSeconds', 'animateFlip', 'accentColor']),
  word:        new Set(['showDate', 'dateFormat']),
  binary:      new Set(['format24h', 'showSeconds', 'accentColor']),
  vertical:    new Set(['format24h', 'showSeconds']),
  split:       new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay']),
  progress:    new Set(['format24h', 'showSeconds', 'accentColor']),
  fuzzy:       new Set(['showDate', 'dateFormat']),
  world:       new Set(['format24h', 'showSeconds', 'worldZones']),
  'dot-matrix': new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  radial:      new Set(['format24h', 'showSeconds', 'accentColor']),
  arc:         new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'accentColor']),
  neon:        new Set(['format24h', 'showSeconds', 'showDate', 'dateFormat', 'weekDay', 'accentColor']),
  bar:         new Set(['format24h', 'showSeconds', 'accentColor']),
  elapsed:     new Set(['referenceTime', 'referenceLabel', 'countUp', 'accentColor']),
};

type ClockConfigType = {
  view?: ClockView;
  format24h?: boolean;
  showSeconds?: boolean;
  showDate?: boolean;
  dateFormat?: string;
  showWeekNumber?: boolean;
  showDayOfYear?: boolean;
  showNumerals?: boolean;
  animateFlip?: boolean;
  accentColor?: string;
  worldZones?: WorldClockZone[];
  referenceTime?: string;
  referenceLabel?: string;
  countUp?: boolean;
};

export function ClockConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<ClockConfigType>(mod, screenId);

  const view = c.view ?? 'classic';
  const fields = VIEW_FIELDS[view] ?? new Set<string>();
  const dateFormatVal = c.dateFormat ?? 'EEEE, MMMM d';
  const isCustomDateFormat = !DATE_PRESETS.some((p) => p.value === dateFormatVal);
  const [showCustomDate, setShowCustomDate] = useState(isCustomDateFormat);

  const worldZones = useMemo(() => c.worldZones ?? [], [c.worldZones]);

  // Live date format preview
  let datePreview = '';
  try {
    datePreview = format(new Date(), dateFormatVal);
  } catch {
    datePreview = 'Invalid format';
  }

  const has = (field: string) => fields.has(field);

  // Filter out already-selected timezones from the dropdown
  const availableZones = useMemo(
    () => TIMEZONE_OPTIONS.filter((tz) => !worldZones.some((wz) => wz.timezone === tz.value)),
    [worldZones],
  );

  const addZone = (tzValue: string) => {
    if (!tzValue || worldZones.length >= 3) return;
    const option = TIMEZONE_OPTIONS.find((tz) => tz.value === tzValue);
    if (!option) return;
    set({ worldZones: [...worldZones, { label: option.label, timezone: option.value }] });
  };

  const removeZone = (index: number) => {
    set({ worldZones: worldZones.filter((_, i) => i !== index) });
  };

  return (
    <>
      {/* View Selector */}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      {/* Format */}
      {has('format24h') && (
        <Toggle label="24-Hour Format" checked={!!c.format24h} onChange={(v) => set({ format24h: v })} />
      )}

      {/* Seconds */}
      {has('showSeconds') && (
        <Toggle label="Show Seconds" checked={c.showSeconds !== false} onChange={(v) => set({ showSeconds: v })} />
      )}

      {/* Show Date */}
      {has('showDate') && (
        <Toggle label="Show Date" checked={c.showDate !== false} onChange={(v) => set({ showDate: v })} />
      )}

      {/* Date Format (preset dropdown + custom input + live preview) */}
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

      {/* Week/Day info */}
      {has('weekDay') && (
        <>
          <Toggle label="Show Week Number" checked={!!c.showWeekNumber} onChange={(v) => set({ showWeekNumber: v })} />
          <Toggle label="Show Day of Year" checked={!!c.showDayOfYear} onChange={(v) => set({ showDayOfYear: v })} />
        </>
      )}

      {/* Analog: show numerals */}
      {has('showNumerals') && (
        <Toggle label="Show Hour Numbers" checked={!!c.showNumerals} onChange={(v) => set({ showNumerals: v })} />
      )}

      {/* Flip: animate */}
      {has('animateFlip') && (
        <Toggle label="Flip Animation" checked={c.animateFlip !== false} onChange={(v) => set({ animateFlip: v })} />
      )}

      {/* Accent Color */}
      {has('accentColor') && (
        <ColorPicker
          label="Accent Color"
          value={c.accentColor ?? '#22d3ee'}
          onChange={(v) => set({ accentColor: v })}
        />
      )}

      {/* World: timezone list */}
      {has('worldZones') && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-hs-text-muted">Time Zones ({worldZones.length}/3)</span>
          {worldZones.map((zone, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-hs-card rounded p-1.5">
              <span className="flex-1 text-hs-text-secondary">{zone.label} — {zone.timezone}</span>
              <button
                type="button"
                onClick={() => removeZone(i)}
                className="text-hs-text-faint hover:text-hs-danger shrink-0"
              >
                &times;
              </button>
            </div>
          ))}
          {worldZones.length < 3 && availableZones.length > 0 && (
            <select
              value=""
              onChange={(e) => addZone(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Add a timezone...</option>
              {availableZones.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Elapsed: reference time config */}
      {has('referenceTime') && (
        <>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Reference Time</span>
            <input
              type="datetime-local"
              value={c.referenceTime ?? ''}
              onChange={(e) => set({ referenceTime: e.target.value })}
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-hs-text-muted">Label</span>
            <input
              type="text"
              value={c.referenceLabel ?? ''}
              onChange={(e) => set({ referenceLabel: e.target.value })}
              placeholder="e.g. market open"
              className={INPUT_CLASS}
            />
          </label>
          <Toggle
            label="Count Up (elapsed)"
            checked={c.countUp !== false}
            onChange={(v) => set({ countUp: v })}
          />
        </>
      )}
    </>
  );
}
