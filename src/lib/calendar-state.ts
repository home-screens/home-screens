/**
 * Calendar facts published on the shared-state bus, so the rest of the
 * installation can react to the household's schedule: module visibility
 * conditions ("show the Leaving Soon banner when the next event is under
 * 30 minutes away"), display rules, and Text-module tokens
 * (`{calendar.next_event_title}`).
 *
 * Published by `useSharedDisplayData` — the display-level fetch, not a
 * calendar module — so the values survive screen rotation and exist even on
 * a display that never shows a calendar. They describe the whole shared
 * feed: per-module `sourceFilter`, title filters and event rules are
 * render-time concerns and deliberately do NOT narrow what is published,
 * since two calendar modules on one display would otherwise disagree about
 * what "the next event" is.
 *
 * `next_event_*` covers **timed** events only. All-day rows (birthdays,
 * holidays, "Dad away") have no clock-time start to count down to — the
 * modules already treat their countdowns as a separate opt-in
 * (`countdownAllDay`), and a 480-minute countdown to midnight is not what
 * anyone means by "the next thing on the schedule". Today's all-day events
 * are reported by `all_day_today` instead.
 *
 * Lifecycle, and why it is all-or-nothing: while the calendar is being
 * fetched, EVERY key is published on every tick, empty-valued when there is
 * nothing upcoming. Publishing empty rather than clearing is what keeps the
 * display rules working — `advanceRuleEngine` refuses to arm an
 * `unknown -> true` edge whose key only just became known
 * (`display-rules.ts`, `newlyKnown`), so a key that disappears whenever the
 * schedule goes quiet would make the first rule after every quiet spell
 * silently not fire. An always-known key turns that same moment into an
 * ordinary `false -> true` edge, which arms.
 *
 * Clearing is reserved for the one case where the producer genuinely no
 * longer exists: no calendar source configured, so nothing is fetched at all
 * (`clearCalendarState`). The cold-start guard then works in our favour — a
 * calendar removed and later re-added must not fire rules off its first
 * publish.
 */

import { startOfDay } from 'date-fns';
import type { CalendarEvent, TimeFormat } from '@/types/config';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n';
import { formatEventTime, isAllDayEvent, isEventOnDay, parseEventWallTime } from '@/lib/calendar-utils';

/** Bus keys, in the order the editor's picker lists them. */
export const CALENDAR_STATE_KEYS = {
  nextEventTitle: 'calendar.next_event_title',
  /** Machine-readable: the source's own start string, offset and all. */
  nextEventStart: 'calendar.next_event_start',
  /** Human-readable companion to `nextEventStart`, for text tokens. */
  nextEventTime: 'calendar.next_event_time',
  nextEventInMinutes: 'calendar.next_event_in_minutes',
  eventsToday: 'calendar.events_today',
  busyNow: 'calendar.busy_now',
  allDayToday: 'calendar.all_day_today',
} as const;

/** Every key this producer owns, for the caller's clear path. */
export const CALENDAR_STATE_KEY_LIST: readonly string[] = Object.values(CALENDAR_STATE_KEYS);

export interface CalendarStateOptions {
  /** Display timezone; event instants are read on its wall clock. */
  timezone?: string;
  /** Household 12h/24h preference, for the human-readable time. */
  timeFormat: TimeFormat;
  /** BCP-47 tag driving that same time string. */
  locale: string;
}

/**
 * Derive the bus values from the shared feed. Always returns every key; the
 * next-event three are empty strings when nothing is upcoming (see the
 * lifecycle note above).
 *
 * `now` must be the display's wall clock (`createTZDate(timezone)`) and
 * `opts.timezone` the display timezone, matching every other calendar
 * surface: event instants are read on the same wall clock via
 * `parseEventWallTime`, so a hub in one zone driving a display in another
 * still buckets events by the display's day and counts down on the
 * display's clock.
 */
