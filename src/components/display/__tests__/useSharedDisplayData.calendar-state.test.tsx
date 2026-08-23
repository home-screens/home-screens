// @vitest-environment jsdom

/**
 * The display-level half of the calendar shared-state feature: the derived
 * facts must actually reach the bus, keep up with the wall clock between
 * five-minute fetches, and cost nothing when there is no calendar.
 *
 * The derivation itself is covered by `lib/__tests__/calendar-state.test.ts`;
 * this file only asserts the wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CalendarEvent, GlobalSettings } from '@/types/config';
import { useSharedDisplayData } from '../useSharedDisplayData';
import { sharedStateStore } from '@/lib/shared-state-store';
import { CALENDAR_STATE_KEYS as K, CALENDAR_STATE_KEY_LIST } from '@/lib/calendar-state';

const { payload } = vi.hoisted(() => ({ payload: { events: [] as CalendarEvent[] } }));

vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) =>
    (url.startsWith('/api/calendar') ? [payload, null, Date.now()] : [null, null]),
}));

function makeSettings(): GlobalSettings {
  return {
    timezone: 'UTC',
    latitude: 0,
    longitude: 0,
    weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
    calendar: { googleCalendarIds: ['family@example.com'], icalSources: [], maxEvents: 10, daysAhead: 30 },
  } as unknown as GlobalSettings;
}

/** No source configured, so `buildCalendarUrl` returns '' and nothing fetches. */
function makeSourcelessSettings(): GlobalSettings {
  const s = makeSettings();
  return { ...s, calendar: { ...s.calendar, googleCalendarIds: [] } };
}

function value(key: string): string | undefined {
  return sharedStateStore.snapshot().get(key)?.value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T15:00:00Z'));
  payload.events = [];
  sharedStateStore.__resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSharedDisplayData calendar shared state', () => {
  it('publishes the derived facts on first render', () => {
    payload.events = [
      { id: 'a', title: 'Pickup', start: '2026-08-20T15:30:00Z', end: '2026-08-20T16:00:00Z', allDay: false },
      { id: 'b', title: 'Ada turns 9', start: '2026-08-20', end: '2026-08-21', allDay: true },
    ];
    renderHook(() => useSharedDisplayData([], makeSettings()));

    expect(value(K.nextEventTitle)).toBe('Pickup');
    expect(value(K.nextEventStart)).toBe('2026-08-20T15:30:00Z');
    expect(value(K.nextEventTime)).toBe('3:30 PM');
    expect(value(K.nextEventInMinutes)).toBe('30');
    expect(value(K.eventsToday)).toBe('2');
    expect(value(K.busyNow)).toBe('false');
    expect(value(K.allDayToday)).toBe('true');
  });

  it('keeps the countdown current between fetches', () => {
    payload.events = [
      { id: 'a', title: 'Pickup', start: '2026-08-20T15:30:00Z', end: '2026-08-20T16:00:00Z', allDay: false },
    ];
    renderHook(() => useSharedDisplayData([], makeSettings()));
    expect(value(K.nextEventInMinutes)).toBe('30');

    // No refetch, no re-render — the interval alone must move the value on.
    vi.advanceTimersByTime(10 * 60_000);
    expect(value(K.nextEventInMinutes)).toBe('20');

    // Once it starts, it stops being "next" and becomes "busy". The
    // next-event keys go blank but stay PUBLISHED — dropping them would make
    // the rule engine swallow the first edge when something is next scheduled
    // (display-rules' newly-known guard).
    vi.advanceTimersByTime(21 * 60_000);
    expect(value(K.busyNow)).toBe('true');
    expect(value(K.nextEventInMinutes)).toBe('');
    expect(value(K.nextEventTitle)).toBe('');
    expect(sharedStateStore.snapshot().get(K.nextEventTitle)?.staleAt).toBeUndefined();
  });

  it('publishes nothing at all when no calendar source is configured', () => {
    renderHook(() => useSharedDisplayData([], makeSourcelessSettings()));
    expect(sharedStateStore.snapshot().size).toBe(0);
  });

  it('releases every key when the last calendar source is removed', () => {
    payload.events = [
      { id: 'a', title: 'Pickup', start: '2026-08-20T15:30:00Z', end: '2026-08-20T16:00:00Z', allDay: false },
    ];
    const { rerender } = renderHook(
      ({ settings }) => useSharedDisplayData([], settings),
      { initialProps: { settings: makeSettings() } },
    );
    expect(value(K.busyNow)).toBe('false');

    // The household deletes their last calendar. `buildCalendarUrl` returns
    // '' and useFetchData nulls its payload, so the producer has no values —
    // the keys must not stay frozen at their last reading forever.
    payload.events = [];
    rerender({ settings: makeSourcelessSettings() });
    vi.advanceTimersByTime(20_000);
    for (const key of CALENDAR_STATE_KEY_LIST) {
      expect(sharedStateStore.snapshot().has(key)).toBe(false);
    }
  });

  it('stops republishing once the display unmounts', () => {
    payload.events = [
      { id: 'a', title: 'Pickup', start: '2026-08-20T15:30:00Z', end: '2026-08-20T16:00:00Z', allDay: false },
    ];
    const { unmount } = renderHook(() => useSharedDisplayData([], makeSettings()));
    unmount();
    vi.advanceTimersByTime(10 * 60_000);
    // Frozen at the value published before unmount, not advanced by a leaked
    // interval (the store is deliberately NOT cleared on unmount — screen
    // rotation must not tombstone keys a live display still owns).
    expect(value(K.nextEventInMinutes)).toBe('30');
  });
});
