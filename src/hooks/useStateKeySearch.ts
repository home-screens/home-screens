'use client';

// Editor hooks over the plugin key-search aggregation (state-key-search.ts).
//
// `useStateKeySearch` powers the condition builder's combobox: debounced
// 250ms so a keystroke burst issues one fan-out, generation-guarded so a
// slow older query can never overwrite a newer answer.
//
// `useStateKeyDescriptor` resolves the descriptor for a COMMITTED source key
// so the value editor can offer that key's raw-value vocabulary as a select.
// Lookups go through a short module-level cache: every condition row on the
// panel may ask for its key on mount, and without the cache each row would
// fan out its own search.

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePluginStore } from '@/stores/plugin-store';
import { SHARED_STATE_KEY_RE } from '@/lib/shared-state-types';
import {
  pluginHasStateKeySearch,
  searchStateKeysAcrossPlugins,
  type SearchedStateKey,
} from '@/lib/state-key-search';

const DEBOUNCE_MS = 250;

// Stable empty result for disabled/unsearchable renders — a fresh [] every
// render would churn every downstream useMemo keyed on the results.
const NO_RESULTS: SearchedStateKey[] = [];

/**
 * Debounced fan-out search across every plugin exporting `searchStateKeys`.
 * `enabled` should track whether the dropdown is open — no background
 * searching while the user isn't looking at suggestions.
 */
export function useStateKeySearch(
  query: string,
  enabled: boolean,
): { results: SearchedStateKey[]; searching: boolean } {
  const [results, setResults] = useState<SearchedStateKey[]>([]);
  const [searching, setSearching] = useState(false);
  const genRef = useRef(0);

  // Subscribe to the plugin map (not a snapshot) so search capability
  // appears as soon as plugin loading finishes after editor boot.
  const plugins = usePluginStore((s) => s.plugins);
  const searchable = useMemo(
    () => Array.from(plugins.values()).some(pluginHasStateKeySearch),
    [plugins],
  );

  useEffect(() => {
    const gen = ++genRef.current;
    if (!enabled || !searchable) {
      setResults(NO_RESULTS);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchStateKeysAcrossPlugins(query);
        if (genRef.current !== gen) return; // a newer query superseded this one
        setResults(found);
      } catch {
        // The aggregation layer never rejects today; if that invariant ever
        // breaks upstream, degrade to no suggestions rather than leaving an
        // unhandled rejection with `searching` stuck true.
        if (genRef.current === gen) setResults(NO_RESULTS);
      } finally {
        if (genRef.current === gen) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, enabled, searchable]);

  return { results: enabled && searchable ? results : NO_RESULTS, searching };
}

// ── Committed-key descriptor lookup ─────────────────────────────────────────

const DESCRIPTOR_TTL_MS = 30_000;
const descriptorCache = new Map<string, { at: number; value: SearchedStateKey }>();
const descriptorInflight = new Map<string, Promise<SearchedStateKey | null>>();
// The plugin map the cache was built against. Any register/unregister/reload
// swaps the map, and every cached descriptor may be stale against the new
// set, so the whole cache is dropped rather than aged out per entry.
let cachePlugins: unknown = null;
let cacheGeneration = 0;

/** @internal — clears the lookup cache between tests. */
export function __resetStateKeyDescriptorCacheForTests(): void {
  descriptorCache.clear();
  descriptorInflight.clear();
  cachePlugins = null;
  cacheGeneration++;
}

function lookupDescriptor(key: string): Promise<SearchedStateKey | null> {
  const { plugins } = usePluginStore.getState();
  if (plugins !== cachePlugins) {
    cachePlugins = plugins;
    cacheGeneration++;
    descriptorCache.clear();
    descriptorInflight.clear();
  }
  const cached = descriptorCache.get(key);
  if (cached && Date.now() - cached.at < DESCRIPTOR_TTL_MS) {
    return Promise.resolve(cached.value);
  }
  let inflight = descriptorInflight.get(key);
  if (!inflight) {
    const gen = cacheGeneration;
    // The full key doubles as the query; search implementations match on the
    // bus key as well as the friendly label. Never rejects (the aggregation
    // layer swallows plugin failures), so no catch path is needed here.
    // Only matches are cached: a miss usually means the providing plugin
    // hasn't loaded yet, and caching it would turn the plugins-dependency
    // retry in useStateKeyDescriptor into a 30s no-op. The inflight map
    // already collapses the concurrent fan-out the cache exists for.
    inflight = searchStateKeysAcrossPlugins(key).then((results) => {
      const match = results.find((r) => r.key === key) ?? null;
      if (gen === cacheGeneration) {
        if (match) descriptorCache.set(key, { at: Date.now(), value: match });
        descriptorInflight.delete(key);
      }
      return match;
    });
    descriptorInflight.set(key, inflight);
  }
  return inflight;
}

/**
 * Descriptor for a committed source key, or null while unknown/unresolvable.
 * Null is the safe default everywhere: the value editor renders the plain
 * text input, exactly today's behavior.
 */
export function useStateKeyDescriptor(key: string): SearchedStateKey | null {
  const [descriptor, setDescriptor] = useState<SearchedStateKey | null>(null);
  const plugins = usePluginStore((s) => s.plugins);

  useEffect(() => {
    if (!key || !SHARED_STATE_KEY_RE.test(key)) {
      setDescriptor(null);
      return;
    }
    let alive = true;
    lookupDescriptor(key).then((d) => {
      if (alive) setDescriptor(d);
    });
    return () => {
      alive = false;
    };
    // plugins in deps: retry the lookup once plugin loading completes.
  }, [key, plugins]);

  return descriptor;
}
