// @vitest-environment jsdom

/**
 * Regression tests for the no-location fetch gate: with no configured
 * location, every weather fetch is a guaranteed 400 and the modules render
 * LocationRequired, so useSharedDisplayData must not start any weather poll
 * loops at all (a '' URL is a no-op in useFetchData).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Screen, GlobalSettings, ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { useSharedDisplayData } from '../useSharedDisplayData';

const fetchedUrls: string[] = [];
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: (url: string) => {
    if (url) fetchedUrls.push(url);
    return [null, null];
  },
}));

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    timezone: 'UTC',
    latitude: 0,
    longitude: 0,
    weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'imperial' },
    calendar: {},
    ...overrides,
  } as unknown as GlobalSettings;
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
