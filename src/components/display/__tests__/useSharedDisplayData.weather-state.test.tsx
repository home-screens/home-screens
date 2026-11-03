// @vitest-environment jsdom

/**
 * The display-level half of the weather shared-state feature: the derived
 * facts must reach the bus from the default provider's payload, keep up with
 * the clock between five-minute fetches, and vanish when nothing is fetched.
 *
 * The derivation itself is covered by `lib/__tests__/weather-state.test.ts`;
 * this file only asserts the wiring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { DisplaySettings } from '../useLiveConfig';
import { useSharedDisplayData } from '../useSharedDisplayData';
import { sharedStateStore } from '@/lib/shared-state-store';
import { WEATHER_STATE_KEYS as K, WEATHER_STATE_KEY_LIST } from '@/lib/weather-state';
import type { HourlyWeather } from '@/lib/weather/types';

const { payload } = vi.hoisted(() => ({
  payload: { current: null as { hourly: HourlyWeather[] } | null },
}));

vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) =>
    (url.startsWith('/api/weather') && url.includes('provider=weatherapi') ? [payload.current, null] : [null, null]),
}));

const NOW = new Date('2026-08-20T15:00:00Z');

function hour(offsetHours: number, over: Partial<HourlyWeather> = {}): HourlyWeather {
  return {
    time: new Date(NOW.getTime() + offsetHours * 3_600_000).toISOString(),
    temp: 70,
    icon: 'clear-day',
    description: 'Clear',
    ...over,
  };
}

function makeSettings(over: Partial<DisplaySettings> = {}): DisplaySettings {
  return {
    timezone: 'UTC',
    latitude: 44.7,
    longitude: -93.4,
    weather: { provider: 'weatherapi', units: 'imperial' },
    calendar: { googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 30 },
    ...over,
  } as unknown as DisplaySettings;
}

function value(key: string): string | undefined {
  return sharedStateStore.snapshot().get(key)?.value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  payload.current = null;
  sharedStateStore.__resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSharedDisplayData weather shared state', () => {
  it('publishes the derived facts on first render', () => {
    payload.current = {
      hourly: [
        hour(0, { description: 'Light rain', temp: 61.7, precipProbability: 70 }),
        hour(4, { precipProbability: 20 }),
      ],
    };
    renderHook(() => useSharedDisplayData([], makeSettings()));

    expect(value(K.condition)).toBe('rain');
    expect(value(K.temperature)).toBe('62');
    expect(value(K.precipChanceNow)).toBe('70');
    expect(value(K.precipChanceNextHours)).toBe('70');
    expect(value(K.precipChanceToday)).toBe('70');
  });

  it('moves the rolling window along between fetches', () => {
    payload.current = {
      hourly: [hour(0, { precipProbability: 5 }), hour(7, { precipProbability: 90 })],
    };
    renderHook(() => useSharedDisplayData([], makeSettings()));
    expect(value(K.precipChanceNextHours)).toBe('5');

    // No refetch, no re-render: the interval alone brings the 7-hour row
    // inside the six-hour window.
    vi.advanceTimersByTime(2 * 60 * 60_000);
    expect(value(K.precipChanceNextHours)).toBe('90');
  });

  it('publishes nothing at all without a location', () => {
    payload.current = { hourly: [hour(0, { precipProbability: 70 })] };
    renderHook(() => useSharedDisplayData([], makeSettings({ latitude: 0, longitude: 0 })));
    // Without a location no weather URL is built, so the mocked fetch is
    // never asked for the provider and the producer has no payload.
    expect(sharedStateStore.snapshot().size).toBe(0);
  });

  it('releases every key when the location is removed', () => {
    payload.current = { hourly: [hour(0, { precipProbability: 70 })] };
    const { rerender } = renderHook(
      ({ settings }) => useSharedDisplayData([], settings),
      { initialProps: { settings: makeSettings() } },
    );
    expect(value(K.precipChanceNow)).toBe('70');

    payload.current = null;
    rerender({ settings: makeSettings({ latitude: 0, longitude: 0 }) });
    vi.advanceTimersByTime(20_000);
    for (const key of WEATHER_STATE_KEY_LIST) {
      expect(sharedStateStore.snapshot().has(key)).toBe(false);
    }
  });

  it('stops republishing once the display unmounts', () => {
    payload.current = {
      hourly: [hour(0, { precipProbability: 5 }), hour(7, { precipProbability: 90 })],
    };
    const { unmount } = renderHook(() => useSharedDisplayData([], makeSettings()));
    unmount();
    vi.advanceTimersByTime(2 * 60 * 60_000);
    // Frozen at the value published before unmount, not advanced by a
    // leaked interval.
    expect(value(K.precipChanceNextHours)).toBe('5');
  });
});
