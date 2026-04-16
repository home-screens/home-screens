'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import type { FullscreenTypographySize, FullscreenCalendarView, CalendarDensity } from '@/types/config';
import type { ModuleInstance, FullscreenCalendarConfig } from '@/types/config';

interface CalendarSource {
  id: string;
  name: string;
  color: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}

const VIEW_OPTIONS: { value: FullscreenCalendarView; label: string }[] = [
  { value: 'schedule', label: 'Schedule (Column Grid)' },
  { value: 'week-list', label: 'Week List' },
  { value: 'month-grid', label: 'Month Grid' },
  { value: 'day-timeline', label: 'Day Timeline' },
  { value: 'agenda', label: 'Agenda' },
];

const DENSITY_OPTIONS: { value: CalendarDensity; label: string }[] = [
  { value: 'cozy', label: 'Cozy (distance reading)' },
  { value: 'snug', label: 'Snug (more events)' },
];

const TYPOGRAPHY_OPTIONS: { value: FullscreenTypographySize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra-large', label: 'Extra Large' },
  { value: '2x-large', label: '2X Large' },
  { value: '3x-large', label: '3X Large' },
  { value: '4x-large', label: '4X Large' },
];

export function FullscreenCalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<Partial<FullscreenCalendarConfig>>(mod, screenId);
  const view = c.view ?? 'schedule';
  const sourceFilter = c.sourceFilter ?? [];

  // Build source list (same pattern as CalendarConfigSection)
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? []);
  const icalSources = useEditorStore((s) => s.config?.settings?.calendar?.icalSources ?? []);
  const holidayCountry = useEditorStore((s) => s.config?.settings?.calendar?.holidayCountry);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);

  useEffect(() => {
    async function fetchGoogleCals() {
      try {
        const res = await editorFetch('/api/calendars');
        if (res.ok) setGoogleCalendars(await res.json());
      } catch { /* ignore */ }
    }
    if (googleCalendarIds.length > 0) fetchGoogleCals();
  }, [googleCalendarIds.length]);

  const availableSources: CalendarSource[] = [];
  let unnamedCount = 0;
  for (const gid of googleCalendarIds) {
    const cal = googleCalendars.find((c) => c.id === gid);
    let name = cal?.summary;
    if (!name) {
      const local = gid.split('@')[0];
      if (/^[a-z0-9]{20,}$/i.test(local)) {
        unnamedCount++;
        name = unnamedCount > 1 ? `Google Calendar ${unnamedCount}` : 'Google Calendar';
      } else {
        name = local;
      }
    }
    availableSources.push({ id: gid, name, color: cal?.backgroundColor ?? '#3b82f6' });
  }
  for (const src of icalSources) {
    if (src.enabled) availableSources.push({ id: src.id, name: src.name, color: src.color });
  }
  if (holidayCountry) availableSources.push({ id: 'holidays', name: 'Public Holidays', color: '#10b981' });

  const allSelected = sourceFilter.length === 0;

  function toggleSource(id: string) {
    if (allSelected) {
      set({ sourceFilter: availableSources.filter((s) => s.id !== id).map((s) => s.id) });
    } else if (sourceFilter.includes(id)) {
      const next = sourceFilter.filter((s) => s !== id);
      set({ sourceFilter: next.length === 0 ? undefined : next });
    } else {
      const next = [...sourceFilter, id];
      set({ sourceFilter: next.length >= availableSources.length ? undefined : next });
    }
  }

  return (
    <>
      {/* View Mode */}
      <LabeledSelect
        label="View"
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEW_OPTIONS}
      />

      {/* Density */}
      <LabeledSelect
        label="Density"
        value={c.density ?? 'cozy'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      {/* Typography Size */}
      <LabeledSelect
        label="Typography Size"
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={TYPOGRAPHY_OPTIONS}
      />

      {/* Theme Override */}
      <LabeledField label="Theme">
        <select
          value={c.theme ?? ''}
          onChange={(e) => set({ theme: e.target.value || undefined })}
          className={INPUT_CLASS}
        >
          <option value="">Default (from Settings)</option>
          {FULLSCREEN_THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.group})</option>
          ))}
        </select>
      </LabeledField>

      {/* Accent Color */}
      <ColorPicker label="Accent Color" value={c.accentColor ?? '#EA580C'} onChange={(v) => set({ accentColor: v })} />

      {/* Toggles */}
      <Toggle label="Dim Past Events" checked={c.dimPastEvents !== false} onChange={(v) => set({ dimPastEvents: v })} />
      <Toggle label="Shade Weekends" checked={c.shadeWeekends !== false} onChange={(v) => set({ shadeWeekends: v })} />
      <Toggle label="Show Weather" checked={c.showWeather !== false} onChange={(v) => set({ showWeather: v })} />
      <Toggle label="Show Now Line" checked={c.showNowLine !== false} onChange={(v) => set({ showNowLine: v })} />

      {/* Source filter */}
      {availableSources.length > 1 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Sources</span>
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong max-h-40 overflow-y-auto">
            <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
              <input type="radio" checked={allSelected} onChange={() => set({ sourceFilter: undefined })}
                className="border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0" />
              <span className="text-sm text-hs-text-body">All Sources</span>
            </label>
            {availableSources.map((src) => (
              <label key={src.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
                <input type="checkbox" checked={allSelected || sourceFilter.includes(src.id)} onChange={() => toggleSource(src.id)}
                  className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0" />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                <span className="text-sm text-hs-text-body truncate">{src.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* View-specific settings */}
      {(view === 'schedule' || view === 'day-timeline') && (
        <>
          <LabeledInput
            label="Start Hour"
            type="number"
            min={0}
            max={23}
            value={view === 'schedule' ? (c.scheduleHourStart ?? 6) : (c.dayHourStart ?? 6)}
            onChange={(v) => set(view === 'schedule' ? { scheduleHourStart: Number(v) } : { dayHourStart: Number(v) })}
          />
          <LabeledInput
            label="End Hour"
            type="number"
            min={1}
            max={24}
            value={view === 'schedule' ? (c.scheduleHourEnd ?? 22) : (c.dayHourEnd ?? 22)}
            onChange={(v) => set(view === 'schedule' ? { scheduleHourEnd: Number(v) } : { dayHourEnd: Number(v) })}
          />
        </>
      )}

      {view === 'schedule' && (
        <LabeledInput
          label="Days to Show (0 = auto)"
          type="number"
          min={0}
          max={7}
          value={c.scheduleDaysToShow ?? 0}
          onChange={(v) => set({ scheduleDaysToShow: Number(v) })}
        />
      )}

      {view === 'week-list' && (
        <Toggle label="Collapse Past Days" checked={c.weekCollapsePastDays !== false} onChange={(v) => set({ weekCollapsePastDays: v })} />
      )}

      {view === 'month-grid' && (
        <>
          <Toggle label="Show Week Numbers" checked={!!c.monthShowWeekNumbers} onChange={(v) => set({ monthShowWeekNumbers: v })} />
          <LabeledInput
            label="Max Events per Cell (0 = auto)"
            type="number"
            min={0}
            max={8}
            value={c.monthMaxEventsPerCell ?? 0}
            onChange={(v) => set({ monthMaxEventsPerCell: Number(v) })}
          />
        </>
      )}

      {view === 'day-timeline' && (
        <Toggle label="Show Location" checked={c.dayShowLocation !== false} onChange={(v) => set({ dayShowLocation: v })} />
      )}

      {view === 'agenda' && (
        <>
          <LabeledInput
            label="Days Ahead"
            type="number"
            min={7}
            max={30}
            value={c.agendaDaysAhead ?? 14}
            onChange={(v) => set({ agendaDaysAhead: Number(v) })}
          />
          <Toggle label="Hide Empty Days" checked={!!c.agendaHideEmptyDays} onChange={(v) => set({ agendaHideEmptyDays: v })} />
        </>
      )}
    </>
  );
}
