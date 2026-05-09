/**
 * Browser-side namespace loader.
 *
 * Pulls translation dictionaries from `/api/i18n/{locale}?ns={namespace}`,
 * caches them in a module-level `Map`, and de-duplicates concurrent requests
 * for the same `(locale, namespace)` pair.
 *
 * The server can also pre-seed the cache via `hydrateFromBlob` — this is how
 * the display route avoids a roundtrip on first paint.
 */

import type { Dictionary, Namespace } from './types';
import { FALLBACK_LOCALE } from './manifest';

type CacheKey = string; // `${locale}:${namespace}`
const CACHE = new Map<CacheKey, Dictionary>();
const PENDING = new Map<CacheKey, Promise<Dictionary>>();

const cacheKey = (locale: string, namespace: string): CacheKey => `${locale}:${namespace}`;

/**
 * Fetch (and cache) a single namespace dictionary for `locale`.
 *
 * Resolves with an empty object on network/parse failure rather than
 * rejecting — the caller's existing fallback chain handles missing data.
 *
 * **Fallback caching is intentional.** When a non-fallback locale 404s,
 * we cache the en-US fallback dictionary under the *original* `(locale,
 * namespace)` key. Subsequent calls for the same pair short-circuit with
 * the cached value rather than re-issuing the doomed network request and
 * walking the fallback chain again. There is no public "force reload"
 * path; if a test (or the runtime) needs to re-issue the load — e.g. after
 * the underlying file was added — call `__resetLoaderForTests()` to drop
 * the cache.
 */
export async function loadNamespace(locale: string, namespace: string): Promise<Dictionary> {
  const key = cacheKey(locale, namespace);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const inFlight = PENDING.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const url = `/api/i18n/${encodeURIComponent(locale)}?ns=${encodeURIComponent(namespace)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        // Fall back to en-US if a non-fallback locale 404'd. The server
        // already does its own fallback, so this is mostly a safety net for
        // when the user's locale resolves to a tag the server doesn't know.
        if (locale !== FALLBACK_LOCALE) {
          const fallback = await loadNamespace(FALLBACK_LOCALE, namespace);
          CACHE.set(key, fallback);
          return fallback;
        }
        const empty: Dictionary = {};
        CACHE.set(key, empty);
        return empty;
      }
      const json = await res.json();
      // Defensive guard before the cast: a malformed response (string,
      // number, null, array) shouldn't sneak through as a Record. The
      // outer try/catch routes us into the empty-dictionary path, and
      // the `finally` below cleans up the in-flight Promise so a future
      // call can retry.
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error(`Invalid namespace response for ${locale}/${namespace}`);
      }
      const dict = (json as Record<string, Dictionary>)[namespace] ?? {};
      CACHE.set(key, dict);
      return dict;
    } catch {
      const empty: Dictionary = {};
      CACHE.set(key, empty);
      return empty;
    } finally {
      PENDING.delete(key);
    }
  })();

  PENDING.set(key, promise);
  return promise;
}

/**
 * Seed the cache from a server-rendered blob (one entry per namespace).
 *
 * The display route inlines this blob into the HTML so the first render
 * has every namespace available without a network roundtrip. Subsequent
 * `loadNamespace` calls hit the warm cache.
 */
export function hydrateFromBlob(locale: string, blob: Record<string, Dictionary>): void {
  for (const [namespace, dict] of Object.entries(blob)) {
    CACHE.set(cacheKey(locale, namespace), dict);
  }
}

/**
 * Return the cached dictionary for `(locale, namespace)` if one is loaded,
 * otherwise `undefined`. Used by the provider to do synchronous lookups
 * without re-triggering a load.
 */
export function getCachedNamespace(locale: string, namespace: string): Dictionary | undefined {
  return CACHE.get(cacheKey(locale, namespace));
}

/**
 * Plugin IDs are validated against the same canonical pattern the plugin
 * sub-system uses everywhere else — see `PLUGIN_ID_PATTERN` in
 * `src/lib/plugin-utils.ts`. Re-declared here as a literal (rather than
 * imported) because `plugin-utils.ts` pulls in `fs`/`path` at the module
 * top level and the i18n loader is shared with browser code. Keep these
 * two regexes in sync — the test suite asserts the registration path
 * accepts every plugin ID the canonical validator accepts.
 */
const PLUGIN_NAMESPACE_ID_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * Inject a plugin-supplied dictionary into the namespace cache. Called by
 * `plugin-loader.ts` after fetching the manifest's translations file. The
 * resulting entry is keyed under `plugin:<pluginId>` so it cannot collide
 * with the built-in namespaces (`core`, `modules`, `editor`, `remote`,
 * `weather`).
 *
 * Plugin IDs must match the canonical `PLUGIN_ID_PATTERN` (alphanumeric,
 * underscore, hyphen — case-insensitive). Anything else throws so bugs in
 * the loader surface loudly rather than silently corrupting the namespace
 * cache (a `.` or `/` in a plugin ID would, for example, masquerade as a
 * sub-namespace or path segment).
 */
export function registerPluginNamespace(
  pluginId: string,
  locale: string,
  dictionary: Dictionary,
): void {
  if (typeof pluginId !== 'string' || !PLUGIN_NAMESPACE_ID_PATTERN.test(pluginId)) {
    throw new Error(
      `registerPluginNamespace: invalid pluginId "${pluginId}" — `
      + 'must match /^[a-z0-9_-]+$/i (no dots, slashes, or whitespace).',
    );
  }
  if (typeof locale !== 'string' || !locale) {
    throw new Error(`registerPluginNamespace: invalid locale "${locale}".`);
  }
  const key = cacheKey(locale, `plugin:${pluginId}`);
  if (process.env.NODE_ENV !== 'production' && CACHE.has(key)) {
    // Two manifests registering the same plugin id under the same locale
    // is almost always a bug (duplicate install, stale dev plugin, etc.).
    // Last-write wins, but warn loudly in development so the cause is
    // visible.
    console.warn(
      `[i18n] Plugin "${pluginId}" registered translations for "${locale}" twice; `
      + 'later registration overrides earlier.',
    );
  }
  CACHE.set(key, dictionary);
}

/** @internal — for tests only. Drops every cached and pending request. */
export function __resetLoaderForTests(): void {
  CACHE.clear();
  PENDING.clear();
}

// Re-exporting `Namespace` keeps the loader entry point self-contained for
// any downstream code that wants to refer to the typed namespace set.
export type { Namespace };
