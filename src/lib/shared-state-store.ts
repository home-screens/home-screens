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

// Re-exported for existing importers; new code should import from
// shared-state-types.ts (server-safe, no store singleton).
export { SHARED_STATE_KEY_RE };
export type { SharedStateEntry };

const MAX_KEYS = 256;
const MAX_VALUE_LENGTH = 1024;

class SharedStateStore {
  private state = new Map<string, SharedStateEntry>();
  private subscribers = new Set<() => void>();
  private cachedSnapshot: ReadonlyMap<string, SharedStateEntry> | null = null;
  private claims = new Map<string, number>();

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
    // duplicate producer instance publish harmlessly.
    if (existing && existing.value === next) return;

    if (!existing && this.state.size >= MAX_KEYS) {
      console.warn(`[shared-state] key cap (${MAX_KEYS}) reached; dropped "${key}"`);
      return;
    }

    this.state.set(key, { value: next, updatedAt: Date.now() });
    this.cachedSnapshot = null;
    this.notify();
  };

  get = (key: string): SharedStateEntry | undefined => {
    return this.state.get(key);
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
   * Unconditional explicit clear (SDK clearState, plugin unregister). Also
   * drops any outstanding claim count — see the lifecycle contract in the
   * module docblock.
   */
  clearKey = (key: string): void => {
    this.claims.delete(key);
    if (!this.state.delete(key)) return;
    this.cachedSnapshot = null;
    this.notify();
  };

  /** Remove every key starting with `prefix` (plugin unregister/reload). Single notify. */
  clearKeysByPrefix = (prefix: string): void => {
    let changed = false;
    for (const key of Array.from(this.state.keys())) {
      if (key.startsWith(prefix)) {
        this.state.delete(key);
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

  /** Test-only reset; not part of the producer/consumer contract. */
  __resetForTests = (): void => {
    this.state.clear();
    this.claims.clear();
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
