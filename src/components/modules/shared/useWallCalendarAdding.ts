'use client';

import { useCallback, useEffect, useState } from 'react';
import { displayFetch } from '@/lib/display-fetch';
import { grownUpFetch } from '@/lib/grown-up-client';
import { displayCache } from '@/lib/display-cache';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { isCalendarReadUrl } from '@/lib/calendar-sources';
import { useWallCalendarEntry } from '@/components/display/wall-calendar-entry-context';
import type { CalendarEntryInfo } from '@/lib/calendar-event-writes';
import type { ChangeScope } from '@/lib/calendar-write';
import type { CalendarEvent } from '@/types/config';

/** What a calendar module on this wall may do with events, once the hub says adding is on. */
export interface WallCalendarAdding {
  entry: CalendarEntryInfo;
  /**
   * Remove one event, or every time for a repeating one. True when it went
   * through. `why` is what the grown-up code pad says, when the household
   * asks for the code before a removal.
   */
  remove: (event: CalendarEvent, scope: ChangeScope, why: string) => Promise<boolean>;
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

  const remove = useCallback(async (event: CalendarEvent, scope: ChangeScope, why: string) => {
    try {
      const res = await grownUpFetch(displayFetch, why)(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, seriesId: event.seriesId, ...(event.sourceRef ? { sourceRef: event.sourceRef, etag: event.etag } : {}) }),
      });
      if (!res.ok) return false;
      // The hub moved the calendar revision; read now rather than at the next beat.
      displayCache.refreshWhere(isCalendarReadUrl);
      return true;
    } catch {
      // Nobody gave the grown-up code, or the hub did not answer: the question stays open.
      return false;
    }
  }, []);

  if (!wanted || !entry || entry.calendars.length === 0) return null;
  return { entry, remove };
}
