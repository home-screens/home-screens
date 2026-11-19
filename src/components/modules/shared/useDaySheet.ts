'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { daySheetHeading } from '@/lib/calendar-day-sheet';
import { dayNotesFor, type DayNotes } from '@/lib/day-notes';
import { localISODate } from '@/lib/timezone';
import type { TranslateFn } from '@/i18n';
import type { CalendarEvent } from '@/types/config';

/** Opens the day sheet for `date` with the events the tapped cell had. */
export type OpenDaySheet = (date: Date, events: readonly CalendarEvent[]) => void;

/**
 * The opener for the calendar module a view is drawn in, or null when
 * "Tap an event to see details" is off. A view with no opener draws its
 * "+N more" and day numbers exactly as before: plain text, nothing to tap.
 */
export const DaySheetContext = createContext<OpenDaySheet | null>(null);

export function useDaySheetOpener(): OpenDaySheet | null {
  return useContext(DaySheetContext);
}

/**
 * What turns a grid's "+N more", or its day number, into a way into the day:
 * a click handler and a label naming the day (`data-open-day` carries the date
 * for tests). Undefined while the module has taps off, and for a day with
 * nothing on it, so the element stays the plain text it always was. A day
 * with no events but a note of the family's (`hasNotes`) opens too: the sheet
 * is where a note cut short in a cell can be read whole.
 */
export function openDayProps(
  open: OpenDaySheet | null,
  date: Date,
  events: readonly CalendarEvent[],
  t: TranslateFn,
  locale: string,
  hasNotes = false,
): { onClick: () => void; 'aria-label': string; 'data-open-day': string } | undefined {
  if (!open || (events.length === 0 && !hasNotes)) return undefined;
  return {
    onClick: () => open(date, events),
    'aria-label': t('calendar.daySheet.openDay', { date: daySheetHeading(date, locale).full }),
    'data-open-day': localISODate(date),
  };
}

/**
 * The rest of a grid's day cell as a way into the day: a tap anywhere in the
 * cell opens it, so a finger does not have to find the thin day number. A tap
 * on an event is left to the module's event detail (`useEventTapDetail`), and
 * one on the cell's day number or "+N more" to their own handler. This is for
 * a finger only: the day number stays the cell's one button for a keyboard
 * or a screen reader, rather than a button wrapped around the event buttons.
 * Undefined while the module has taps off, and for a day with nothing on it
 * (no events, and no note when `hasNotes` is passed).
 * `data-day-cell` carries the date for tests.
 */
export function openDayCellProps(
  open: OpenDaySheet | null,
  date: Date,
  events: readonly CalendarEvent[],
  hasNotes = false,
): { onClick: (e: React.MouseEvent<HTMLElement>) => void; 'data-day-cell': string } | undefined {
  if (!open || (events.length === 0 && !hasNotes)) return undefined;
  return {
    onClick: (e) => {
      const handled = (e.target as Element).closest?.('[data-event-id], [data-open-day]');
      if (handled && e.currentTarget.contains(handled)) return;
      open(date, events);
    },
    'data-day-cell': localISODate(date),
  };
}

/**
 * The open day sheet of a calendar module, shared by both modules like
 * `useEventTapDetail`. A view hands over the day and the events its cell
 * listed; only their ids are kept, and each render looks them up again in the
 * module's events, so a data refresh updates the open sheet (and drops an
 * event that was removed) instead of showing a stale copy. The opener is
 * stable, so the memoized views never re-render because a sheet opened, and
 * it is null while the feature is off. Turning the feature off closes an open
 * sheet, so turning it back on never reopens one unprompted.
 *
 * The day's notes are looked up the same way, from `dayNotes`, so a sheet
 * shows a note saved from the phone while it is open. A sheet with no event
 * left closes unless the day has a note, which is enough to keep it.
 */
export function useDaySheet(events: readonly CalendarEvent[], enabled: boolean, dayNotes?: DayNotes): {
  opener: OpenDaySheet | null;
  day: { date: Date; events: CalendarEvent[]; notes: readonly string[] } | null;
  close: () => void;
} {
  const [open, setOpen] = useState<{ date: Date; ids: string[] } | null>(null);
  useEffect(() => {
    if (!enabled) setOpen(null);
  }, [enabled]);
  const openDay = useCallback<OpenDaySheet>((date, cellEvents) => {
    setOpen({ date, ids: cellEvents.map((ev) => ev.id) });
  }, []);
  const close = useCallback(() => setOpen(null), []);
  const day = useMemo(() => {
    if (!enabled || !open) return null;
    const byId = new Map(events.map((ev) => [ev.id, ev]));
    const dayEvents = open.ids.flatMap((id) => byId.get(id) ?? []);
    const notes = dayNotesFor(dayNotes, open.date);
    return dayEvents.length > 0 || notes.length > 0 ? { date: open.date, events: dayEvents, notes } : null;
  }, [enabled, open, events, dayNotes]);
  return { opener: enabled ? openDay : null, day, close };
}
