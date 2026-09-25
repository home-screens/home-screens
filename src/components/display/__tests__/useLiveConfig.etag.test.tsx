// @vitest-environment jsdom

/**
 * A wall polls its config every 3 seconds forever. It sends back the ETag of
 * the answer it last applied, so the hub can answer an unchanged config with
 * a bodiless 304 instead of the whole document.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { useLiveConfig } from '../useLiveConfig';

let configBody = '';
let configEtag = '';
const sentEtags: (string | null)[] = [];

vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: { getState: () => ({ loadPlugins: vi.fn(), setPluginSettingsMap: vi.fn(), pluginSettings: new Map() }) },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string, init?: RequestInit) => {
    if (url === '/api/system/build-id') return { ok: true, text: async () => 'build-1' };
    if (url === '/api/config?display=__default__') {
      const sent = new Headers(init?.headers).get('If-None-Match');
      sentEtags.push(sent);
      if (sent === configEtag) return { ok: false, status: 304, text: async () => '', headers: new Headers({ ETag: configEtag }) };
      return { ok: true, status: 200, text: async () => configBody, headers: new Headers({ ETag: configEtag }) };
    }
    if (url === '/api/plugins/installed') return { ok: true, json: async () => ({ pluginHash: '', plugins: [] }) };
    throw new Error(`unexpected fetch: ${url}`);
  },
}));

function makeConfig(screenName: string): ScreenConfiguration {
  return {
    screens: [{ id: 's1', name: screenName, backgroundImage: '', modules: [] }],
    settings: { rotationIntervalMs: 5_000, timezone: 'UTC' } as unknown as GlobalSettings,
  } as unknown as ScreenConfiguration;
}

async function poll(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useLiveConfig config ETag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sentEtags.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends back the ETag it applied, keeps its config on a 304, and applies a change', async () => {
    const initial = makeConfig('First');
    configBody = JSON.stringify(initial);
    configEtag = '"a.UTC"';
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
    await poll(0);
    expect(sentEtags).toEqual([null]);

    await poll(3_000);
    expect(sentEtags[1]).toBe('"a.UTC"');
    expect(result.current.screens[0].name).toBe('First');

    configBody = JSON.stringify(makeConfig('Second'));
    configEtag = '"b.UTC"';
    await poll(3_000);
    expect(result.current.screens[0].name).toBe('Second');
    await poll(3_000);
    expect(sentEtags[3]).toBe('"b.UTC"');
  });

  it('asks again in full after an answer it could not apply', async () => {
    const initial = makeConfig('First');
    configBody = JSON.stringify(initial);
    configEtag = '"a.UTC"';
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
    await poll(0);

    // A torn answer must not be remembered as applied, or every later poll
    // would get a 304 for a config the wall never showed.
    configBody = '{"screens": [';
    configEtag = '"b.UTC"';
    await poll(3_000);
    await poll(3_000);
    expect(sentEtags[2]).toBe('"a.UTC"');

    configBody = JSON.stringify(makeConfig('Second'));
    await poll(3_000);
    expect(result.current.screens[0].name).toBe('Second');
  });
});
