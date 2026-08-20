'use client';

import { useState, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';

interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor: string;
  primary: boolean;
}

export interface CalendarSource {
  id: string;
  name: string;
  color: string;
}

/**
 * Builds the unified calendar source list (Google + enabled iCal + enabled iCloud + holidays) from
 * global settings and the Google Calendar API. `googleAuthError` is set on a 403 so
 * callers that have a re-auth banner can surface it; callers without one ignore it.
 * `keyPrefix` is the `editor` namespace path to the caller's translations (e.g.
 * `configSections.calendar`) so the two calendar modules keep their own i18n keys.
 */
export function useCalendarSources(keyPrefix: string): {
  availableSources: CalendarSource[];
  googleAuthError: boolean;
} {
  const t = useTranslate('editor');
  const googleCalendarIds = useEditorStore((s) => s.config?.settings?.calendar?.googleCalendarIds ?? []);
  const icalSources = useEditorStore((s) => s.config?.settings?.calendar?.icalSources ?? []);
  const icloudSources = useEditorStore((s) => s.config?.settings?.calendar?.icloudSources ?? []);
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
        name = unnamedCount > 1
          ? t(`${keyPrefix}.googleCalendarNumbered`, { n: unnamedCount })
          : t(`${keyPrefix}.googleCalendar`);
      } else {
        name = local;
      }
    }
    availableSources.push({ id: gid, name, color: cal?.backgroundColor ?? '#3b82f6' });
  }
  for (const src of icalSources) {
    if (src.enabled) availableSources.push({ id: src.id, name: src.name, color: src.color });
  }
  for (const src of icloudSources) {
    if (src.enabled) availableSources.push({ id: src.id, name: src.name, color: src.color });
  }
  if (holidayCountry) {
    availableSources.push({ id: 'holidays', name: t(`${keyPrefix}.publicHolidays`), color: '#10b981' });
  }

  return { availableSources, googleAuthError };
}

/**
 * The "All sources" + per-source checkbox list. An empty `sourceFilter` means "all";
 * `onChange` receives `undefined` to revert to "all" or the explicit list otherwise.
 * Renders nothing when there are fewer than two sources to choose between.
 */
export function CalendarSourceFilter({
  keyPrefix,
  availableSources,
  sourceFilter,
  onChange,
}: {
  keyPrefix: string;
  availableSources: CalendarSource[];
  sourceFilter: string[];
  onChange: (next: string[] | undefined) => void;
}) {
  const t = useTranslate('editor');
  const allSelected = sourceFilter.length === 0;

  function toggleSource(id: string) {
    if (allSelected) {
      // Switching from "all" to individual: select all except this one
      onChange(availableSources.filter((s) => s.id !== id).map((s) => s.id));
    } else if (sourceFilter.includes(id)) {
      const next = sourceFilter.filter((s) => s !== id);
      // If removing the last one, revert to "all"
      onChange(next.length === 0 ? undefined : next);
    } else {
      const next = [...sourceFilter, id];
      // If all are now selected, revert to "all"
      onChange(next.length >= availableSources.length ? undefined : next);
    }
  }

  if (availableSources.length <= 1) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-hs-text-muted">{t(`${keyPrefix}.sources`)}</span>
      <div className="rounded-md bg-hs-card border border-hs-border-strong divide-y divide-hs-border-strong max-h-40 overflow-y-auto">
        <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
          <input
            type="radio"
            checked={allSelected}
            onChange={() => onChange(undefined)}
            className="border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
          />
          <span className="text-sm text-hs-text-body">{t(`${keyPrefix}.allSources`)}</span>
        </label>
        {availableSources.map((src) => (
          <label key={src.id} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-hs-hover">
            <input
              type="checkbox"
              checked={allSelected || sourceFilter.includes(src.id)}
              onChange={() => toggleSource(src.id)}
              className="rounded border-hs-border-strong bg-hs-card text-hs-accent focus:ring-hs-accent focus:ring-offset-0"
            />
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
            <span className="text-sm text-hs-text-body truncate">{src.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
