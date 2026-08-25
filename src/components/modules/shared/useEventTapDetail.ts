'use client';

import { useEffect, useState } from 'react';
import type { CalendarEvent } from '@/types/config';

/**
 * Tap-to-open event detail, shared by both calendar modules: one delegated
 * handler on the module root instead of a callback threaded through every
 * view. Every event element carries `data-event-id`, so `closest()` maps a
 * tap back to its event. State holds the id, not the event object: the
 * event is re-resolved each render so a data refresh updates the open
 * overlay (or closes it if the event is gone) instead of showing a stale
 * snapshot. Config is live-pushed without a remount, so turning the
 * feature off must also clear the selection — re-enabling would otherwise
 * reopen it unprompted.
 */
export function useEventTapDetail(events: CalendarEvent[], enabled: boolean): {
  detailEvent: CalendarEvent | null;
  onRootClick: ((e: React.MouseEvent) => void) | undefined;
  close: () => void;
} {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEvent = enabled && detailId ? events.find((ev) => ev.id === detailId) ?? null : null;
  useEffect(() => {
    if (!enabled) setDetailId(null);
  }, [enabled]);
  const onRootClick = enabled
    ? (e: React.MouseEvent) => {
        const id = (e.target as HTMLElement).closest?.('[data-event-id]')?.getAttribute('data-event-id');
        if (id) setDetailId(id);
      }
    : undefined;
  return { detailEvent, onRootClick, close: () => setDetailId(null) };
}
