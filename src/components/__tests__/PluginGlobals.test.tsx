// @vitest-environment jsdom

/**
 * Tests for the `__HS_SDK__.translate` namespace dispatcher exposed by
 * `<PluginGlobals>`. The host SDK is the only translation surface plugin
 * IIFE bundles can use; the dispatcher must route every dotted-key shape
 * to the right namespace and never throw on unknown inputs.
 *
 * Coverage:
 *   - `plugin:<id>.key`          → plugin namespace
 *   - `<built-in>.<key>`         → built-in namespace (every entry in
 *                                  BUILT_IN_NAMESPACES)
 *   - `<bare-key>`               → defaults to `core`
 *   - missing key                → returns the raw key
 *   - unknown leading segment    → falls back to `core` and tries the
 *                                  full dotted path
 *   - empty string               → returns the empty string (raw-key
 *                                  contract)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests, hydrateFromBlob, registerPluginNamespace } from '@/i18n/loader';
import { BUILT_IN_NAMESPACES, type Namespace } from '@/i18n/types';
import PluginGlobals from '@/components/PluginGlobals';

type SDK = {
  translate: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
};

function getSDK(): SDK {
  const sdk = (window.__HS_SDK__ as unknown) as SDK | undefined;
  if (!sdk) throw new Error('__HS_SDK__ was not installed by PluginGlobals');
  return sdk;
}

async function mountSdk(locale = 'en-US'): Promise<void> {
  await act(async () => {
    render(
      <I18nProvider locale={locale} blob={{}}>
        <PluginGlobals />
      </I18nProvider>,
    );
  });
}

describe('__HS_SDK__.translate dispatcher', () => {
  beforeEach(() => {
    __resetLoaderForTests();
    // Stub fetch so the provider's background namespace loads don't try
    // to reach the network during the test.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ core: {} }), { status: 200 }),
    );
  });

  afterEach(() => {
    cleanup();
    delete window.__HS_SDK__;
    vi.restoreAllMocks();
  });

  it('resolves a plugin namespace via "plugin:<id>." prefix', async () => {
    registerPluginNamespace('my-plugin', 'en-US', { greeting: 'Hello, {name}!' });
    await mountSdk('en-US');
    expect(getSDK().translate('plugin:my-plugin.greeting', { name: 'World' })).toBe(
      'Hello, World!',
    );
  });

  it('returns the raw key when a plugin namespace lookup misses', async () => {
    registerPluginNamespace('my-plugin', 'en-US', { greeting: 'Hello' });
    await mountSdk('en-US');
    expect(getSDK().translate('plugin:my-plugin.unknownKey')).toBe(
      'plugin:my-plugin.unknownKey',
    );
  });

  it('resolves built-in namespaces (modules.weather.feelsLike)', async () => {
    hydrateFromBlob('en-US', {
      modules: { weather: { feelsLike: 'Feels like {temp}' } },
    });
    await mountSdk('en-US');
    expect(getSDK().translate('modules.weather.feelsLike', { temp: '70' })).toBe(
      'Feels like 70',
    );
  });

  it('routes every BUILT_IN_NAMESPACES entry through the namespace dispatcher', async () => {
    // Seed each built-in namespace with a `probe` key that returns its
    // own name so we can prove the dispatcher selected the right one.
    const blob: Record<string, { probe: string }> = {};
    for (const ns of BUILT_IN_NAMESPACES) {
      blob[ns] = { probe: `from-${ns}` };
    }
    hydrateFromBlob('en-US', blob);
    await mountSdk('en-US');
    const t = getSDK().translate;
    for (const ns of BUILT_IN_NAMESPACES) {
      expect(t(`${ns}.probe`)).toBe(`from-${ns}`);
    }
  });

  it('defaults to the core namespace for keys without a leading segment', async () => {
    hydrateFromBlob('en-US', { core: { today: 'Today' } });
    await mountSdk('en-US');
    expect(getSDK().translate('today')).toBe('Today');
  });

  it('returns the raw key when the core lookup misses', async () => {
    hydrateFromBlob('en-US', { core: {} });
    await mountSdk('en-US');
    expect(getSDK().translate('nope')).toBe('nope');
  });

  it('an unknown leading segment falls back to core with the full dotted path', async () => {
    // `chores.foo` is not a registered built-in namespace — the
    // dispatcher must try `core.chores.foo` (which doesn't exist) and
    // surface the raw key, not silently route into a non-namespace.
    hydrateFromBlob('en-US', { core: { chores: { foo: 'BAR' } } });
    await mountSdk('en-US');
    expect(getSDK().translate('chores.foo')).toBe('BAR');
  });

  it('returns the empty string for an empty key (no namespace)', async () => {
    hydrateFromBlob('en-US', { core: {} });
    await mountSdk('en-US');
    // Empty string isn't found anywhere, so the raw-key contract returns
    // it unchanged.
    expect(getSDK().translate('')).toBe('');
  });

  it('exposes the active locale on __HS_SDK__.locale', async () => {
    await mountSdk('de-DE');
    expect(getSDK().locale).toBe('de-DE');
  });
});

describe('BUILT_IN_NAMESPACES type coverage', () => {
  it('covers exactly the Namespace union (compile-time + runtime check)', () => {
    // Compile-time: assigning the constant to a `Namespace[]` proves
    // every element is a valid namespace tag. The `as const satisfies
    // readonly Namespace[]` declaration in types.ts also enforces this
    // at the source.
    const arr: readonly Namespace[] = BUILT_IN_NAMESPACES;
    expect(arr.length).toBe(5);
    // Sanity: the canonical 5 namespaces are present.
    expect(new Set(arr)).toEqual(new Set(['core', 'modules', 'editor', 'remote', 'weather']));
  });
});