export function deriveCalendarState(
  events: readonly CalendarEvent[],
  now: Date,
  opts: CalendarStateOptions,
): Record<string, string> {
  const { timezone } = opts;
  let next: { event: CalendarEvent; start: Date } | null = null;
  let busyNow = false;
  let eventsToday = 0;
  let allDayToday = false;

  // `isEventOnDay` takes a day start (every other caller passes a grid
  // cell's date); handing it `now` would count tomorrow's all-day events as
  // today's, since its all-day test is `start < date + 1 day`.
  const today = startOfDay(now);

  for (const ev of events) {
    const allDay = isAllDayEvent(ev);

    if (isEventOnDay(ev, today, timezone)) {
      eventsToday += 1;
      if (allDay) allDayToday = true;
    }

    // All-day rows carry no clock time: they can neither be "the next event"
    // nor make the household busy (a public holiday is not a commitment).
    if (allDay) continue;

    const start = parseEventWallTime(ev.start, timezone);
    if (start > now) {
      if (!next || start < next.start) next = { event: ev, start };
      continue;
    }
    if (parseEventWallTime(ev.end, timezone) > now) busyNow = true;
  }

  return {
    [CALENDAR_STATE_KEYS.eventsToday]: String(eventsToday),
    [CALENDAR_STATE_KEYS.busyNow]: String(busyNow),
    [CALENDAR_STATE_KEYS.allDayToday]: String(allDayToday),
    [CALENDAR_STATE_KEYS.nextEventTitle]: next ? next.event.title : '',
    // The raw feed string, not the wall-shifted Date: consumers that re-parse
    // it (a plugin, a future rule) must see the true instant with its original
    // zone, exactly as the source published it. `nextEventTime` below is the
    // one people put on screen.
    [CALENDAR_STATE_KEYS.nextEventStart]: next ? next.event.start : '',
    [CALENDAR_STATE_KEYS.nextEventTime]: next
      ? formatEventTime(next.start, opts.timeFormat, opts.locale)
      : '',
    // Rounded up, so a condition written as "under 30 minutes" doesn't fire a
    // minute early on an event 30 minutes and 10 seconds out.
    [CALENDAR_STATE_KEYS.nextEventInMinutes]: next
      ? String(Math.ceil((next.start.getTime() - now.getTime()) / 60_000))
      : '',
  };
}

/**
 * The keys the editor's condition picker, rules editor and Text-token picker
 * offer for the calendar. Labels are the household-facing wording, so they
 * are translated rather than baked in like a plugin manifest's.
 */
export function calendarProvidedStateKeys(t: TranslateFn): ProvidedStateKey[] {
  return [
    { key: CALENDAR_STATE_KEYS.nextEventTitle, label: t('stateKeys.calendar.nextEventTitle') },
    {
      key: CALENDAR_STATE_KEYS.nextEventStart,
      // The sample is the point: it shows at a glance that this key is the
      // machine-readable one, so the picker steers text-token users to
      // `nextEventTime` below instead of onto a raw timestamp.
      label: t('stateKeys.calendar.nextEventStart'),
      sampleValues: ['2026-08-24T17:00:00-05:00'],
    },
    {
      key: CALENDAR_STATE_KEYS.nextEventTime,
      label: t('stateKeys.calendar.nextEventTime'),
      sampleValues: ['3:30 PM'],
    },
    {
      key: CALENDAR_STATE_KEYS.nextEventInMinutes,
      label: t('stateKeys.calendar.nextEventInMinutes'),
      sampleValues: ['15', '90'],
    },
    { key: CALENDAR_STATE_KEYS.eventsToday, label: t('stateKeys.calendar.eventsToday'), sampleValues: ['0', '3'] },
    { key: CALENDAR_STATE_KEYS.busyNow, label: t('stateKeys.calendar.busyNow'), sampleValues: ['true', 'false'] },
    { key: CALENDAR_STATE_KEYS.allDayToday, label: t('stateKeys.calendar.allDayToday'), sampleValues: ['true', 'false'] },
  ];
}
