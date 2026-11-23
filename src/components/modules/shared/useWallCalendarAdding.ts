'use client';

import { useCallback, useEffect, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import { grownUpFetch, isGrownUpCancelled } from '@/lib/grown-up-client';
import { displayCache } from '@/lib/display-cache';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { isCalendarReadUrl } from '@/lib/calendar-sources';
import { useWallCalendarEntry } from '@/components/display/wall-calendar-entry-context';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import type { ChangeScope } from '@/lib/calendar-write';
import type { CalendarEvent } from '@/types/config';

/** How a Remove pressed on the wall ended. */
export type WallRemoveResult =
  | { ok: true }
  /** Nobody gave the grown-up code: nothing was sent and nothing needs saying. */
  | { ok: false; cancelled: true }
  /** The hub turned it down. `body` is its answer, whose code names the sentence to show; null when it had none. */
  | { ok: false; body: unknown }
  /** The hub never answered. */
  | { ok: false; unreachable: true };

/** What a calendar module on this wall may do with events, once the hub says adding is on. */
export interface WallCalendarAdding {
  entry: CalendarEntryInfo;
  /**
   * Remove one event, or every time for a repeating one. An event that was
   * already gone counts as removed. `why` is what the grown-up code pad
   * says, when the household asks for the code before a removal.
   */
  remove: (event: CalendarEvent, scope: ChangeScope, why: string) => Promise<WallRemoveResult>;
}

/**
 * Adding events on this wall: null unless the household turned adding on, a
 * calendar takes events, this wall allows it (its own switch, else the
 * household's) and the module shows it (`moduleAllows`, the module's "Add
 * events from a day" option). Read again when the calendar revision moves,
 * which a change of the household's settings or a sign-in does.
 */
export function useWallCalendarAdding(moduleAllows: boolean): WallCalendarAdding | null {
  const wallAllows = useWallCalendarEntry();
  const wanted = wallAllows && moduleAllows;
  const [entry, setEntry] = useState<CalendarEntryInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await displayFetch('/api/calendar/entry');
      if (res.ok) setEntry((await res.json()) as CalendarEntryInfo);
    } catch { /* the next revision or mount tries again */ }
  }, []);

  useEffect(() => {
    if (!wanted) return;
    void load();
    let last: string | undefined;
    return subscribeRevisions((revisions) => {
      if (revisions.calendar === undefined || revisions.calendar === last) return;
      const first = last === undefined;
      last = revisions.calendar;
      if (!first) void load();
    });
  }, [wanted, load]);

  const remove = useCallback(async (event: CalendarEvent, scope: ChangeScope, why: string): Promise<WallRemoveResult> => {
    try {
      const res = await grownUpFetch(displayFetch, why)(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, seriesId: event.seriesId, ...(event.sourceRef ? { sourceRef: event.sourceRef, etag: event.etag } : {}) }),
      });
      if (res.ok) {
        // The hub moved the calendar revision; read now rather than at the next beat.
        displayCache.refreshWhere(isCalendarReadUrl);
        return { ok: true };
      }
      const body = await res.json().catch(() => null) as { code?: string } | null;
      // The wall's copy is older than the calendar's. Nothing moved the
      // revision, so read here: the next press then sends the newer copy.
      if (body?.code === 'calendarWrite.changedElsewhere') displayCache.refreshWhere(isCalendarReadUrl);
      return { ok: false, body };
    } catch (err) {
      return isGrownUpCancelled(err) ? { ok: false, cancelled: true } : { ok: false, unreachable: true };
    }
  }, []);

  if (!wanted || !entry || entry.calendars.length === 0) return null;
  return { entry, remove };
}
