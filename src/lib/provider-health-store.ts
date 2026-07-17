/**
 * Provider-health bus: a per-tab store of plugins whose upstream service is
 * currently down. Plugins report outages through
 * `__HS_SDK__.reportProviderHealth(pluginId, status)`; the editor surfaces the
 * message next to any condition, rule, or bus key that depends on that plugin,
 * so a hidden module reads as "the service is unreachable" instead of "your
 * condition is wrong".
 *
 * Same shape and lifecycle as `shared-state-store.ts`: arrow-function
 * `subscribe`/`snapshot` for `useSyncExternalStore`, a cached snapshot that is
 * referentially stable between changes, and a hardened write path — the report
 * comes from third-party plugin code, so `pluginId`, `message`, and `since`
 * are all sanitized and nothing thrown by a garbage report escapes.
 *
 * Reporting contract (matched by the plugin, do not change here):
 *   type ProviderHealthStatus = { ok: true } | { ok: false; message: string; since: number }
 * `since` is the epoch ms of the outage's FIRST failure, stable across the
 * outage; the plugin re-reports `{ok:false}` with the same `since` on each
 * consecutive failure, reports `{ok:true}` exactly once on recovery, and
 * reports nothing while healthy. `message` is already localized by the plugin
 * and is rendered verbatim.
 */

import { logger } from '@/lib/logger';

const log = logger('provider-health');

/** One unhealthy provider, keyed by lowercased plugin id in the store. */
export interface ProviderHealthEntry {
  /** Localized by the plugin, rendered verbatim; capped defensively. */
  message: string;
  /** Epoch ms of the outage's first failure; stable across the outage. */
  since: number;
}

export type ProviderHealthStatus =
  | { ok: true }
  | { ok: false; message: string; since: number };

/**
 * Same charset as `PLUGIN_ID_PATTERN` in `plugin-utils.ts`, inlined so this
 * client store doesn't pull in that module's Node `fs`/`path` imports. Ids are
 * lowercased before keying so the `plugin:<id>:` namespace match lines up with
 * the shared-state bus (which lowercases the same way).
 */
const PLUGIN_ID_RE = /^[a-z0-9_-]+$/i;
const MAX_MESSAGE_LENGTH = 200;
/** Bounds a hostile/looping reporter — far more than any real install has. */
const MAX_ENTRIES = 64;

class ProviderHealthStore {
  private state = new Map<string, ProviderHealthEntry>();
  private subscribers = new Set<() => void>();
  private cachedSnapshot: ReadonlyMap<string, ProviderHealthEntry> | null = null;

  // Arrow-function properties, NOT method shorthand — subscribe/snapshot are
  // handed unbound to useSyncExternalStore, so `this` must be captured here.

  /**
   * Record a health report. `{ok:true}` clears the plugin's entry; an
   * unhealthy report stores/updates it. Invalid plugin ids and malformed
   * payloads are dropped without throwing (third-party input).
   */
  report = (pluginId: string, status: ProviderHealthStatus): void => {
    if (typeof pluginId !== 'string' || !PLUGIN_ID_RE.test(pluginId)) {
      log.warn(`rejected invalid pluginId ${JSON.stringify(pluginId)}`);
      return;
    }
    if (!status || typeof status !== 'object') return;
    const id = pluginId.toLowerCase();

    if ((status as { ok?: unknown }).ok === true) {
      if (this.state.delete(id)) {
        this.cachedSnapshot = null;
        this.notify();
      }
      return;
    }

    const raw = status as { message?: unknown; since?: unknown };
    let message = typeof raw.message === 'string' ? raw.message : String(raw.message ?? '');
    if (message.length > MAX_MESSAGE_LENGTH) message = message.slice(0, MAX_MESSAGE_LENGTH);

    const now = Date.now();
    // A non-finite or future `since` (clock skew, hostile input) is clamped to
    // now so "since <time>" never renders a time in the future.
    let since = typeof raw.since === 'number' && Number.isFinite(raw.since) ? raw.since : now;
    if (since > now) since = now;

    const existing = this.state.get(id);
    // Coalesce identical re-reports (the plugin re-sends the same outage on
    // every consecutive failure) — no snapshot churn, no re-render.
    if (existing && existing.message === message && existing.since === since) return;
    if (!existing && this.state.size >= MAX_ENTRIES) {
      log.warn(`entry cap (${MAX_ENTRIES}) reached; dropped "${id}"`);
      return;
    }

    this.state.set(id, { message, since });
    this.cachedSnapshot = null;
    this.notify();
  };

  /** Referentially stable between changes (useSyncExternalStore safe). */
  snapshot = (): ReadonlyMap<string, ProviderHealthEntry> => {
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

  /** Test-only reset; production code never clears the whole store. */
  __resetForTests = (): void => {
    this.state.clear();
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

export const providerHealthStore = new ProviderHealthStore();
