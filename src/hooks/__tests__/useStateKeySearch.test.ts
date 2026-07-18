// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { usePluginStore } from '@/stores/plugin-store';
import {
  useStateKeySearch,
  useStateKeyDescriptor,
  __resetStateKeyDescriptorCacheForTests,
} from '../useStateKeySearch';
import { searchStateKeysAcrossPlugins, type SearchedStateKey } from '@/lib/state-key-search';
import type { PluginManifest } from '@/types/plugins';

/**
 * The React layer over the search aggregation: `useStateKeySearch` must
 * coalesce keystroke bursts (250ms debounce) and drop superseded answers
 * (generation guard); `useStateKeyDescriptor` must dedupe concurrent lookups,
 * serve cached matches within the TTL, and — critically — NOT cache misses:
 * a miss usually means the providing plugin hasn't loaded yet, and the whole
 * point of its `plugins` effect dependency is to retry once it has.
 */

vi.mock('@/lib/state-key-search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/state-key-search')>();
  return { ...actual, searchStateKeysAcrossPlugins: vi.fn() };
});

const mockSearch = searchStateKeysAcrossPlugins as Mock;

function makeManifest(id: string): PluginManifest {
  return {
    id,
    name: `Nice ${id}`,
    version: '1.0.0',
    description: '',
    author: '',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: id,
    category: 'Personal',
    icon: 'Home',
    defaultConfig: {},
    defaultSize: { w: 100, h: 100 },
    exports: { component: 'default' },
  };
}

const FakeComponent = () => null;

/** Register a search-capable plugin so the hooks consider search available.
 *  The exported function itself is never called — the mocked aggregation is. */
function registerSearchable(id: string): void {
  usePluginStore.getState().registerPlugin(
    `plugin:${id}`,
    FakeComponent,
    makeManifest(id),
    undefined,
    undefined,
    async () => [],
  );
}

const DOOR: SearchedStateKey = {
  key: 'plugin:ha:binary_sensor.door',
  label: 'Back Door',
  valueType: 'enum',
  valueOptions: [{ value: 'on', label: 'Open' }],
  pluginName: 'Nice ha',
};

const TEMP: SearchedStateKey = {
  key: 'plugin:ha:sensor.temp',
  label: 'Temperature',
  valueType: 'numeric',
  unit: '°F',
  pluginName: 'Nice ha',
};

beforeEach(() => {
  usePluginStore.getState().clearPlugins();
  usePluginStore.getState().setPluginSettingsMap(new Map());
  __resetStateKeyDescriptorCacheForTests();
  mockSearch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useStateKeySearch', () => {
  it('coalesces a keystroke burst into a single fan-out after the debounce', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useStateKeySearch(q, true),
      { initialProps: { q: 'd' } },
    );
    rerender({ q: 'do' });
    rerender({ q: 'doo' });
    rerender({ q: 'door' });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(result.current.searching).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mockSearch).toHaveBeenCalledExactlyOnceWith('door');
    expect(result.current.results).toEqual([DOOR]);
    expect(result.current.searching).toBe(false);
  });

  it('threads a limit override into the fan-out (the browse tab asks for a bigger pool)', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    renderHook(() => useStateKeySearch('door', true, { limit: 200 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mockSearch).toHaveBeenCalledExactlyOnceWith('door', { limit: 200 });
  });

  it('a fresh opts object with the same limit does not re-fire the fan-out', async () => {
    // The browse tab passes an inline `{ limit }` literal, so every render
    // hands the hook a new object. The effect must depend on the scalar limit,
    // not the object identity — regressing that reintroduces a search per
    // render and still passes every other test here.
    vi.useFakeTimers();
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    const { rerender } = renderHook(
      ({ opts }: { opts: { limit: number } }) => useStateKeySearch('door', true, opts),
      { initialProps: { opts: { limit: 200 } } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);

    rerender({ opts: { limit: 200 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
  });

  it('a slow older query never overwrites a newer answer', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');
    let resolveOld: (v: SearchedStateKey[]) => void = () => {};
    mockSearch
      .mockImplementationOnce(() => new Promise<SearchedStateKey[]>((res) => { resolveOld = res; }))
      .mockResolvedValueOnce([DOOR]);

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useStateKeySearch(q, true),
      { initialProps: { q: 'temp' } },
    );
    // First query fires and hangs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(mockSearch).toHaveBeenCalledWith('temp');

    // Second query fires and answers while the first is still pending.
    rerender({ q: 'door' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.results).toEqual([DOOR]);

    // The stale answer finally lands — and must be dropped.
    await act(async () => {
      resolveOld([TEMP]);
    });
    expect(result.current.results).toEqual([DOOR]);
    expect(result.current.searching).toBe(false);
  });

  it('returns a stable empty array while disabled and never searches', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useStateKeySearch(q, false),
      { initialProps: { q: 'door' } },
    );
    const first = result.current.results;
    rerender({ q: 'doors' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockSearch).not.toHaveBeenCalled();
    // Identity-stable so downstream useMemo consumers don't churn per render.
    expect(result.current.results).toBe(first);
    expect(result.current.searching).toBe(false);
  });

  it('clears `searching` even if the aggregation layer breaks its never-rejects invariant', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');
    mockSearch.mockRejectedValueOnce(new Error('invariant broken'));

    const { result } = renderHook(() => useStateKeySearch('door', true));
    expect(result.current.searching).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.searching).toBe(false);
    expect(result.current.results).toEqual([]);
  });
});

