import type { CalendarEvent } from '@/types/config';

/**
 * Shared fixtures for the calendar unit tests, so per-file builders can't
 * quietly drift apart (e.g. one setting `allDay: false` and another leaving
 * it undefined, which matters because `isAllDayEvent` also sniffs date-only
 * strings).
 */

/**
 * A fixed midweek instant, not the real clock. Modules read the current
 * time to decide which week and month to show, so fixtures built off the
 * real clock drift across those boundaries: run in the first three hours of
 * a Sunday and "three hours ago" lands on Saturday, which a Sunday-start
 * week view correctly puts in the *previous* week — a real 1.8%-of-the-week
 * failure that only shows up when CI's timezone disagrees with the
 * developer's. Noon on a Wednesday leaves three clear days on either side.
 */
export const NOW = new Date(2026, 6, 15, 12, 0, 0); // Wednesday, 15 July 2026

/** date-fns pattern for local-naive ISO strings (no zone suffix), so date
 *  parsing reads the literal clock hour in any machine timezone. */
export const LOCAL = "yyyy-MM-dd'T'HH:mm:ss";

/** One timed event with the base fields every calendar test needs; override
 *  what the case cares about (files layer their own defaults on top). */
export function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: over.id ?? 'e1',
    title: 'Soccer practice',
    start: '2026-08-20T16:30:00',
    end: '2026-08-20T18:00:00',
    allDay: false,
    ...over,
  };
}
