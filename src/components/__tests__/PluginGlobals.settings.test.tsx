// @vitest-environment jsdom

/**
 * Tests for the `__HS_SDK__.getPluginSettings` accessor exposed by
 * `<PluginGlobals>`. It returns a deep clone of the plugin-wide settings
 * saved against the manifest's `settingsSchema`, keyed by lowercased plugin
 * id, so module instances can fall back to plugin-wide values without a
 * caller ever mutating the store-held object.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { sharedStateStore } from '@/lib/shared-state-store';
import PluginGlobals from '@/components/PluginGlobals';
import { usePluginStore } from '@/stores/plugin-store';

type SettingsSDK = {
  getPluginSettings: (pluginId: unknown) => Record<string, unknown>;
};

function getSDK(): SettingsSDK {
  const sdk = (window.__HS_SDK__ as unknown) as SettingsSDK | undefined;
  if (!sdk) throw new Error('__HS_SDK__ was not installed by PluginGlobals');
  return sdk;
}

async function mountSdk(): Promise<void> {
  await act(async () => {
    render(
      <I18nProvider locale="en-US" blob={{}}>
        <PluginGlobals />
      </I18nProvider>,
    );
  });
}

describe('__HS_SDK__.getPluginSettings', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    sharedStateStore.__resetForTests();
    usePluginStore.setState({
      plugins: new Map(),
      pluginSettings: new Map(),
      errors: new Map(),
      loading: true,
    });
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );
  });

  afterEach(() => {
    cleanup();
    delete window.__HS_SDK__;
    vi.restoreAllMocks();
  });

  it('looks up settings by lowercased plugin id', async () => {
    await mountSdk();
    usePluginStore.setState({
      pluginSettings: new Map([
        ['ha', { url: 'http://ha', entities: ['light.a', 'light.b'], nested: { k: 1 } }],
      ]),
    });

    expect(getSDK().getPluginSettings('HA')).toEqual({
      url: 'http://ha',
      entities: ['light.a', 'light.b'],
      nested: { k: 1 },
    });
  });

  it('returns a deep clone so mutating the result never touches the store', async () => {
    await mountSdk();
    usePluginStore.setState({
      pluginSettings: new Map([
        ['ha', { url: 'http://ha', entities: ['light.a', 'light.b'], nested: { k: 1 } }],
      ]),
    });

    const result = getSDK().getPluginSettings('ha') as {
      entities: string[];
      nested: { k: number };
    };
    result.entities.push('x');
    result.nested.k = 999;

    // The store-held value is untouched by the caller's mutation.
    const held = usePluginStore.getState().pluginSettings.get('ha') as {
      entities: string[];
      nested: { k: number };
    };
    expect(held.entities).toHaveLength(2);
    expect(held.nested.k).toBe(1);

    // A fresh read still yields the original, unmutated data.
    expect(getSDK().getPluginSettings('ha')).toEqual({
      url: 'http://ha',
      entities: ['light.a', 'light.b'],
      nested: { k: 1 },
    });
  });

  it('returns {} for a non-string plugin id', async () => {
    await mountSdk();
    usePluginStore.setState({
      pluginSettings: new Map([['ha', { url: 'http://ha' }]]),
    });

    expect(getSDK().getPluginSettings(123)).toEqual({});
    expect(getSDK().getPluginSettings(null)).toEqual({});
  });

  it('returns {} for an unknown plugin', async () => {
    await mountSdk();
    usePluginStore.setState({
      pluginSettings: new Map([['ha', { url: 'http://ha' }]]),
    });

    expect(getSDK().getPluginSettings('does-not-exist')).toEqual({});
  });
});
