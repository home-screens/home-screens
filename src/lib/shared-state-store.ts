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
 * Producer lifecycle contract — two entry styles, never mixed on one key:
 * - Hook-managed native producers (usePublishState) `claim()` their key on
 *   mount and release on unmount. The value is deleted only when the LAST
 *   claimant releases, so N instances publishing the same key (e.g. a
 *   background provider plus a visible copy) can unmount independently
 *   without wiping each other's value.
 * - Imperative producers (plugin SDK `clearState`, plugin unregister/reload)
 *   use `clearKey` / `clearKeysByPrefix`, which tear down unconditionally —
 *   including any outstanding claim counts.
 */

import { SHARED_STATE_KEY_RE, type SharedStateEntry } from '@/lib/shared-state-types';

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
  private claims = new Map<string, number>();
  private tombstoneTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Arrow-function properties, NOT method shorthand — subscribe/snapshot are
  // handed unbound to useSyncExternalStore, so `this` must be captured at
  // definition time.

  publish = (key: string, value: string): void => {
    if (typeof key !== 'string' || !SHARED_STATE_KEY_RE.test(key)) {
      console.warn(`[shared-state] rejected invalid key ${JSON.stringify(key)}`);
      return;
    }
    let next = typeof value === 'string' ? value : String(value);
    if (next.length > MAX_VALUE_LENGTH) {
      console.warn(`[shared-state] value for "${key}" truncated to ${MAX_VALUE_LENGTH} chars`);
      next = next.slice(0, MAX_VALUE_LENGTH);
    }

    const existing = this.state.get(key);
    // Coalesce identical re-publishes: no state change, no snapshot
    // invalidation, no notify. This both avoids render churn and lets a
    // duplicate producer instance publish harmlessly. A tombstoned entry is
    // never coalesced — the fresh publish must revive it.
    if (existing && existing.staleAt === undefined && existing.value === next) return;

    if (!existing && this.state.size >= MAX_KEYS) {
      console.warn(`[shared-state] key cap (${MAX_KEYS}) reached; dropped "${key}"`);
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
   * Claim shared ownership of a key. Returns an idempotent release function.
   * While at least one claim is held, another claimant unmounting never wipes
   * the value; when the LAST claim is released the key is deleted (consumers
   * see it as unknown). Invalid keys return a no-op release.
   */
  claim = (key: string): (() => void) => {
    if (typeof key !== 'string' || !SHARED_STATE_KEY_RE.test(key)) return () => {};
    this.claims.set(key, (this.claims.get(key) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.claims.get(key) ?? 0) - 1;
      if (remaining > 0) {
        this.claims.set(key, remaining);
        return;
      }
      this.claims.delete(key);
      this.clearKey(key);
    };
  };

  /**
   * Explicit clear (SDK clearState, plugin unregister, last claim release).
   * Also drops any outstanding claim count — see the lifecycle contract in
   * the module docblock. The value is NOT deleted immediately: the entry is
   * tombstoned and survives for TOMBSTONE_TTL_MS unless a fresh publish
   * revives it, so consumers ride out routine producer restarts.
   */
  clearKey = (key: string): void => {
    this.claims.delete(key);
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
    for (const key of Array.from(this.claims.keys())) {
      if (key.startsWith(prefix)) this.claims.delete(key);
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
    this.claims.clear();
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
        console.debug('[shared-state] subscriber threw:', err);
      }
    }
  }
}

export const sharedStateStore = new SharedStateStore();