describe('useStateKeyDescriptor', () => {
  it('resolves the matching descriptor for a committed key', async () => {
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR, TEMP]);

    const { result } = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(result.current).toEqual(DOOR);
    expect(mockSearch).toHaveBeenCalledExactlyOnceWith(DOOR.key);
  });

  it('short-circuits to null for empty or bus-invalid keys without searching', async () => {
    registerSearchable('ha');
    const empty = renderHook(() => useStateKeyDescriptor(''));
    const invalid = renderHook(() => useStateKeyDescriptor('Not A Key!'));
    await act(async () => {});
    expect(empty.result.current).toBeNull();
    expect(invalid.result.current).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('dedupes concurrent lookups for the same key into one fan-out', async () => {
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    const a = renderHook(() => useStateKeyDescriptor(DOOR.key));
    const b = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(a.result.current).toEqual(DOOR);
    expect(b.result.current).toEqual(DOOR);
  });

  it('serves a match from cache within the TTL and re-fetches after it expires', async () => {
    vi.useFakeTimers();
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    const first = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(first.result.current).toEqual(DOOR);
    first.unmount();

    // Remount within the TTL: served from cache, no second fan-out.
    const second = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(second.result.current).toEqual(DOOR);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    second.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    const third = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(third.result.current).toEqual(DOOR);
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache a miss: the descriptor appears once the providing plugin loads', async () => {
    // Editor open before plugins finish loading: the first lookup misses.
    registerSearchable('early');
    mockSearch.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(mockSearch).toHaveBeenCalledTimes(1);

    // The providing plugin registers; the plugins-dependency retry must
    // actually re-query instead of hitting a cached null.
    mockSearch.mockResolvedValue([DOOR]);
    await act(async () => {
      registerSearchable('ha');
    });
    await act(async () => {});
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual(DOOR);
  });

  it('drops cached matches when the plugin set changes', async () => {
    registerSearchable('ha');
    mockSearch.mockResolvedValue([DOOR]);

    const first = renderHook(() => useStateKeyDescriptor(DOOR.key));
    await act(async () => {});
    expect(first.result.current).toEqual(DOOR);
    expect(mockSearch).toHaveBeenCalledTimes(1);

    // A reload/register swaps the plugin map; the vocabulary may have
    // changed, so the cached descriptor must not outlive the old set.
    await act(async () => {
      registerSearchable('other');
    });
    await act(async () => {});
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(first.result.current).toEqual(DOOR);
  });
});
