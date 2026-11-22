'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { HubUnreachableError, readJson } from '@/lib/hub-request';
import { addIsoDays } from '@/lib/iso-date';
import { parseDateInTZ } from '@/lib/timezone';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import type { CalendarEvent } from '@/types/config';

/** What a write to the hub came back with: the JSON either way, or `unreachable` when the hub never answered. */
export type CalendarWriteResult =
  | { ok: true; json: unknown }
  | { ok: false; status: number; json: unknown }
  | { ok: false; unreachable: true }
  /** Nobody gave the grown-up code; nothing was sent and nothing needs saying. */
  | { ok: false; cancelled: true };

/**
 * The phone's Calendar tab data: what adding offers (`/api/calendar/entry`)
 * and the events for the days on screen (`/api/calendar`), read again after
 * every change so the list shows what Google or iCloud now holds.
 */
export function useCalendarTab(days: readonly string[]) {
  const [entry, setEntry] = useState<CalendarEntryInfo | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const first = days[0];
  const last = days[days.length - 1];
  // A slower read for an earlier week must not land over the newer one.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const entryRes = await editorFetch('/api/calendar/entry');
      const info = entryRes.ok ? (await readJson(entryRes)) as CalendarEntryInfo : null;
      const zone = info?.timezone;
      const timeMin = parseDateInTZ(`${first}T00:00:00`, zone).toISOString();
      const timeMax = parseDateInTZ(`${addIsoDays(last, 1)}T00:00:00`, zone).toISOString();
      const res = await editorFetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      const body = res.ok ? (await readJson(res)) as { events?: CalendarEvent[] } : null;
      if (mine !== generation.current) return;
      setEntry(info);
      // No calendar at all answers an error; the tab still shows the days and their notes.
      setEvents(body?.events ?? []);
      setLoadError(false);
    } catch {
      if (mine === generation.current) setLoadError(true);
    } finally {
      if (mine === generation.current) setLoaded(true);
    }
  }, [first, last]);

  useEffect(() => {
    void load();
  }, [load]);

  /** `why`, for a write that may ask for the grown-up code, is what the pad says it is for. */
  const write = useCallback(async (url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown, why?: string): Promise<CalendarWriteResult> => {
    try {
      const res = await (why ? grownUpFetch(editorFetch, why) : editorFetch)(url, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const json = await readJson(res);
      return res.ok ? { ok: true, json } : { ok: false, status: res.status, json };
    } catch (err) {
      if (isGrownUpCancelled(err)) return { ok: false, cancelled: true };
      if (err instanceof HubUnreachableError || err instanceof TypeError) return { ok: false, unreachable: true };
      throw err;
    }
  }, []);

  return { entry, events, loaded, loadError, reload: load, write };
}
