// @vitest-environment jsdom

/**
 * A wall's heartbeat names the ETag its config read would be answered with.
 * The wall fetches only when that differs from the ETag of the answer it last
 * applied, and sends that ETag back, so a change undone in the meantime is a
 * bodiless 304 instead of the whole document.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { GlobalSettings, ScreenConfiguration } from '@/types/config';
import { publishRevisions } from '@/lib/display-heartbeat';
import { useLiveConfig } from '../useLiveConfig';

let configBody = '';
let configEtag = '';
const sentEtags: (string | null)[] = [];

vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: { getState: () => ({ loadPlugins: vi.fn(), setPluginSettingsMap: vi.fn(), pluginSettings: new Map() }) },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: async (url: string, init?: RequestInit) => {
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

/** One beat naming the ETag the hub would answer with right now. */
async function beat() {
  await act(async () => {
    publishRevisions({ config: configEtag, plugins: 'p' });
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useLiveConfig config ETag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sentEtags.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fetches only when the beat names another ETag, and sends back the one it applied', async () => {
    const initial = makeConfig('First');
    configBody = JSON.stringify(initial);
    configEtag = '"a.UTC"';
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
    await beat();
    expect(sentEtags).toEqual([null]);

    // Unchanged: no request at all.
    await beat();
    expect(sentEtags).toHaveLength(1);
    expect(result.current.screens[0].name).toBe('First');

    configBody = JSON.stringify(makeConfig('Second'));
    configEtag = '"b.UTC"';
    await beat();
    expect(sentEtags[1]).toBe('"a.UTC"');
    expect(result.current.screens[0].name).toBe('Second');
    await beat();
    expect(sentEtags).toHaveLength(2);
  });

  it('keeps its config on a 304 for a change that was undone before it asked', async () => {
    const initial = makeConfig('First');
    configBody = JSON.stringify(initial);
    configEtag = '"a.UTC"';
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
    await beat();

    // The beat saw "b", but by the time the wall asks the hub is back on "a".
    await act(async () => {
      publishRevisions({ config: '"b.UTC"', plugins: 'p' });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sentEtags[1]).toBe('"a.UTC"');
    expect(result.current.screens[0].name).toBe('First');
  });

  it('asks again in full after an answer it could not apply', async () => {
    const initial = makeConfig('First');
    configBody = JSON.stringify(initial);
    configEtag = '"a.UTC"';
    const { result } = renderHook(() => useLiveConfig(initial.screens, initial.settings, 'UTC'));
    await beat();

    // A torn answer must not be remembered as applied, or every later beat
    // would look unchanged for a config the wall never showed.
    configBody = '{"screens": [';
    configEtag = '"b.UTC"';
    await beat();
    await beat();
    expect(sentEtags[2]).toBe('"a.UTC"');

    configBody = JSON.stringify(makeConfig('Second'));
    await beat();
    expect(result.current.screens[0].name).toBe('Second');
  });
});
