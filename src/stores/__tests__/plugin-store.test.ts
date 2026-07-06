import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { PluginManifest, PluginError } from '@/types/plugins';

/**
 * Tests for the plugin Zustand store. Covers the reactive-state side of
 * the plugin lifecycle: registration, unregistration, error tracking, and
 * the re-entrancy guard in `loadPlugins`. Side effects into
 * `module-registry` and `fetch-keys` are mocked so tests stay scoped to
 * the store's own semantics.
 */

// Mock the module-registry + fetch-keys side effects so tests don't have to
// scrub a shared global registry between runs.
const mockUnregisterModule = vi.fn();
const mockDeregisterFetchKey = vi.fn();

vi.mock('@/lib/module-registry', () => ({
  unregisterModule: (type: string) => mockUnregisterModule(type),
}));

vi.mock('@/lib/fetch-keys', () => ({
  deregisterFetchKey: (type: string) => mockDeregisterFetchKey(type),
}));

// Mock plugin-loader so loadPlugins doesn't try to read `data/plugins/`.
const mockLoadAllPlugins = vi.fn();
vi.mock('@/lib/plugin-loader', () => ({
  loadAllPlugins: () => mockLoadAllPlugins(),
}));

// Dynamic import to get a fresh store instance per test.
let usePluginStore: typeof import('@/stores/plugin-store').usePluginStore;

beforeEach(async () => {
  vi.resetModules();
  mockUnregisterModule.mockClear();
  mockDeregisterFetchKey.mockClear();
  mockLoadAllPlugins.mockReset();
  const mod = await import('@/stores/plugin-store');
  usePluginStore = mod.usePluginStore;
});

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
  };
}

const FakeComponent = (() => null) as unknown as ComponentType<Record<string, unknown>>;

describe('plugin-store registration', () => {
  it('registers a plugin and exposes it on the plugins map', () => {
    const { registerPlugin } = usePluginStore.getState();
    registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    expect(usePluginStore.getState().plugins.has('plugin:foo')).toBe(true);
    expect(usePluginStore.getState().plugins.get('plugin:foo')?.component).toBe(FakeComponent);
  });

  it('stores the manifest and optional config section alongside the component', () => {
    const configSection = (() => null) as unknown as ComponentType<never>;
    const manifest = makeManifest('foo', 'foo');
    const { registerPlugin } = usePluginStore.getState();
    registerPlugin('plugin:foo', FakeComponent, manifest, configSection as never);
    const loaded = usePluginStore.getState().plugins.get('plugin:foo')!;
    expect(loaded.manifest).toBe(manifest);
    expect(loaded.configSection).toBe(configSection);
  });

  it('clears a prior error for the same plugin id on re-register', () => {
    const { setError, registerPlugin } = usePluginStore.getState();
    const err: PluginError = { message: 'boom', phase: 'load' };
    setError('foo', err);
    expect(usePluginStore.getState().errors.has('foo')).toBe(true);

    registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    expect(usePluginStore.getState().errors.has('foo')).toBe(false);
  });

  it('re-registering the same moduleType replaces the previous entry', () => {
    const { registerPlugin } = usePluginStore.getState();
    const first = (() => null) as unknown as ComponentType<Record<string, unknown>>;
    const second = (() => null) as unknown as ComponentType<Record<string, unknown>>;
    registerPlugin('plugin:foo', first, makeManifest('foo', 'foo'));
    registerPlugin('plugin:foo', second, makeManifest('foo', 'foo'));
    expect(usePluginStore.getState().plugins.get('plugin:foo')?.component).toBe(second);
  });

  it('produces a new Map reference on register so subscribers re-render', () => {
    // Zustand selectors using `state.plugins.get(x)` rely on reference
    // changes to avoid stale reads across renders. Mutating the existing
    // Map in place would silently break every subscriber.
    const before = usePluginStore.getState().plugins;
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    expect(usePluginStore.getState().plugins).not.toBe(before);
  });
});

describe('plugin-store unregister', () => {
  beforeEach(() => {
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    usePluginStore.getState().registerPlugin('plugin:bar', FakeComponent, makeManifest('bar', 'bar'));
  });

  it('removes a plugin from the plugins map', () => {
    usePluginStore.getState().unregisterPlugin('plugin:foo');
    expect(usePluginStore.getState().plugins.has('plugin:foo')).toBe(false);
    expect(usePluginStore.getState().plugins.has('plugin:bar')).toBe(true);
  });

  it('calls module-registry.unregisterModule for the type', () => {
    usePluginStore.getState().unregisterPlugin('plugin:foo');
    expect(mockUnregisterModule).toHaveBeenCalledWith('plugin:foo');
  });

  it('does not call deregisterFetchKey on single-unregister (only clearPlugins does)', () => {
    // unregister is used for per-plugin removal and the fetch-keys cleanup
    // was intentionally scoped to clearPlugins so that a plugin swap
    // doesn't purge a key another code path just registered.
    usePluginStore.getState().unregisterPlugin('plugin:foo');
    expect(mockDeregisterFetchKey).not.toHaveBeenCalled();
  });
});

