// @vitest-environment jsdom

/**
 * Tests for the `__HS_SDK__.publishState` / `clearState` namespace
 * enforcement exposed by `<PluginGlobals>`. Every plugin write must land
 * under the canonical `plugin:<id>:` prefix (id lowercased), so editor
 * picker keys registered via `registerPluginModule` always match runtime
 * keys, and a plugin cannot accidentally write into another's namespace.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { sharedStateStore } from '@/lib/shared-state-store';
import { providerHealthStore, type ProviderHealthStatus } from '@/lib/provider-health-store';
import PluginGlobals from '@/components/PluginGlobals';

type StateSDK = {
  publishState: (pluginId: string, key: string, value: string) => void;
  clearState: (pluginId: string, key: string) => void;
  reportProviderHealth: (pluginId: string, status: ProviderHealthStatus) => void;
};

function getSDK(): StateSDK {
  const sdk = (window.__HS_SDK__ as unknown) as StateSDK | undefined;
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

describe('__HS_SDK__ shared-state surface', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    sharedStateStore.__resetForTests();
    providerHealthStore.__resetForTests();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete window.__HS_SDK__;
    vi.restoreAllMocks();
  });

  it('force-prefixes publishes with the plugin namespace', async () => {
    await mountSdk();
    getSDK().publishState('ha', 'door', 'open');
    expect(sharedStateStore.snapshot().get('plugin:ha:door')?.value).toBe('open');
  });

  it('lowercases mixed-case plugin ids so the store accepts the key', async () => {
    await mountSdk();
    getSDK().publishState('MyPlugin', 'door', 'open');
    expect(sharedStateStore.snapshot().get('plugin:myplugin:door')?.value).toBe('open');
  });

  it('strips an already-present own prefix instead of double-prefixing', async () => {
    await mountSdk();
    getSDK().publishState('ha', 'plugin:ha:door', 'open');
    expect(sharedStateStore.snapshot().get('plugin:ha:door')?.value).toBe('open');
    expect(sharedStateStore.snapshot().size).toBe(1);
  });

  it('double-prefixes a key aimed at another plugin namespace (no cross-plugin writes)', async () => {
    await mountSdk();
    getSDK().publishState('ha', 'plugin:other:door', 'open');
    expect(sharedStateStore.snapshot().get('plugin:other:door')).toBeUndefined();
    expect(sharedStateStore.snapshot().get('plugin:ha:plugin:other:door')?.value).toBe('open');
  });

  it('clearState tombstones a published key under the same namespace rules', async () => {
    await mountSdk();
    vi.useFakeTimers();
    try {
      getSDK().publishState('MyPlugin', 'door', 'open');
      getSDK().clearState('MyPlugin', 'plugin:MyPlugin:door');
      // Grace window first (no blink on producer restarts), gone after TTL
      expect(sharedStateStore.snapshot().get('plugin:myplugin:door')?.staleAt).toBeTypeOf('number');
      vi.advanceTimersByTime(15_000);
      expect(sharedStateStore.snapshot().get('plugin:myplugin:door')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reportProviderHealth records and clears through the provider-health store', async () => {
    await mountSdk();
    getSDK().reportProviderHealth('ha', { ok: false, message: 'down', since: 10 });
    expect(providerHealthStore.snapshot().get('ha')).toEqual({ message: 'down', since: 10 });
    getSDK().reportProviderHealth('ha', { ok: true });
    expect(providerHealthStore.snapshot().has('ha')).toBe(false);
  });

  it('reportProviderHealth ignores a non-string pluginId', async () => {
    await mountSdk();
    (getSDK() as unknown as { reportProviderHealth: (a: unknown, b: unknown) => void })
      .reportProviderHealth(42, { ok: false, message: 'x', since: 1 });
    expect(providerHealthStore.snapshot().size).toBe(0);
  });

  it('non-string arguments are no-ops', async () => {
    await mountSdk();
    const sdk = getSDK() as unknown as {
      publishState: (a: unknown, b: unknown, c: unknown) => void;
      clearState: (a: unknown, b: unknown) => void;
    };
    sdk.publishState(42, 'door', 'open');
    sdk.publishState('ha', null, 'open');
    expect(sharedStateStore.snapshot().size).toBe(0);
    sharedStateStore.publish('plugin:ha:door', 'open');
    sdk.clearState(undefined, 'door');
    expect(sharedStateStore.snapshot().get('plugin:ha:door')?.value).toBe('open');
  });
});
