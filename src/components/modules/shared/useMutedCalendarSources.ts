'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LegendRow } from '@/lib/calendar-legend';

/** Calendar sources the viewer has hidden by tapping their legend row. */
const MUTED_SOURCES_KEY = 'hs.calendar.mutedSources';
const EMPTY: ReadonlySet<string> = new Set();

export interface MutedCalendarSources {
  /** Source ids currently hidden. */
  muted: ReadonlySet<string>;
  /** Hide or restore every source a legend row stands for. */
  toggle: (row: LegendRow) => void;
  /** Drop hidden sources from a list. Call AFTER building the legend. */
  filter: <T extends { sourceId?: string }>(events: T[]) => T[];
}

/**
 * Tap-to-hide state for calendar legends, shared by the compact and
 * fullscreen calendar modules.
 *
 * Persisted in localStorage, so it survives screen rotation and a Chromium
 * restart. Deliberately NOT in `config.json`: a tap on the display must
 * never rewrite the layout (the same rule a to-do tick follows), or the wall
 * and the editor fight over one file.
 *
 * One shared key rather than one per module instance. "Hide this calendar"
 * reads as a household decision, and a source hidden on the dashboard but
 * still drawn on the month grid would be worse than either behaviour alone.
 *
 * CALLERS MUST build their legend from the UNFILTERED events and apply
 * `filter` afterwards. Filtering first removes the hidden calendar's own
 * legend row, which is the only way back — the row stays, dimmed and struck
 * through, precisely so it can be tapped again.
 */
export function useMutedCalendarSources(): MutedCalendarSources {
  const [muted, setMuted] = useState<ReadonlySet<string>>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MUTED_SOURCES_KEY);
      if (raw) setMuted(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* unreadable storage just means nothing is hidden */
    }
  }, []);

  const toggle = useCallback((row: LegendRow) => {
    setMuted((prev) => {
      const next = new Set(prev);
      // A row can stand for several sources (a person with two calendars):
      // hide them together, restore them together.
      const allHidden = row.sourceIds.every((id) => next.has(id));
      for (const id of row.sourceIds) {
        if (allHidden) next.delete(id);
        else next.add(id);
      }
      try {
        localStorage.setItem(MUTED_SOURCES_KEY, JSON.stringify([...next]));
      } catch {
        /* a full or blocked store just means it won't survive a reload */
      }
      return next;
    });
  }, []);

  const filter = useCallback(
    <T extends { sourceId?: string }>(events: T[]): T[] =>
      muted.size === 0
        ? events
        : events.filter((ev) => !(ev.sourceId !== undefined && muted.has(ev.sourceId))),
    [muted],
  );

  return { muted, toggle, filter };
}
