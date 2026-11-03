// @vitest-environment jsdom

/**
 * Regression tests for the no-location fetch gate: with no configured
 * location, every weather fetch is a guaranteed 400 and the modules render
 * LocationRequired, so useSharedDisplayData must not start any weather poll
 * loops at all (a '' URL is a no-op in useFetchData).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Screen, ModuleInstance } from '@/types/config';
import type { DisplaySettings } from '../useLiveConfig';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { useSharedDisplayData } from '../useSharedDisplayData';

const fetchedUrls: string[] = [];
/** What the calendar read answers, and whether it was asked to pause, per render. */
let calendarAnswer: unknown = null;
const calendarPaused: boolean[] = [];
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string, _refreshMs: number, options?: { paused?: boolean }) => {
    if (url) fetchedUrls.push(url);
    if (url.startsWith('/api/calendar')) {
      calendarPaused.push(options?.paused ?? false);
      return [calendarAnswer, null, null];
    }
    return [null, null];
  },
}));

function makeSettings(overrides: Partial<DisplaySettings> = {}): DisplaySettings {
  return {
    timezone: 'UTC',
    latitude: 0,
    longitude: 0,
    weather: { provider: 'openweathermap', units: 'imperial' },
    calendar: {},
    ...overrides,
  } as unknown as DisplaySettings;
}

function makeWeatherScreen(provider: string): Screen {
  const mod: ModuleInstance = {
    id: 'mod-weather',
    type: 'weather',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: { provider },
    style: { ...DEFAULT_MODULE_STYLE },
  };
  return { id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [mod] };
}

afterEach(() => {
  fetchedUrls.length = 0;
  calendarPaused.length = 0;
  calendarAnswer = null;
});

describe('useSharedDisplayData weather fetch gating', () => {
  it('starts no weather fetch loops when no location is configured', () => {
    renderHook(() =>
      useSharedDisplayData([makeWeatherScreen('noaa')], makeSettings()),
    );
    // Neither the global provider nor the module's own provider may poll —
    // without lat/lon every request fails forever on a 24/7 kiosk.
    expect(fetchedUrls.filter((u) => u.includes('/api/weather'))).toEqual([]);
  });

  it('fetches the module and global providers when a location is configured', () => {
    renderHook(() =>
      useSharedDisplayData(
        [makeWeatherScreen('noaa')],
        makeSettings({ latitude: 44.7133, longitude: -93.4227 }),
      ),
    );
    const weatherUrls = fetchedUrls.filter((u) => u.includes('/api/weather'));
    expect(weatherUrls).toContain(
      '/api/weather?lat=44.7133&lon=-93.4227&units=imperial&provider=noaa',
    );
    expect(weatherUrls).toContain(
      '/api/weather?lat=44.7133&lon=-93.4227&units=imperial&provider=openweathermap',
    );
    expect(weatherUrls).toHaveLength(2);
  });
});

describe('useSharedDisplayData calendar polling while the wall sleeps', () => {
  const googleSettings = () => makeSettings({ calendar: { googleCalendarIds: ['family@example.com'] } } as Partial<DisplaySettings>);

  it('pauses an asleep wall when the hub asks (Home Screens\' own Google app)', () => {
    calendarAnswer = { events: [], sourceStatus: [], pauseWhileAsleep: true };
    const { rerender } = renderHook(({ asleep }) => useSharedDisplayData([], googleSettings(), { asleep }), {
      initialProps: { asleep: true },
    });
    expect(calendarPaused.at(-1)).toBe(true);

    // Waking lifts the pause; useFetchData asks again at once.
    rerender({ asleep: false });
    expect(calendarPaused.at(-1)).toBe(false);
  });

  it('keeps polling an asleep wall when the hub does not ask (the household\'s own Google app)', () => {
    calendarAnswer = { events: [], sourceStatus: [] };
    renderHook(() => useSharedDisplayData([], googleSettings(), { asleep: true }));
    expect(calendarPaused.every((paused) => !paused)).toBe(true);
  });

  it('never pauses an awake wall', () => {
    calendarAnswer = { events: [], sourceStatus: [], pauseWhileAsleep: true };
    renderHook(() => useSharedDisplayData([], googleSettings(), { asleep: false }));
    expect(calendarPaused.every((paused) => !paused)).toBe(true);
  });
});
