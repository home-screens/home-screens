// @vitest-environment jsdom

/**
 * useLiveConfig follows the heartbeat: each beat names the current config and
 * plugin-list revisions, and the hook fetches only the ones that moved.
 *
 * The two jobs must also fail independently. They used to share one `try`
 * and one early return: `if (!res.ok) return` after the `/api/config` fetch
 * skipped plugin-change detection entirely. So enabling or disabling a plugin
 * while `/api/config` was briefly 500ing left the display running the old
 * plugin set until some later tick happened to succeed at *both* fetches,
 * with nothing logged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { publishRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import { useLiveConfig } from '../useLiveConfig';

// Per-endpoint behaviour, mutable per test step.
let configOk = true;
let configThrows = false;
let pluginsOk = true;
let pluginsThrow = false;
let configBody = '';
let configEtag = '"c1"';
let pluginHash = 'hash-1';
const fetched: string[] = [];

const loadPlugins = vi.fn().mockResolvedValue(true);
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
    fetched.push(url);
    if (url === '/api/config?display=__default__') {
      if (configThrows) throw new Error('config down');
      return { ok: configOk, text: async () => configBody, headers: new Headers({ ETag: configEtag }) };
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

async function beat(revisions: DisplayRevisions) {
  await act(async () => {
    publishRevisions({ buildId: 'build-1', ...revisions });
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Mount and apply the first beat, which fetches both. */
async function mountAndSettle() {
  const rendered = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
  await beat({ config: '"c1"', plugins: 'p1' });
  fetched.length = 0;
  return rendered;
}

beforeEach(() => {
  vi.useFakeTimers();
  configOk = true;
  configThrows = false;
  pluginsOk = true;
  pluginsThrow = false;
  configBody = JSON.stringify(initial);
  configEtag = '"c1"';
  pluginHash = 'hash-1';
  fetched.length = 0;
  loadPlugins.mockReset().mockResolvedValue(true);
  setPluginSettingsMap.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useLiveConfig follows the heartbeat', () => {
  it('fetches nothing while every revision matches what it applied', async () => {
    await mountAndSettle();

    await beat({ config: '"c1"', plugins: 'p1' });
    await beat({ config: '"c1"', plugins: 'p1' });

    expect(fetched).toEqual([]);
  });

  it('fetches only the config when only the config revision moved', async () => {
    const { result } = await mountAndSettle();

    configBody = JSON.stringify(makeConfig('Renamed'));
    configEtag = '"c2"';
    await beat({ config: '"c2"', plugins: 'p1' });

    expect(fetched).toEqual(['/api/config?display=__default__']);
    expect(result.current.screens[0].name).toBe('Renamed');
  });

  it('ignores a field the beat left out', async () => {
    await mountAndSettle();

    await beat({});

    expect(fetched).toEqual([]);
  });

  it('retries a failed plugin reload on the next beat, then stops once it lands', async () => {
    await mountAndSettle();

    pluginHash = 'hash-2';
    loadPlugins.mockResolvedValueOnce(false);
    await beat({ config: '"c1"', plugins: 'p2' });
    expect(loadPlugins).toHaveBeenCalledTimes(1);

    await beat({ config: '"c1"', plugins: 'p2' });
    expect(loadPlugins).toHaveBeenCalledTimes(2);

    await beat({ config: '"c1"', plugins: 'p2' });
    expect(loadPlugins).toHaveBeenCalledTimes(2);
  });
});

describe('useLiveConfig beat job isolation', () => {
  it('still detects a plugin change when /api/config returns a non-ok status', async () => {
    await mountAndSettle();

    // Config endpoint starts failing; the plugin set changes in the same beat.
    configOk = false;
    pluginHash = 'hash-2';
    await beat({ config: '"c2"', plugins: 'p2' });

    expect(loadPlugins).toHaveBeenCalled();
  });

  it('still detects a plugin change when /api/config throws', async () => {
    await mountAndSettle();

    configThrows = true;
    pluginHash = 'hash-2';
    await beat({ config: '"c2"', plugins: 'p2' });

    expect(loadPlugins).toHaveBeenCalled();
  });

  it('still applies a config change when /api/plugins/installed fails', async () => {
    const { result } = await mountAndSettle();

    pluginsThrow = true;
    configBody = JSON.stringify(makeConfig('Renamed'));
    configEtag = '"c2"';
    await beat({ config: '"c2"', plugins: 'p2' });

    expect(result.current.screens[0].name).toBe('Renamed');
  });

  it('keeps following beats after a failed one rather than wedging the re-entrancy guard', async () => {
    const { result } = await mountAndSettle();

    // A beat where everything fails must still release the in-flight guard.
    configThrows = true;
    pluginsThrow = true;
    await beat({ config: '"c2"', plugins: 'p2' });

    // Recovery: the next beat must be able to apply a config change.
    configThrows = false;
    pluginsThrow = false;
    configBody = JSON.stringify(makeConfig('Recovered'));
    configEtag = '"c2"';
    await beat({ config: '"c2"', plugins: 'p2' });

    expect(result.current.screens[0].name).toBe('Recovered');
  });

  it('does not reload plugins when the hash is unchanged', async () => {
    await mountAndSettle();

    // A settings save moves the list's revision but not its hash.
    await beat({ config: '"c1"', plugins: 'p2' });

    expect(fetched).toEqual(['/api/plugins/installed']);
    expect(loadPlugins).not.toHaveBeenCalled();
  });
});