describe('plugin-store clearPlugins', () => {
  beforeEach(() => {
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    usePluginStore.getState().registerPlugin('plugin:bar', FakeComponent, makeManifest('bar', 'bar'));
    usePluginStore.getState().setError('orphan', { message: 'gone', phase: 'load' });
  });

  it('removes every plugin from the reactive map', () => {
    usePluginStore.getState().clearPlugins();
    expect(usePluginStore.getState().plugins.size).toBe(0);
  });

  it('clears every tracked error, including for plugins that never registered', () => {
    usePluginStore.getState().clearPlugins();
    expect(usePluginStore.getState().errors.size).toBe(0);
  });

  it('calls unregisterModule and deregisterFetchKey for every plugin type', () => {
    usePluginStore.getState().clearPlugins();
    expect(mockUnregisterModule).toHaveBeenCalledWith('plugin:foo');
    expect(mockUnregisterModule).toHaveBeenCalledWith('plugin:bar');
    expect(mockDeregisterFetchKey).toHaveBeenCalledWith('plugin:foo');
    expect(mockDeregisterFetchKey).toHaveBeenCalledWith('plugin:bar');
  });
});

describe('plugin-store error tracking', () => {
  it('stores a load error keyed by pluginId', () => {
    const err: PluginError = { message: 'bundle parse failed', phase: 'load' };
    usePluginStore.getState().setError('broken', err);
    expect(usePluginStore.getState().errors.get('broken')).toEqual(err);
  });

  it('replaces an existing error for the same id', () => {
    usePluginStore.getState().setError('broken', { message: 'first', phase: 'load' });
    usePluginStore.getState().setError('broken', { message: 'second', phase: 'load' });
    expect(usePluginStore.getState().errors.get('broken')?.message).toBe('second');
  });

  it('produces a new Map reference so subscribers re-render', () => {
    const before = usePluginStore.getState().errors;
    usePluginStore.getState().setError('broken', { message: 'err', phase: 'load' });
    expect(usePluginStore.getState().errors).not.toBe(before);
  });
});

describe('plugin-store loadPlugins re-entrancy', () => {
  it('flips loading true → false across a completed load', async () => {
    mockLoadAllPlugins.mockResolvedValue(undefined);
    // Before the call the store is in its initial `loading: true` state;
    // assert on the post-call transition to false.
    await usePluginStore.getState().loadPlugins();
    expect(usePluginStore.getState().loading).toBe(false);
  });

  it('invokes loadAllPlugins once per independent completed call', async () => {
    // Sequential, fully-awaited calls each start a fresh run — no dedup
    // when there's no in-flight promise to share.
    mockLoadAllPlugins.mockResolvedValue(undefined);
    await usePluginStore.getState().loadPlugins();
    await usePluginStore.getState().loadPlugins();
    expect(mockLoadAllPlugins).toHaveBeenCalledTimes(2);
  });

  it('swallows loader exceptions but still resolves loading=false', async () => {
    // Production plugin load failures should never brick the editor —
    // the store logs and moves on so the rest of the UI keeps working.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLoadAllPlugins.mockRejectedValue(new Error('kaboom'));

    await usePluginStore.getState().loadPlugins();
    expect(usePluginStore.getState().loading).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('plugin-store shared-state cleanup', () => {
  // The store module is re-imported per test (vi.resetModules), so grab the
  // SAME shared-state-store instance the fresh plugin-store closed over.
  async function getSharedStateStore() {
    const mod = await import('@/lib/shared-state-store');
    return mod.sharedStateStore;
  }

  it('unregisterPlugin purges the plugin state-key namespace (lowercased id, after tombstone TTL)', async () => {
    vi.useFakeTimers();
    const store = await getSharedStateStore();
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('Foo', 'foo'));
    store.publish('plugin:foo:door', 'open');
    store.publish('plugin:bar:door', 'closed');

    usePluginStore.getState().unregisterPlugin('plugin:foo');

    // Tombstoned first (grace window), deleted for real after the TTL
    expect(store.snapshot().get('plugin:foo:door')?.staleAt).toBeTypeOf('number');
    vi.advanceTimersByTime(15_000);
    expect(store.snapshot().get('plugin:foo:door')).toBeUndefined();
    expect(store.snapshot().get('plugin:bar:door')?.value).toBe('closed');
    vi.useRealTimers();
  });

  it('clearPlugins purges every registered plugin namespace (after tombstone TTL)', async () => {
    vi.useFakeTimers();
    const store = await getSharedStateStore();
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    usePluginStore.getState().registerPlugin('plugin:bar', FakeComponent, makeManifest('bar', 'bar'));
    store.publish('plugin:foo:door', 'open');
    store.publish('plugin:bar:door', 'closed');
    store.publish('host.key', 'kept');

    usePluginStore.getState().clearPlugins();
    vi.advanceTimersByTime(15_000);

    expect(store.snapshot().get('plugin:foo:door')).toBeUndefined();
    expect(store.snapshot().get('plugin:bar:door')).toBeUndefined();
    expect(store.snapshot().get('host.key')?.value).toBe('kept');
    vi.useRealTimers();
  });

  it('clearPlugins({ preserveSharedState: true }) keeps every published key (reload swap)', async () => {
    // The plugin reload path clears registrations but must NOT purge state
    // keys — otherwise every module conditioned on a plugin key unmounts for
    // the seconds between the purge and the reloaded producer's first publish.
    const store = await getSharedStateStore();
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    store.publish('plugin:foo:door', 'open');

    usePluginStore.getState().clearPlugins({ preserveSharedState: true });

    expect(usePluginStore.getState().plugins.size).toBe(0);
    expect(store.snapshot().get('plugin:foo:door')?.value).toBe('open');
  });

  it('clearPlugins({ preserveSharedState: true }) still unregisters modules and fetch keys', () => {
    usePluginStore.getState().registerPlugin('plugin:foo', FakeComponent, makeManifest('foo', 'foo'));
    usePluginStore.getState().clearPlugins({ preserveSharedState: true });
    expect(mockUnregisterModule).toHaveBeenCalledWith('plugin:foo');
    expect(mockDeregisterFetchKey).toHaveBeenCalledWith('plugin:foo');
  });
});
