// @vitest-environment jsdom

/**
 * Scoped cache invalidation in useLiveConfig: a config change that cannot
 * affect fetched data (position, size, zIndex, style, schedule, visibility,
 * enabled) must NOT clear the display cache, while data-affecting changes
 * (module config, settings) still must. Observes the real seam — a spy on
 * displayCache.clear — with the poll loop driven by fake timers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GlobalSettings, Screen, ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { displayCache } from '@/lib/display-cache';
import { useLiveConfig } from '../useLiveConfig';

// The current config body served by the mocked /api/config, mutable per step.
let configBody = '';

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    if (url === '/api/system/build-id') {
      return { ok: true, text: async () => 'build-1' };
    }
    if (url === '/api/config') {
      return { ok: true, text: async () => configBody };
    }
    if (url === '/api/plugins/installed') {
      return { ok: true, json: async () => ({ pluginHash: '', plugins: [] }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  },
}));

function makeConfig(modules: Screen['modules']): ScreenConfiguration {
  return {
    screens: [{ id: 's1', name: 'S1', backgroundImage: '', modules }],
    settings: { rotationIntervalMs: 5_000, timezone: 'UTC' } as unknown as GlobalSettings,
  } as ScreenConfiguration;
}

function weatherModule(overrides: Partial<Screen['modules'][number]> = {}): Screen['modules'][number] {
  return {
    id: 'mod-1',
    type: 'weather',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 1,
    config: { view: 'current' },
    style: { ...DEFAULT_MODULE_STYLE },
    ...overrides,
  };
}

const initial = makeConfig([weatherModule()]);

/** Flush one poll cycle: the 3s interval plus the awaited fetch microtasks. */
async function advanceOnePoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
}

describe('useLiveConfig scoped cache invalidation', () => {
  let clearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clearSpy = vi.spyOn(displayCache, 'clear');
    configBody = JSON.stringify(initial);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSpy.mockRestore();
  });

  it('clears on first load, skips presentational-only changes, clears on data changes', async () => {
    const { unmount } = renderHook(() =>
      useLiveConfig(initial.screens, initial.settings),
    );
    // First poll (immediate): fingerprint ref is empty, so the mount clear
    // still happens — a remounted rotator must not trust the module-global
    // cache blindly.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // Position + style + visibility change only: bytes differ, data doesn't.
    configBody = JSON.stringify(
      makeConfig([
        weatherModule({
          position: { x: 500, y: 500 },
          style: { ...DEFAULT_MODULE_STYLE, borderRadius: 24 },
          visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'on' }] },
        }),
      ]),
    );
    await advanceOnePoll();
    expect(clearSpy).toHaveBeenCalledTimes(1);

    // Module config change: fetched data can differ, cache must clear.
    configBody = JSON.stringify(
      makeConfig([weatherModule({ config: { view: 'forecast' } })]),
    );
    await advanceOnePoll();
    expect(clearSpy).toHaveBeenCalledTimes(2);

    // Settings change (e.g. timezone): also data-affecting.
    const settingsChanged = makeConfig([weatherModule({ config: { view: 'forecast' } })]);
    (settingsChanged.settings as { timezone?: string }).timezone = 'America/Chicago';
    configBody = JSON.stringify(settingsChanged);
    await advanceOnePoll();
    expect(clearSpy).toHaveBeenCalledTimes(3);

    unmount();
  });
});
