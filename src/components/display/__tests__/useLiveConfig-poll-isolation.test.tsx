// @vitest-environment jsdom

/**
 * The three jobs in useLiveConfig's poll tick must fail independently.
 *
 * They used to share one `try` and one early return: `if (!res.ok) return`
 * after the `/api/config` fetch skipped plugin-change detection entirely. So
 * enabling or disabling a plugin while `/api/config` was briefly 500ing left
 * the display running the old plugin set until some later tick happened to
 * succeed at *both* fetches, with nothing logged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { useLiveConfig } from '../useLiveConfig';

// Per-endpoint behaviour, mutable per test step.
let configOk = true;
let configThrows = false;
let pluginsOk = true;
let pluginsThrow = false;
let buildIdThrows = false;
let configBody = '';
let pluginHash = 'hash-1';

const loadPlugins = vi.fn().mockResolvedValue(undefined);
const setPluginSettingsMap = vi.fn();

vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: {
    getState: () => ({
      loadPlugins,
      setPluginSettingsMap,
      pluginSettings: new Map(),
    }),
  },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string) => {
    if (url === '/api/system/build-id') {
      if (buildIdThrows) throw new Error('build-id down');
      return { ok: true, text: async () => 'build-1' };
    }
    if (url === '/api/config') {
      if (configThrows) throw new Error('config down');
      return { ok: configOk, text: async () => configBody };
    }
    if (url === '/api/plugins/installed') {
      if (pluginsThrow) throw new Error('plugins down');
      return {
        ok: pluginsOk,
        json: async () => ({ pluginHash, plugins: [] }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  },
}));

function makeConfig(screenName: string): ScreenConfiguration {
  return {
    screens: [{ id: 's1', name: screenName, backgroundImage: '', modules: [] }],
    settings: { rotationIntervalMs: 5_000, timezone: 'UTC' } as unknown as GlobalSettings,
  } as unknown as ScreenConfiguration;
}

const initial = makeConfig('S1');

async function advanceOnePoll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
}

async function mountAndSettle() {
  const rendered = renderHook(() => useLiveConfig(initial.screens, initial.settings));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return rendered;
}

beforeEach(() => {
  vi.useFakeTimers();
  configOk = true;
  configThrows = false;
  pluginsOk = true;
  pluginsThrow = false;
  buildIdThrows = false;
  configBody = JSON.stringify(initial);
  pluginHash = 'hash-1';
  loadPlugins.mockClear();
  setPluginSettingsMap.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useLiveConfig poll job isolation', () => {
  it('still detects a plugin change when /api/config returns a non-ok status', async () => {
    const { unmount } = await mountAndSettle();

    // Config endpoint starts failing; the plugin set changes in the same tick.
    configOk = false;
    pluginHash = 'hash-2';
    await advanceOnePoll();

    expect(loadPlugins).toHaveBeenCalled();
    unmount();
  });

  it('still detects a plugin change when /api/config throws', async () => {
    const { unmount } = await mountAndSettle();

    configThrows = true;
    pluginHash = 'hash-2';
    await advanceOnePoll();

    expect(loadPlugins).toHaveBeenCalled();
    unmount();
  });

  it('still detects a plugin change when the build-id check throws', async () => {
    const { unmount } = await mountAndSettle();

    buildIdThrows = true;
    pluginHash = 'hash-2';
    await advanceOnePoll();

    expect(loadPlugins).toHaveBeenCalled();
    unmount();
  });

  it('still applies a config change when /api/plugins/installed fails', async () => {
    const { result, unmount } = await mountAndSettle();

    pluginsThrow = true;
    configBody = JSON.stringify(makeConfig('Renamed'));
    await advanceOnePoll();

    expect(result.current.screens[0].name).toBe('Renamed');
    unmount();
  });

  it('keeps polling after a failed tick rather than wedging the re-entrancy guard', async () => {
    const { result, unmount } = await mountAndSettle();

    // A tick where everything fails must still release the in-flight guard.
    configThrows = true;
    pluginsThrow = true;
    buildIdThrows = true;
    await advanceOnePoll();

    // Recovery: the next tick must be able to apply a config change.
    configThrows = false;
    pluginsThrow = false;
    buildIdThrows = false;
    configBody = JSON.stringify(makeConfig('Recovered'));
    await advanceOnePoll();

    expect(result.current.screens[0].name).toBe('Recovered');
    unmount();
  });

  it('does not reload plugins when the hash is unchanged', async () => {
    const { unmount } = await mountAndSettle();
    loadPlugins.mockClear();

    await advanceOnePoll();

    expect(loadPlugins).not.toHaveBeenCalled();
    unmount();
  });
});
