import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import { loadAllPlugins } from '@/lib/plugin-loader';
import { usePluginStore } from '@/stores/plugin-store';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { PluginManifest } from '@/types/plugins';

/**
 * Reload-swap semantics of loadAllPlugins: a routine plugin reload must NOT
 * purge shared-state keys of plugins that are still installed (that would
 * unmount every module conditioned on them for the seconds until the
 * remounted producer's first publish), while keys of plugins that are gone
 * from the new set (uninstalled/disabled) ARE purged — as are all preserved
 * keys when the reload fails outright, since no producer remounts then.
 */

function makeManifest(id: string, moduleType: string): PluginManifest {
  return {
    id,
    name: `Plugin ${id}`,
    version: '1.0.0',
    description: '',
    author: 'test',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType,
    category: 'Custom',
    icon: 'Star',
    defaultConfig: {},
    defaultSize: { w: 200, h: 200 },
    exports: { component: 'default' },
  } as PluginManifest;
}

const FakeComponent = (() => null) as unknown as ComponentType<Record<string, unknown>>;

function mockInstalledList(pluginIds: string[]) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/plugins/installed')) {
      return new Response(
        JSON.stringify({
          plugins: pluginIds.map((id) => ({
            id,
            moduleType: id,
            version: '1.0.0',
            enabled: true,
          })),
        }),
        { status: 200 },
      );
    }
    // Manifest/bundle fetches fail — the load error path is irrelevant here;
    // key retention must not depend on the bundle actually loading.
    return new Response('Not Found', { status: 404 });
  });
}

describe('loadAllPlugins reload swap', () => {
  beforeEach(() => {
    sharedStateStore.__resetForTests();
    usePluginStore.setState({ plugins: new Map(), errors: new Map(), loading: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps shared-state keys of plugins still present in the new set', async () => {
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    sharedStateStore.publish('plugin:foo:door', 'open');

    mockInstalledList(['foo']);
    await loadAllPlugins();

    expect(sharedStateStore.snapshot().get('plugin:foo:door')?.value).toBe('open');
  });

  it('purges shared-state keys of plugins gone from the new set (tombstone, then delete)', async () => {
    vi.useFakeTimers();
    usePluginStore.getState().registerPlugin('plugin:gone', FakeComponent, makeManifest('gone', 'gone'));
    usePluginStore.getState().registerPlugin('plugin:stays', FakeComponent, makeManifest('stays', 'stays'));
    sharedStateStore.publish('plugin:gone:door', 'open');
    sharedStateStore.publish('plugin:stays:door', 'closed');

    mockInstalledList(['stays']);
    await loadAllPlugins();

    expect(sharedStateStore.snapshot().get('plugin:gone:door')?.staleAt).toBeTypeOf('number');
    vi.advanceTimersByTime(15_000);
    expect(sharedStateStore.snapshot().get('plugin:gone:door')).toBeUndefined();
    expect(sharedStateStore.snapshot().get('plugin:stays:door')?.value).toBe('closed');
    expect(sharedStateStore.snapshot().get('plugin:stays:door')?.staleAt).toBeUndefined();
    vi.useRealTimers();
  });

  it('purges preserved keys when the installed-plugins fetch throws (no producer will revive them)', async () => {
    // A failed reload leaves every plugin unregistered and nothing retries
    // until the next config-driven reload — the preserved keys would gate
    // conditioned modules on a dead producer's values indefinitely. The
    // purge tombstones, so a fast successful retry still revives values
    // within the grace window.
    vi.useFakeTimers();
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    sharedStateStore.publish('plugin:foo:door', 'open');

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await loadAllPlugins();

    expect(sharedStateStore.snapshot().get('plugin:foo:door')?.staleAt).toBeTypeOf('number');
    vi.advanceTimersByTime(15_000);
    expect(sharedStateStore.snapshot().get('plugin:foo:door')).toBeUndefined();
    vi.useRealTimers();
  });

  it('purges preserved keys when the installed-plugins fetch returns non-OK', async () => {
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    sharedStateStore.publish('plugin:foo:door', 'open');

    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('Server Error', { status: 500 }));
    await loadAllPlugins();

    expect(sharedStateStore.snapshot().get('plugin:foo:door')?.staleAt).toBeTypeOf('number');
  });
});
