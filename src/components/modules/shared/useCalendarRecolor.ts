'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyCalendarOverrides } from '@/lib/calendar-overrides';
import { displayFetch } from '@/lib/display-fetch';
import { logger } from '@/lib/logger';
import type { CalendarEvent, CalendarOverride } from '@/types/config';

const log = logger('useCalendarRecolor');

/**
 * Recolouring a calendar from the wall's Calendars sheet, shared by both
 * calendar modules.
 *
 * `paint` shows a colour on the wall straight away without saving; `save`
 * writes whatever was painted, once, when the sheet closes, so trying four
 * colours costs one write. The caller draws from `events`, which carry the
 * paint, so the key and the events change together.
 *
 * A saved colour takes a few seconds to come back round (the config's
 * revision, then a calendar read), so the paint is held until the fetched
 * events carry it. Dropping it on a timer would flick the calendar back to
 * its old colour and forward again, which reads as the save having failed.
 * A save that does fail drops the paint, so the wall shows what is stored.
 */
export function useCalendarRecolor(events: CalendarEvent[]) {
  const [painted, setPainted] = useState<Record<string, CalendarOverride>>({});
  /** What `save` still has to write: one entry per key row, the last colour tried. */
  const unsaved = useRef(new Map<string, { sourceIds: string[]; color: string }>());

  const drop = useCallback((ids: readonly string[]) => {
    setPainted((current) => {
      if (!ids.some((id) => id in current)) return current;
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
  }, []);

  // Hand over to the saved colour the moment it arrives, with no visible step.
  // A calendar's colour is `sourceColor` on an event somebody coloured on its own.
  useEffect(() => {
    const landed = Object.entries(painted)
      .filter(([id, override]) => {
        if (unsaved.current.size > 0) return false;
        const mine = events.filter((event) => event.sourceId === id);
        return mine.length > 0 && mine.every((event) => (event.sourceColor ?? event.calendarColor) === override.color);
      })
      .map(([id]) => id);
    if (landed.length) drop(landed);
  }, [events, painted, drop]);

  const paint = useCallback((sourceIds: readonly string[], color: string) => {
    const value = color.toLowerCase();
    unsaved.current.set(sourceIds.join('\n'), { sourceIds: [...sourceIds], color: value });
    setPainted((current) => {
      const next = { ...current };
      for (const id of sourceIds) next[id] = { color: value };
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    const writes = [...unsaved.current.values()];
    unsaved.current.clear();
    await Promise.all(writes.map(async ({ sourceIds, color }) => {
      try {
        const res = await displayFetch('/api/calendar/appearance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceIds, color }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        log.warn('Could not save the calendar colour', err);
        drop(sourceIds);
      }
    }));
  }, [drop]);

  const paintedEvents = useMemo(() => applyCalendarOverrides(events, painted), [events, painted]);

  return { events: paintedEvents, paint, save };
}
