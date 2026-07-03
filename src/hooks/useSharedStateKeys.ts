'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { sharedStateStore } from '@/lib/shared-state-store';
import type { SharedStateEntry } from '@/lib/shared-state-types';

const EMPTY: ReadonlyMap<string, SharedStateEntry> = new Map();
const noopSubscribe = () => () => {};

interface SelectionCache {
  keys: readonly string[];
  /** Full-store snapshot the selection was computed from (referentially stable between publishes). */
  full: ReadonlyMap<string, SharedStateEntry>;
  selected: ReadonlyMap<string, SharedStateEntry>;
}

/** Entry objects are replaced on change, so reference-comparing them is exact. */
function selectedEqual(
  a: ReadonlyMap<string, SharedStateEntry>,
  b: ReadonlyMap<string, SharedStateEntry>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, entry] of b) {
    if (a.get(key) !== entry) return false;
  }
  return true;
}

/**
 * Subscribe to only the given shared-state keys. Returns a referentially
 * stable selected view that changes identity ONLY when a referenced key's
 * entry changes — publishes to unreferenced keys never re-render the caller,
 * and zero keys means no store subscription at all.
 *
 * `keys` must be referentially stable between renders (memoize in the
 * caller). The ref-cache mutation inside getSnapshot is the standard
 * memoized-selector pattern (same shape as useSyncExternalStoreWithSelector);
 * getSnapshot returns the same reference between store changes, which is
 * React's loop-safety requirement. The server snapshot is the constant EMPTY
 * map — SSR renders as if all keys are unknown and the client corrects on
 * hydration, matching the store's always-empty server singleton.
 */
export function useSharedStateKeys(keys: readonly string[]): ReadonlyMap<string, SharedStateEntry> {
  const cacheRef = useRef<SelectionCache | null>(null);

  const getSnapshot = useCallback((): ReadonlyMap<string, SharedStateEntry> => {
    if (keys.length === 0) return EMPTY;
    const full = sharedStateStore.snapshot();
    const cache = cacheRef.current;
    if (cache && cache.full === full && cache.keys === keys) return cache.selected;
    const next = new Map<string, SharedStateEntry>();
    for (const key of keys) {
      const entry = full.get(key);
      if (entry) next.set(key, entry);
    }
    const prev = cache?.keys === keys ? cache.selected : null;
    const selected = prev && selectedEqual(prev, next) ? prev : next;
    cacheRef.current = { keys, full, selected };
    return selected;
  }, [keys]);

  return useSyncExternalStore(
    keys.length === 0 ? noopSubscribe : sharedStateStore.subscribe,
    getSnapshot,
    () => EMPTY,
  );
}
