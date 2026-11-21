'use client';

import { useEffect } from 'react';
import type { CalendarEvent, TimeFormat } from '@/types/config';
import type { Note } from '@/types/notes';
import type { HourlyWeather, WeatherAlert } from '@/lib/weather/types';
import { eventBus } from '@/lib/event-bus';
import { sharedStateStore } from '@/lib/shared-state-store';
import { HOST_STATE_REPUBLISH_MS } from '@/lib/constants';
import { deriveWeatherConditions, deriveWeatherAlerts } from '@/lib/weather/derive';
import { WEATHER_STATE_KEY_LIST, deriveWeatherState, type WeatherStatePayload } from '@/lib/weather-state';
import { CALENDAR_STATE_KEY_LIST, deriveCalendarState } from '@/lib/calendar-state';
import { NOTES_STATE_KEYS, deriveNotesState } from '@/lib/notes-state';

const NOTES_STATE_KEY_LIST: readonly string[] = Object.values(NOTES_STATE_KEYS);

type Facts = Record<string, string | number | boolean>;

/**
 * One producer of host facts on the tab's shared-state bus: derive from the
 * payload, publish every entry, and derive again on a timer so facts that go
 * stale on the clock ("in 12 minutes", "today", a note that expires) move
 * along between fetches without touching React state. A ticking `useState`
 * here would re-render the whole rotator every minute on a Pi; only modules
 * subscribed to these exact keys re-render.
 *
 * No payload means nothing is being fetched: the source is not set up, or
 * the first fetch has not landed. The producer has no values then, so the
 * keys are released instead of the last ones staying frozen on the bus. A
 * failing fetch keeps its last-good payload and never takes that path.
 *
 * `derive` must be stable for unchanged inputs: list what it reads in `deps`.
 */
function usePublishedFacts<T>(
  payload: T | null | undefined,
  keys: readonly string[],
  derive: (payload: T, now: Date) => Facts,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    if (payload == null) {
      for (const key of keys) sharedStateStore.clearKey(key);
      return;
    }
    const tick = () => {
      for (const [key, value] of Object.entries(derive(payload, new Date()))) {
        sharedStateStore.publish(key, String(value));
      }
    };
    tick();
    const timer = setInterval(tick, HOST_STATE_REPUBLISH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `derive` and `keys` are fixed per call site; the caller names what `derive` reads
  }, [payload, ...deps]);
}

export interface HostStateInput {
  /** The household weather source's payload, or nothing while there is none. */
  weather: WeatherStatePayload | null | undefined;
  weatherUnits: 'imperial' | 'metric';
  /** The calendar's events, or nothing while no calendar is set up or loaded. */
  calendarEvents: readonly CalendarEvent[] | null | undefined;
  /** The notes board's live notes, or nothing before they are read. */
  notes: readonly Note[] | null | undefined;
  /** The household's zone, already resolved: never the browser's own. */
  timezone: string | undefined;
  timeFormat: TimeFormat;
  /** The formatting locale, for the clock times among the calendar facts. */
  locale: string;
}

/**
 * Publishes the host's own facts (weather, calendar, notes board) for one
 * tab: the weather events on the event bus and the keys on the shared-state
 * bus. The wall calls it once at its root, so the values survive screen
 * rotation and exist on a display that shows no weather, calendar or notes
 * module. The editor calls it for its canvas, so a Text module's tokens and
 * looks preview with the values the wall will have.
 */
export function useHostStatePublisher({
  weather, weatherUnits, calendarEvents, notes, timezone, timeFormat, locale,
}: HostStateInput): void {
  useEffect(() => {
    if (!weather) return;
    const raw = weather as { hourly?: HourlyWeather[]; alerts?: WeatherAlert[] };
    const conditions = deriveWeatherConditions(raw.hourly ?? [], weatherUnits);
    if (conditions) eventBus.publish('weather.conditions', conditions);

    const alertsEvent = deriveWeatherAlerts(raw.alerts);
    if (alertsEvent) eventBus.publish('weather.alerts', alertsEvent);
  }, [weather, weatherUnits]);

  usePublishedFacts(
    weather,
    WEATHER_STATE_KEY_LIST,
    (payload, now) => deriveWeatherState(payload, now, { timezone }),
    [timezone],
  );

  usePublishedFacts(
    calendarEvents,
    CALENDAR_STATE_KEY_LIST,
    (events, now) => deriveCalendarState(events as CalendarEvent[], now, { timezone, timeFormat, locale }),
    [timezone, timeFormat, locale],
  );

  usePublishedFacts(notes, NOTES_STATE_KEY_LIST, deriveNotesState, []);
}
