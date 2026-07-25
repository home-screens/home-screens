/**
 * Shared-state bus: producers (background-provider modules, plugins via the
 * SDK) publish named string values; consumers (module visibility conditions)
 * read them reactively. Last-value + replay semantics — a subscriber joining
 * late sees the current state via `snapshot()` rather than missing values.
 *
 * This deliberately does NOT reuse `eventBus`: its typed `EventMap` is a
 * closed union of host-known channels, while this store needs an open
 * runtime keyspace (plugin-derived keys like `plugin:ha:binary_sensor.door`).
 * Because the write path is open, it is hardened: key format, key count,
 * and value length are all capped.
 *
 * Producer lifecycle contract — clears are UNCONDITIONAL. `clearKey` /
 * `clearKeysByPrefix` (plugin SDK `clearState`, plugin unregister/reload)
 * tombstone the key regardless of how many producers are publishing it.
 *
 * There is deliberately no refcount. The SDK's publish/clear API is a plain
 * `(pluginId, key)` pair with no per-producer handle, so the store cannot tell
 * two publishers of one key apart and could not decrement correctly. A
 * refcounting `claim()` existed for a native hook that never shipped a single
 * production caller, which meant two lifecycle models coexisted for one key
 * space with nothing enforcing the "never mixed" rule.
 *
 * The practical consequence for plugin authors: do NOT call `clearState` from a
 * component's unmount cleanup. Screen rotation unmounts modules routinely, and
 * a module clearing a key on unmount will tombstone a value its own still-alive
 * `stateProvider` owns. Clear a key only when the value genuinely no longer
 * exists (entity removed, connection dropped for good). The 15s tombstone grace
 * below limits the damage but does not remove it: an event-driven provider that
 * only republishes on the next upstream change can leave the key unknown, and
 * every module conditioned on it hidden, for hours.
 */

import { SHARED_STATE_KEY_RE, type SharedStateEntry } from '@/lib/shared-state-types';
import { logger } from '@/lib/logger';

const log = logger('shared-state');

const MAX_KEYS = 256;
const MAX_VALUE_LENGTH = 1024;

/**
 * Grace window for cleared keys. `clearKey` / `clearKeysByPrefix` tombstone
 * the entry (keep its last value, mark `staleAt`) and only delete for real
 * after this long with no fresh publish. Consumers keep seeing the last
 * value across routine producer restarts — plugin reloads, dev-plugin
 * hot-reload, background-provider remounts — instead of every conditioned
 * module unmounting the instant the old producer tears down. 15s covers a
 * slow plugin's fetch+mount+first-publish cycle; a truly removed producer's
 * keys still disappear shortly after.
 */
const TOMBSTONE_TTL_MS = 15_000;

class SharedStateStore {
  private state = new Map<string, SharedStateEntry>();
  private subscribers = new Set<() => void>();
  private cachedSnapshot: ReadonlyMap<string, SharedStateEntry> | null = null;
  private tombstoneTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Arrow-function properties, NOT method shorthand — subscribe/snapshot are
  // handed unbound to useSyncExternalStore, so `this` must be captured at
  // definition time.

  publish = (key: string, value: string): void => {
    if (typeof key !== 'string' || !SHARED_STATE_KEY_RE.test(key)) {
      log.warn(`rejected invalid key ${JSON.stringify(key)}`);
      return;
    }
    let next = typeof value === 'string' ? value : String(value);
    if (next.length > MAX_VALUE_LENGTH) {
      log.warn(`value for "${key}" truncated to ${MAX_VALUE_LENGTH} chars`);
      next = next.slice(0, MAX_VALUE_LENGTH);
    }

    const existing = this.state.get(key);
    // Coalesce identical re-publishes: no state change, no snapshot
    // invalidation, no notify. This both avoids render churn and lets a
    // duplicate producer instance publish harmlessly. A tombstoned entry is
    // never coalesced — the fresh publish must revive it.
    if (existing && existing.staleAt === undefined && existing.value === next) return;

    if (!existing && this.state.size >= MAX_KEYS) {
      log.warn(`key cap (${MAX_KEYS}) reached; dropped "${key}"`);
      return;
    }

    this.cancelTombstone(key);
    this.state.set(key, { value: next, updatedAt: Date.now() });
    this.cachedSnapshot = null;
    this.notify();
  };

  /**
   * Referentially stable between state changes — useSyncExternalStore calls
   * this on every render and re-renders whenever the reference changes, so
   * building a fresh Map per call would be an infinite render loop.
   */
  snapshot = (): ReadonlyMap<string, SharedStateEntry> => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = new Map(this.state);
    }
    return this.cachedSnapshot;
  };

  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  };

  /**
   * Explicit clear (SDK clearState, plugin unregister/reload). Unconditional —
   * see the lifecycle contract in the module docblock; there is no refcount and
   * a second producer of the same key does not hold it alive. The value is NOT
   * deleted immediately: the entry is
   * tombstoned and survives for TOMBSTONE_TTL_MS unless a fresh publish
   * revives it, so consumers ride out routine producer restarts.
   */
  clearKey = (key: string): void => {
    if (this.tombstone(key)) {
      this.cachedSnapshot = null;
      this.notify();
    }
  };

  /** Tombstone every key starting with `prefix` (plugin unregister/reload). Single notify. */
  clearKeysByPrefix = (prefix: string): void => {
    let changed = false;
    for (const key of Array.from(this.state.keys())) {
      if (key.startsWith(prefix) && this.tombstone(key)) {
        changed = true;
      }
    }
    if (changed) {
      this.cachedSnapshot = null;
      this.notify();
    }
  };

  /**
   * Mark an entry stale and arm its deletion timer. Returns true when the
   * entry state changed (caller invalidates + notifies). Already-tombstoned
   * keys keep their original timer — repeated clears must not extend the
   * window indefinitely.
   */
  private tombstone(key: string): boolean {
    const existing = this.state.get(key);
    if (!existing || existing.staleAt !== undefined) return false;
    this.state.set(key, { ...existing, staleAt: Date.now() });
    const timer = setTimeout(() => {
      this.tombstoneTimers.delete(key);
      const entry = this.state.get(key);
      if (entry?.staleAt === undefined) return; // revived meanwhile
      this.state.delete(key);
      this.cachedSnapshot = null;
      this.notify();
    }, TOMBSTONE_TTL_MS);
    // Node (SSR/tests): don't let a pending sweep keep the process alive.
    (timer as { unref?: () => void }).unref?.();
    this.tombstoneTimers.set(key, timer);
    return true;
  }

  private cancelTombstone(key: string): void {
    const timer = this.tombstoneTimers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.tombstoneTimers.delete(key);
    }
  }

  /** Test-only reset; not part of the producer/consumer contract. */
  __resetForTests = (): void => {
    this.state.clear();
    for (const timer of this.tombstoneTimers.values()) clearTimeout(timer);
    this.tombstoneTimers.clear();
    this.cachedSnapshot = null;
    this.subscribers.clear();
  };

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch (err) {
        log.debug('subscriber threw:', err);
      }
    }
  }
}

export const sharedStateStore = new SharedStateStore();
