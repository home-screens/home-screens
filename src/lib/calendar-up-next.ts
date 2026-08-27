import { addDays, isSameDay } from 'date-fns';
import { compareEventStarts, isEventOnDay, parseEventWallTime } from '@/lib/calendar-utils';
import type { CalendarEvent } from '@/types/config';

/**
 * The selection model behind the fullscreen calendar's Up Next view: one
 * hero event (what is next, or what is running when nothing else is
 * coming), then short lists for the rest of the hero's day, what already
 * happened today, and tomorrow. Pure so the hero/exclusion edges are
 * unit-testable without rendering the view.
 */

/** A timed event with its parsed display-wall bounds. */
export interface UpNextTimedEvent {
  ev: CalendarEvent;
  start: Date;
  end: Date;
}

/** Cap on the configurable "later on the hero's day" list. */
export const UP_NEXT_LATER_MAX = 6;
/** Finished rows kept under "Earlier" (running rows are never capped). */
const EARLIER_MAX = 2;
const TOMORROW_MAX = 5;

export interface UpNextModel {
  hero: UpNextTimedEvent | null;
  /** The hero is a running event standing in because nothing is upcoming. */
  heroIsRunning: boolean;
  /** The day the hero sits on (today when there is no hero). */
  heroDay: Date;
  heroToday: boolean;
  later: UpNextTimedEvent[];
  /** In progress right now, never the hero. Its own section in the view. */
  running: UpNextTimedEvent[];
  /** Already ended today. Finished only — see `running`. */
  earlier: UpNextTimedEvent[];
  allDayToday: CalendarEvent[];
  tomorrowRows: CalendarEvent[];
  remainingToday: number;
  hasAnyUpcoming: boolean;
  tomorrow: Date;
}

export function buildUpNextModel(
  events: CalendarEvent[],
  now: Date,
  today: Date,
  opts: { timezone?: string; laterCount: number; showEarlier: boolean; showTomorrow: boolean },
): UpNextModel {
  const { timezone, laterCount, showEarlier, showTomorrow } = opts;
  const tomorrow = addDays(today, 1);
  const timed: UpNextTimedEvent[] = events
    .filter((ev) => !ev.allDay)
    .map((ev) => ({ ev, start: parseEventWallTime(ev.start, timezone), end: parseEventWallTime(ev.end, timezone) }));
  const upcoming = timed.filter((x) => x.start > now).sort((a, b) => a.start.getTime() - b.start.getTime());
  const running = timed.filter((x) => x.start <= now && x.end > now).sort((a, b) => a.end.getTime() - b.end.getTime());
  const finishedToday = timed
    .filter((x) => x.end <= now && isSameDay(x.end, today))
    .sort((a, b) => b.end.getTime() - a.end.getTime());

  const hero = upcoming[0] ?? running[0] ?? null;
  const heroIsRunning = hero != null && upcoming.length === 0;
  const heroDay = hero ? hero.start : today;
  const heroToday = hero ? isSameDay(hero.start, today) : true;
  const later = hero
    ? upcoming.filter((x) => x !== hero && isSameDay(x.start, hero.start)).slice(0, laterCount)
    : [];
  // Running and finished are separate sections: a row reading "13 min left"
  // filed under "Earlier today" says it already happened. Running rows always
  // show; only the finished list is capped, so a running hero never buys an
  // extra "Done" row.
  const runningRows = showEarlier ? running.filter((x) => x !== hero) : [];
  const earlier = showEarlier ? finishedToday.slice(0, EARLIER_MAX) : [];
  const allDayToday = events.filter((ev) => ev.allDay && isEventOnDay(ev, today, timezone));
  // Tomorrow shows whatever the sections above did not already draw: the
  // hero can sit on any future day (and all-day events never hero), so
  // exclude drawn ids instead of gating the section on the hero being today.
  // A still-running multi-day event is the Now/Earlier story, not
  // tomorrow's schedule, so it never rides the Tomorrow list either.
  const runningIds = new Set(running.map((x) => x.ev.id));
  const shownIds = new Set([
    ...(hero ? [hero.ev.id] : []),
    ...later.map((x) => x.ev.id),
    ...allDayToday.map((ev) => ev.id),
  ]);
  const tomorrowRows = showTomorrow
    ? events
        .filter((ev) => isEventOnDay(ev, tomorrow, timezone) && !shownIds.has(ev.id) && !runningIds.has(ev.id))
        .sort((a, b) => (a.allDay === b.allDay ? compareEventStarts(a.start, b.start) : a.allDay ? -1 : 1))
        .slice(0, TOMORROW_MAX)
    : [];
  const remainingToday = upcoming.filter((x) => isSameDay(x.start, today)).length;
  return { hero, heroIsRunning, heroDay, heroToday, later, running: runningRows, earlier, allDayToday, tomorrowRows, remainingToday, hasAnyUpcoming: upcoming.length > 0, tomorrow };
}
