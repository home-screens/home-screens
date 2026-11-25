'use client';

import { useCallback, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
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
 * How often an open Calendar tab reads again. The phone takes no heartbeat,
 * so this is how a calendar renamed in Settings, or an event added on the
 * wall, reaches a phone that was already showing the tab. The hub's
 * calendar answer is cached, so a read between changes costs it nothing.
 */
const CALENDAR_TAB_POLL_MS = 60_000;

/**
 * The phone's Calendar tab data: what adding offers (`/api/calendar/entry`)
 * and the events for the days on screen (`/api/calendar`), read again after
 * every change so the list shows what Google or iCloud now holds, every
 * minute while the tab shows, and when the phone comes back to it.
 * `loadError` says the events for those days could not be read (the hub did
 * not answer, or the calendars could not be reached), so empty days are not
 * taken for free ones.
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

  // What adding last offered, for a background read that has to go on without a new answer.
  const entryRef = useRef<CalendarEntryInfo | null>(null);

  /**
   * `quiet`: a read in the background, whose failure keeps what is on screen.
   * That covers an answer the hub turned down as much as one that never
   * came: each half is replaced only by its own good answer, because an open
   * event form lives on `entry` and everything typed in it would go with it.
   */
  const load = useCallback(async (quiet = false) => {
    const mine = ++generation.current;
    try {
      const entryRes = await editorFetch('/api/calendar/entry');
      const answered = entryRes.ok ? (await readJson(entryRes)) as CalendarEntryInfo : null;
      const info = answered ?? (quiet ? entryRef.current : null);
      const zone = info?.timezone;
      const timeMin = parseDateInTZ(`${first}T00:00:00`, zone).toISOString();
      const timeMax = parseDateInTZ(`${addIsoDays(last, 1)}T00:00:00`, zone).toISOString();
      const res = await editorFetch(`/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      const body = res.ok ? (await readJson(res)) as { events?: CalendarEvent[] } : null;
      if (mine !== generation.current) return;
      entryRef.current = info;
      setEntry(info);
      // A 400 is something to set up, not a failure (no calendar at all answers
      // it), and the tab still shows the days and their notes. In the
      // background an error keeps the events already shown, and whether they
      // could be read.
      if (body || !quiet) {
        setEvents(body?.events ?? []);
        setLoadError(!body && res.status !== 400);
      }
    } catch {
      if (mine === generation.current && !quiet) setLoadError(true);
    } finally {
      if (mine === generation.current) setLoaded(true);
    }
  }, [first, last]);

  usePolledFetch(
    (_mounted, reason) => load(reason !== 'setup'),
    [load],
    { intervalMs: CALENDAR_TAB_POLL_MS, pauseWhenHidden: true },
  );

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

  const reload = useCallback(() => load(), [load]);
  return { entry, events, loaded, loadError, reload, write };
}
