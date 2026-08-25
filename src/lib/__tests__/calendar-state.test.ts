import { describe, it, expect } from 'vitest';
import { CALENDAR_STATE_KEYS, CALENDAR_STATE_KEY_LIST, calendarProvidedStateKeys, deriveCalendarState } from '../calendar-state';
import type { CalendarEvent } from '@/types/config';
import { makeEvent } from './helpers/calendar-fixtures';

const K = CALENDAR_STATE_KEYS;

// Wall-clock "now": Thursday 2026-08-20, 15:00.
const now = new Date('2026-08-20T15:00:00');

const opts = { timeFormat: '12h' as const, locale: 'en-US' };
const inTZ = (timezone: string) => ({ ...opts, timezone });

const ev = makeEvent;

function allDay(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return ev({ start: '2026-08-20', end: '2026-08-21', allDay: true, title: 'Ada turns 9', ...over });
}

describe('deriveCalendarState', () => {
  it('publishes every key on an empty feed, next-event values blank', () => {
    // Blank, never absent: a key that vanished whenever the schedule went
    // quiet would make the rule engine's cold-start guard swallow the first
    // edge after every quiet spell (see the lifecycle note in calendar-state).
    expect(deriveCalendarState([], now, opts)).toEqual({
      [K.eventsToday]: '0',
      [K.busyNow]: 'false',
      [K.allDayToday]: 'false',
      [K.nextEventTitle]: '',
      [K.nextEventStart]: '',
      [K.nextEventTime]: '',
      [K.nextEventInMinutes]: '',
    });
  });

  it('covers every advertised key on a populated feed too', () => {
    const values = deriveCalendarState([ev()], now, opts);
    expect(Object.keys(values).sort()).toEqual([...CALENDAR_STATE_KEY_LIST].sort());
  });

  it('picks the earliest event that has not started yet', () => {
    const publish = deriveCalendarState(
      [
        ev({ id: 'late', title: 'Dinner', start: '2026-08-20T19:00:00', end: '2026-08-20T20:00:00' }),
        ev({ id: 'soon', title: 'Pickup', start: '2026-08-20T15:30:00', end: '2026-08-20T16:00:00' }),
      ],
      now,
      opts,
    );
    expect(publish[K.nextEventTitle]).toBe('Pickup');
    expect(publish[K.nextEventStart]).toBe('2026-08-20T15:30:00');
    expect(publish[K.nextEventInMinutes]).toBe('30');
  });

  it('renders the human-readable start on the household clock preference', () => {
    const events = [ev({ start: '2026-08-20T15:30:00', end: '2026-08-20T16:00:00' })];
    expect(deriveCalendarState(events, now, opts)[K.nextEventTime]).toBe('3:30 PM');
    expect(deriveCalendarState(events, now, { ...opts, timeFormat: '24h' })[K.nextEventTime]).toBe('15:30');
    expect(deriveCalendarState(events, now, { ...opts, locale: 'de-DE', timeFormat: '24h' })[K.nextEventTime]).toBe('15:30');
  });

  it('rounds the countdown up so an "under 30 minutes" condition never fires early', () => {
    const publish = deriveCalendarState(
      [ev({ start: '2026-08-20T15:30:10', end: '2026-08-20T16:00:00' })],
      now,
      opts,
    );
    expect(publish[K.nextEventInMinutes]).toBe('31');
  });

  it('skips events already under way and reports them as busy instead', () => {
    const publish = deriveCalendarState(
      [ev({ title: 'Standup', start: '2026-08-20T14:30:00', end: '2026-08-20T15:30:00' })],
      now,
      opts,
    );
    expect(publish[K.busyNow]).toBe('true');
    expect(publish[K.nextEventTitle]).toBe('');
    expect(publish[K.nextEventInMinutes]).toBe('');
  });

  it('is not busy once an event has ended', () => {
    const publish = deriveCalendarState(
      [ev({ start: '2026-08-20T13:00:00', end: '2026-08-20T14:00:00' })],
      now,
      opts,
    );
    expect(publish[K.busyNow]).toBe('false');
  });

  it('counts an overnight event as busy on its second day', () => {
    const publish = deriveCalendarState(
      [ev({ title: 'Night shift', start: '2026-08-19T22:00:00', end: '2026-08-20T18:00:00' })],
      now,
      opts,
    );
    expect(publish[K.busyNow]).toBe('true');
    expect(publish[K.eventsToday]).toBe('1');
  });

  it('never treats an all-day row as the next event or as busy', () => {
    const publish = deriveCalendarState([allDay()], now, opts);
    expect(publish[K.nextEventTitle]).toBe('');
    expect(publish[K.busyNow]).toBe('false');
    expect(publish[K.allDayToday]).toBe('true');
    expect(publish[K.eventsToday]).toBe('1');
  });

  it("does not count tomorrow's all-day event as today's", () => {
    const publish = deriveCalendarState(
      [allDay({ start: '2026-08-21', end: '2026-08-22', title: 'Bank holiday' })],
      now,
      opts,
    );
    expect(publish[K.allDayToday]).toBe('false');
    expect(publish[K.eventsToday]).toBe('0');
  });

  it('counts a multi-day all-day event on each day it covers', () => {
    const publish = deriveCalendarState(
      [allDay({ start: '2026-08-18', end: '2026-08-25', title: 'Dad away' })],
      now,
      opts,
    );
    expect(publish[K.allDayToday]).toBe('true');
  });

  it('counts finished, running and upcoming events in the day total', () => {
    const publish = deriveCalendarState(
      [
        ev({ id: 'done', start: '2026-08-20T08:00:00', end: '2026-08-20T09:00:00' }),
        ev({ id: 'now', start: '2026-08-20T14:30:00', end: '2026-08-20T15:30:00' }),
        ev({ id: 'later', start: '2026-08-20T19:00:00', end: '2026-08-20T20:00:00' }),
        ev({ id: 'tomorrow', start: '2026-08-21T09:00:00', end: '2026-08-21T10:00:00' }),
      ],
      now,
      opts,
    );
    expect(publish[K.eventsToday]).toBe('3');
  });

  it('reads events on the display timezone, not the OS one', () => {
    // Auckland is UTC+12 in August. 06:00Z is 18:00 the same day there —
    // three hours after an Auckland "now" of 15:00 — while 14:00Z has already
    // rolled over to 02:00 on the 21st. A US-or-UTC OS clock reads both as
    // the morning of the 20th and would call them past.
    const events = [
      ev({ id: 'swim', title: 'Swim', start: '2026-08-20T06:00:00Z', end: '2026-08-20T07:00:00Z' }),
      ev({ id: 'flight', title: 'Flight', start: '2026-08-20T14:00:00Z', end: '2026-08-20T15:00:00Z' }),
    ];
    const publish = deriveCalendarState(events, now, inTZ('Pacific/Auckland'));
    expect(publish[K.nextEventTitle]).toBe('Swim');
    expect(publish[K.nextEventInMinutes]).toBe('180');
    expect(publish[K.busyNow]).toBe('false');
    // Only the swim is on the Auckland 20th; the flight has crossed midnight.
    expect(publish[K.eventsToday]).toBe('1');
  });

  it('publishes the start as the source wrote it, zone and all', () => {
    const publish = deriveCalendarState(
      [ev({ start: '2026-08-20T16:30:00-05:00', end: '2026-08-20T18:00:00-05:00' })],
      now,
      inTZ('America/Chicago'),
    );
    expect(publish[K.nextEventStart]).toBe('2026-08-20T16:30:00-05:00');
    // …while the human-readable companion is the display's clock reading.
    expect(publish[K.nextEventTime]).toBe('4:30 PM');
  });
});

describe('calendarProvidedStateKeys', () => {
  it('advertises every published key, labelled through the translator', () => {
    const keys = calendarProvidedStateKeys((key) => `t:${key}`);
    expect(keys.map((k) => k.key)).toEqual(Object.values(CALENDAR_STATE_KEYS));
    expect(keys.every((k) => k.label.startsWith('t:stateKeys.calendar.'))).toBe(true);
  });
});
