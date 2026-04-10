'use client';

import { useState, useEffect } from 'react';
import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance } from '@/types/config';

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}

interface CalendarSource {
  id: string;
  name: string;
  color: string;
}

export function CalendarConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    viewMode?: string;
    daysToShow?: number;
    showTime?: boolean;
    showLocation?: boolean;
    maxEvents?: number;
    showWeekNumbers?: boolean;
    sourceFilter?: string[];
    accentColor?: string;
  }>(mod, screenId);
  const viewMode = c.viewMode ?? 'daily';
  const sourceFilter = c.sourceFilter ?? [];

  // Build list of available sources from global settings + Google API
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? []);
  const icalSources = useEditorStore((s) => s.config?.settings?.calendar?.icalSources ?? []);
  const holidayCountry = useEditorStore((s) => s.config?.settings?.calendar?.holidayCountry);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);
  const [googleAuthError, setGoogleAuthError] = useState(false);

  useEffect(() => {
    async function fetchGoogleCals() {
      try {
        const res = await editorFetch('/api/calendars');
        if (res.ok) {
          setGoogleCalendars(await res.json());
          setGoogleAuthError(false);
        } else if (res.status === 403) {
          setGoogleAuthError(true);
        }
      } catch { /* ignore */ }
    }
    if (googleCalendarIds.length > 0) fetchGoogleCals();
  }, [googleCalendarIds.length]);

  // Merge Google + ICS into a unified source list
  const availableSources: CalendarSource[] = [];
  let unnamedCount = 0;
  for (const gid of googleCalendarIds) {
    const cal = googleCalendars.find((c) => c.id === gid);
    let name = cal?.summary;
    if (!name) {
      // Fallback: email-style IDs show local part, opaque hashes get a generic label
      const local = gid.split('@')[0];
      if (/^[a-z0-9]{20,}$/i.test(local)) {
        unnamedCount++;
        name = unnamedCount > 1 ? `Google Calendar ${unnamedCount}` : 'Google Calendar';
      } else {
        name = local;
      }
    }
    availableSources.push({
      id: gid,
      name,
      color: cal?.backgroundColor ?? '#3b82f6',
    });
  }
  for (const src of icalSources) {
    if (src.enabled) {
      availableSources.push({ id: src.id, name: src.name, color: src.color });
    }
  }
  if (holidayCountry) {
    availableSources.push({ id: 'holidays', name: 'Public Holidays', color: '#10b981' });
  }

  const allSelected = sourceFilter.length === 0;

  function toggleSource(id: string) {
    if (allSelected) {
      // Switching from "all" to individual: select all except this one
      set({ sourceFilter: availableSources.filter((s) => s.id !== id).map((s) => s.id) });
    } else if (sourceFilter.includes(id)) {
      const next = sourceFilter.filter((s) => s !== id);
      // If removing the last one, revert to "all"
      set({ sourceFilter: next.length === 0 ? undefined : next });
    } else {
      const next = [...sourceFilter, id];
      // If all are now selected, revert to "all"
      set({ sourceFilter: next.length >= availableSources.length ? undefined : next });
    }
  }

  function selectAll() {
    set({ sourceFilter: undefined });
  }

  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-hs-text-muted">View Mode</span>
        <select
          value={viewMode}
          onChange={(e) => set({ viewMode: e.target.value })}
          className={INPUT_CLASS}
        >
          <option value="daily">Daily Columns</option>
          <option value="agenda">Agenda List</option>
          <option value="week">Week Grid</option>
          <option value="month">Month Grid</option>
        </select>
      </label>

      {googleAuthError && googleCalendarIds.length > 0 && (
        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 text-xs text-hs-warning">
          Google Calendar auth expired. Re-authenticate in Settings → Calendar.
        </div>
      )}

      {availableSources.length > 1 && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Sources</span>
          <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong max-h-40 overflow-y-auto">
            <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
              <input
                type="radio"
                checked={allSelected}
                onChange={selectAll}
                className="border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
              />
              <span className="text-sm text-hs-text-body">All Sources</span>
            </label>
            {availableSources.map((src) => (
              <label key={src.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
                <input
                  type="checkbox"
                  checked={allSelected || sourceFilter.includes(src.id)}
                  onChange={() => toggleSource(src.id)}
                  className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: src.color }}
                />
                <span className="text-sm text-hs-text-body truncate">{src.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'daily' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Days to Show</span>
          <input
            type="number"
            min={1}
            max={14}
            value={c.daysToShow ?? 3}
            onChange={(e) => set({ daysToShow: Number(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
      )}
      {viewMode === 'agenda' && (
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-hs-text-muted">Max Events</span>
          <input
            type="number"
            min={1}
            max={100}
            value={c.maxEvents ?? 20}
            onChange={(e) => set({ maxEvents: Number(e.target.value) })}
            className={INPUT_CLASS}
          />
        </label>
      )}
      {(viewMode === 'daily' || viewMode === 'agenda') && (
        <>
          <Toggle label="Show Time" checked={c.showTime !== false} onChange={(v) => set({ showTime: v })} />
          <Toggle label="Show Location" checked={!!c.showLocation} onChange={(v) => set({ showLocation: v })} />
        </>
      )}
      {(viewMode === 'week' || viewMode === 'month') && (
        <Toggle label="Show Week Numbers" checked={!!c.showWeekNumbers} onChange={(v) => set({ showWeekNumbers: v })} />
      )}
      <ColorPicker
        label="Accent Color"
        value={c.accentColor ?? '#3b82f6'}
        onChange={(v) => set({ accentColor: v })}
      />
    </>
  );
}
