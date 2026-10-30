'use client';

import { useMemo } from 'react';
import { useFetchData } from '@/hooks/useFetchData';
import { dayNotesUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { NO_DAY_NOTES, indexDayNotes, type DayNotes } from '@/lib/day-notes';
import type { DayNote } from '@/types/day-notes';

/**
 * The calendar's day notes for a view on the wall or the editor canvas: each
 * day's texts in the order they were written. One shared request however
 * many calendars ask (`useFetchData`), re-read when the heartbeat names a new
 * `dayNotes` revision. Off (the calendar's Day notes switch), loading or
 * failed all read as no notes: a day note must never cost a calendar its
 * events.
 */
export function useDayNotes(enabled: boolean): DayNotes {
  const [data] = useFetchData<{ notes?: DayNote[] }>(
    enabled ? dayNotesUrl() : '',
    FETCH_KEY_REGISTRY['day-notes'].ttlMs,
  );
  // The fetch hands back the same object while the answer is unchanged, so
  // the index (and every memo keyed on it) holds across polls.
  const list = enabled && Array.isArray(data?.notes) ? data.notes : null;
  return useMemo(() => (list ? indexDayNotes(list) : NO_DAY_NOTES), [list]);
}
