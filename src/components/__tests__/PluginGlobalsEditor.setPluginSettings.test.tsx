// @vitest-environment jsdom

/**
 * Tests for the editor-only `__HS_SDK__.setPluginSettings` writer installed
 * by `<PluginGlobalsEditor>`: merge semantics over the store's current
 * values (a ConfigSection saving one field must not clobber its siblings),
 * an immediate store push on success (so `getPluginSettings` reads the new
 * values right after the promise resolves), and error surfacing without the
 * store ever being touched on failure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { sharedStateStore } from '@/lib/shared-state-store';
import PluginGlobals from '@/components/PluginGlobals';
import PluginGlobalsEditor from '@/components/PluginGlobalsEditor';
import { usePluginStore } from '@/stores/plugin-store';
import { useEditorStore } from '@/stores/editor-store';

type SdkWithSettings = {
  setPluginSettings: (
    pluginId: unknown,
    updates: unknown,
  ) => Promise<{ ok: boolean; error?: string }>;
  getPluginSettings: (pluginId: string) => Record<string, unknown>;
};

function getSDK(): SdkWithSettings {
  const sdk = (window.__HS_SDK__ as unknown) as SdkWithSettings | undefined;
  if (!sdk?.setPluginSettings) throw new Error('setPluginSettings was not installed');
  return sdk;
}

async function mountSdk(): Promise<void> {
  await act(async () => {
    render(
      <I18nProvider locale="en-US" blob={{}}>
        <PluginGlobals />
        <PluginGlobalsEditor />
      </I18nProvider>,
    );
  });
}

/** Route fetches: the settings PUT gets `respond`, everything else (i18n) {}. */
function mockFetch(respond: (body: Record<string, unknown>) => Response): ReturnType<typeof vi.fn> {
  const spy = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/plugins/settings/') && init?.method === 'PUT') {
      return respond(JSON.parse(String(init.body)));
    }
    return new Response(JSON.stringify({ core: {} }), { status: 200 });
  });
  return spy as unknown as ReturnType<typeof vi.fn>;
}

describe('__HS_SDK__.setPluginSettings', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    sharedStateStore.__resetForTests();
    usePluginStore.setState({
      plugins: new Map(),
      pluginSettings: new Map(),
      errors: new Map(),
      loading: true,
    });
  });

  afterEach(() => {
    cleanup();
    delete window.__HS_SDK__;
    useEditorStore.setState({ config: null });
    vi.restoreAllMocks();
  });

  it('merges updates over the current values and pushes the stored result into the store', async () => {
    let putBody: Record<string, unknown> | null = null;
    mockFetch((body) => {
      putBody = body;
      return new Response(JSON.stringify({ ok: true, settings: body.settings }), { status: 200 });
    });
    await mountSdk();
    usePluginStore.setState({
      pluginSettings: new Map([['ha', { haUrl: 'http://old', fastUpdates: false }]]),
    });

    const result = await getSDK().setPluginSettings('HA', { haUrl: 'http://new' });

    expect(result).toEqual({ ok: true });
    // Sibling setting survived the single-field save.
    expect(putBody).toEqual({ settings: { haUrl: 'http://new', fastUpdates: false } });
    // The store was updated immediately: a follow-up read sees the new value.
    expect(getSDK().getPluginSettings('ha')).toEqual({ haUrl: 'http://new', fastUpdates: false });
  });

  it('surfaces the server error and leaves the store untouched', async () => {
    mockFetch(() => new Response(JSON.stringify({ error: 'Plugin has no settings' }), { status: 400 }));
    await mountSdk();
    usePluginStore.setState({ pluginSettings: new Map([['ha', { haUrl: 'http://old' }]]) });

    const result = await getSDK().setPluginSettings('ha', { haUrl: 'http://new' });

    expect(result).toEqual({ ok: false, error: 'Plugin has no settings' });
    expect(getSDK().getPluginSettings('ha')).toEqual({ haUrl: 'http://old' });
  });

  it('rejects invalid arguments without hitting the network', async () => {
    const spy = mockFetch(() => new Response('{}', { status: 200 }));
    await mountSdk();
    const puts = () =>
      spy.mock.calls.filter((c) => String(c[0]).includes('/api/plugins/settings/')).length;

    expect((await getSDK().setPluginSettings(42, { a: 1 })).ok).toBe(false);
    expect((await getSDK().setPluginSettings('ha', null)).ok).toBe(false);
    expect((await getSDK().setPluginSettings('ha', [1, 2])).ok).toBe(false);
    expect(puts()).toBe(0);
  });
});
