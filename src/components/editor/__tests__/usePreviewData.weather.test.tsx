// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration } from '@/types/config';
import { usePreviewData } from '../usePreviewData';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
  secretStatus: {
    status: {},
    loading: false,
    error: false,
    hasStatus: true,
  },
}));

vi.mock('@/lib/editor-fetch', () => ({ editorFetch: mocks.editorFetch }));
vi.mock('@/hooks/useSecretStatus', () => ({ useSecretStatus: () => mocks.secretStatus }));
vi.mock('../useCalendarFetchQuery', () => ({ useCalendarFetchQuery: () => '' }));

function makeConfig(): ScreenConfiguration {
  return {
    settings: {
      weather: { provider: 'open-meteo', latitude: 51.865, longitude: -2.246, units: 'metric' },
    },
    screens: [{
      id: 'home',
      name: 'Home',
      modules: [{ type: 'weather', config: { provider: 'global' } }],
    }],
  } as unknown as ScreenConfiguration;
}

describe('usePreviewData weather requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.editorFetch.mockImplementation(async () =>
      new Response(JSON.stringify({ hourly: [], forecast: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    useEditorStore.setState({ config: makeConfig() });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.editorFetch.mockReset();
    mocks.secretStatus.status = {};
  });

  it('does not probe unused regional providers', async () => {
    renderHook(() => usePreviewData());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const weatherUrls = mocks.editorFetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith('/api/weather'));

    expect(weatherUrls).toEqual(['/api/weather?provider=open-meteo']);
  });

  it('does not report a missing key for an unused provider whose key is saved', async () => {
    mocks.secretStatus.status = { pirateweather_key: true };
    const { result } = renderHook(() => usePreviewData());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.weatherErrors.pirateweather).toBeUndefined();
    expect(result.current.weatherErrors.weatherapi).toMatchObject({ kind: 'setup' });
  });
});