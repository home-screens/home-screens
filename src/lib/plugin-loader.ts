import type { ComponentType } from 'react';
import type { PluginManifest, InstalledPlugin, PluginConfigSectionProps } from '@/types/plugins';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import { usePluginStore } from '@/stores/plugin-store';
import { registerPluginModule } from '@/lib/module-registry';
import { registerFetchKey } from '@/lib/fetch-keys';
import { compareSemver } from '@/lib/semver';
import { displayFetch } from '@/lib/display-fetch';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  registerPluginNamespace,
  resolveLocaleChain,
} from '@/i18n';
import type { Dictionary } from '@/i18n';

// ---------------------------------------------------------------------------
// Dev-mode state — local plugin loading from dev server URLs
// ---------------------------------------------------------------------------

export interface DevPlugin {
  url: string;
  manifest: PluginManifest;
}

/** Dev plugins keyed by pluginId, stored in localStorage only */
const DEV_PLUGINS_KEY = 'hs:devPlugins';

function getDevPlugins(): Map<string, DevPlugin> {
  try {
    const raw = localStorage.getItem(DEV_PLUGINS_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

function saveDevPlugins(devPlugins: Map<string, DevPlugin>): void {
  localStorage.setItem(DEV_PLUGINS_KEY, JSON.stringify(Object.fromEntries(devPlugins)));
}

/**
 * Load a plugin from a local dev server URL.
 * Fetches manifest.json and bundle.js from the URL root, registers the plugin,
 * and stores the mapping in localStorage (not persisted to disk config).
 */
export async function loadDevPlugin(url: string): Promise<void> {
  const store = usePluginStore.getState();
  // Normalise: strip trailing slash
  const base = url.replace(/\/+$/, '');

  // 1. Fetch manifest from dev server
  const manifestRes = await fetch(`${base}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`Dev manifest fetch failed: ${manifestRes.status}`);
  const manifest: PluginManifest = await manifestRes.json();

  if (!manifest.id || !manifest.name || !manifest.moduleType) {
    throw new Error('Dev manifest missing required fields');
  }

  const moduleType = `plugin:${manifest.moduleType}`;

  // 2. Fetch bundle
  const bundleRes = await fetch(`${base}/dist/bundle.js`);
  if (!bundleRes.ok) throw new Error(`Dev bundle fetch failed: ${bundleRes.status}`);
  const bundleText = await bundleRes.text();

  // 2b. Pre-register dev-plugin translations against the dev server's URL
  // base — same fallback chain the installed-plugin path uses, just with a
  // remote origin instead of the local /api/plugins/asset/<id> route.
  await loadPluginTranslations(manifest, base);

  // 3. Execute bundle
  const { component, configSection, deriveProvidedKeys } = executeBundle(bundleText, manifest);

  // 4. Migrate configs if dev plugin version changed
  const devPlugins = getDevPlugins();
  const prev = devPlugins.get(manifest.id);
  if (prev && prev.manifest.version !== manifest.version) {
    await migratePluginConfigs(manifest, prev.manifest.version);
  }

  // 5. Register server-side so the proxy can find the manifest and allowedDomains
  await fetch('/api/plugins/dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifest }),
  }).catch(() => {
    // Non-fatal — proxy features won't work but the plugin will still render
    console.warn(`[plugin] Failed to register dev plugin "${manifest.id}" server-side — pluginFetch will not work`);
  });

  // 6. Register client-side
  registerPluginModule(manifest, { deriveProvidedKeys });
  store.registerPlugin(moduleType, component, manifest, configSection);

  // 7. Persist dev mapping in localStorage
  devPlugins.set(manifest.id, { url: base, manifest });
  saveDevPlugins(devPlugins);
}

/**
 * Unload a dev plugin and remove it from localStorage.
 */
export function unloadDevPlugin(pluginId: string): void {
  const devPlugins = getDevPlugins();
  const dev = devPlugins.get(pluginId);
  if (!dev) return;

  const moduleType = `plugin:${dev.manifest.moduleType}`;
  usePluginStore.getState().unregisterPlugin(moduleType);
  devPlugins.delete(pluginId);
  saveDevPlugins(devPlugins);
}

/**
 * Get the list of currently loaded dev plugins.
 */
export function listDevPlugins(): Map<string, DevPlugin> {
  return getDevPlugins();
}

// ---------------------------------------------------------------------------
// Dev-mode polling — auto-reload on bundle change
// ---------------------------------------------------------------------------

const pollIntervals = new Map<string, ReturnType<typeof setInterval>>();
const bundleETags = new Map<string, string>();
const pollInFlight = new Set<string>();

/**
 * Start polling a dev plugin's bundle for changes (2s interval).
 * On change (different ETag or Content-Length), auto-reload the plugin.
 * An in-flight guard prevents concurrent ticks from double-reloading.
 */
export function startDevPolling(pluginId: string): void {
  stopDevPolling(pluginId); // clear any existing interval

  const interval = setInterval(async () => {
    // Guard: skip if previous tick is still running
    if (pollInFlight.has(pluginId)) return;
    pollInFlight.add(pluginId);

    try {
      // Re-read from localStorage each tick to pick up URL changes
      const dev = getDevPlugins().get(pluginId);
      if (!dev) { stopDevPolling(pluginId); return; }

      const res = await fetch(`${dev.url}/dist/bundle.js`, { method: 'HEAD' });
      if (!res.ok) return;

      const etag = res.headers.get('etag') || res.headers.get('content-length') || '';
      const prev = bundleETags.get(pluginId);

      if (prev !== undefined && prev !== etag) {
        // Bundle changed — reload
        await loadDevPlugin(dev.url);
      }

      bundleETags.set(pluginId, etag);
    } catch {
      // Dev server may be temporarily down — ignore
    } finally {
      pollInFlight.delete(pluginId);
    }
  }, 2000);

  pollIntervals.set(pluginId, interval);
}

export function stopDevPolling(pluginId: string): void {
  const interval = pollIntervals.get(pluginId);
  if (interval) {
    clearInterval(interval);
    pollIntervals.delete(pluginId);
  }
  bundleETags.delete(pluginId);
}

function stopAllDevPolling(): void {
  for (const id of pollIntervals.keys()) stopDevPolling(id);
}

// ---------------------------------------------------------------------------
// Config migration — deep-merge on version change
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge source into target: new keys get source values, existing keys kept */
export function deepMergeConfig(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (!(key in result)) {
      result[key] = source[key];
    } else if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMergeConfig(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    }
    // else: existing value preserved (including arrays)
  }
  return result;
}

/** Apply version-stepped migrations (renames/defaults) then deep-merge with defaultConfig. */
export function applyMigrationToModule(
  config: Record<string, unknown>,
  manifest: PluginManifest,
  oldVersion: string,
): Record<string, unknown> {
  const result = { ...config };

  if (manifest.configMigrations) {
    const versions = Object.keys(manifest.configMigrations)
      .filter((v) => compareSemver(v, oldVersion) > 0 && compareSemver(v, manifest.version) < 0)
      .sort(compareSemver);

    for (const ver of versions) {
      const migration = manifest.configMigrations[ver];
      if (migration.renames) {
        for (const [oldKey, newKey] of Object.entries(migration.renames)) {
          if (oldKey in result && !(newKey in result)) {
            result[newKey] = result[oldKey];
            delete result[oldKey];
          }
        }
      }
      if (migration.defaults) {
        for (const [key, value] of Object.entries(migration.defaults)) {
          if (!(key in result)) result[key] = value;
        }
      }
    }
  }

  return deepMergeConfig(result, manifest.defaultConfig);
}

/**
 * Migrate module configs when a plugin version changes.
 * Returns true if migration succeeded (or no migration was needed),
 * false if it failed and should be retried on next load.
 */
async function migratePluginConfigs(
  manifest: PluginManifest,
  oldVersion: string,
): Promise<boolean> {
  const moduleType = `plugin:${manifest.moduleType}`;

  try {
    const res = await fetch('/api/config');
    if (!res.ok) return false;
    const config = await res.json();

    let changed = false;
    for (const screen of config.screens ?? []) {
      for (const mod of screen.modules ?? []) {
        if (mod.type !== moduleType) continue;
        const originalJson = JSON.stringify(mod.config);
        const migrated = applyMigrationToModule(mod.config, manifest, oldVersion);
        if (JSON.stringify(migrated) !== originalJson) {
          mod.config = migrated;
          changed = true;
        }
      }
    }

    if (changed) {
      const putRes = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!putRes.ok) return false;
    }

    return true;
  } catch (err) {
    console.warn(`Config migration for ${manifest.id} failed:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pending migrations — collected during parallel load, executed sequentially
// ---------------------------------------------------------------------------

interface PendingMigration {
  manifest: PluginManifest;
  oldVersion: string;
  pluginId: string;
}

/**
 * Load all installed+enabled plugins. Called from the plugin Zustand store.
 *
 * Loading sequence per plugin:
 * 1. GET /api/plugins/manifest/<id> → manifest
 * 2. GET /api/plugins/bundle/<id>?v=<version> → IIFE bundle text
 * 3. Execute bundle via script injection → read window.__HS_PLUGIN__
 * 4. Register into Zustand store + module registry
 * 5. After all plugins loaded, run pending config migrations sequentially
 */
export async function loadAllPlugins(): Promise<void> {
  const store = usePluginStore.getState();

  // Clear previous plugin registrations before reloading
  store.clearPlugins();
  stopAllDevPolling();

  // Fetch installed plugins list
  let plugins: InstalledPlugin[];
  try {
    const res = await displayFetch('/api/plugins/installed');
    if (!res.ok) return;
    const data = await res.json();
    plugins = (data.plugins ?? []).filter((p: InstalledPlugin) => p.enabled);
  } catch {
    return;
  }

  // Load installed plugins in parallel, collect pending migrations
  const pendingMigrations: PendingMigration[] = [];

  // Skip installed plugins that have a dev override — dev plugins load from
  // the dev server and don't need a bundle on disk
  const devPluginIds = new Set(getDevPlugins().keys());
  const installedOnly = plugins.filter((p) => !devPluginIds.has(p.id));

  if (installedOnly.length > 0) {
    await Promise.allSettled(
      installedOnly.map((plugin) => loadSinglePlugin(plugin, store, pendingMigrations)),
    );
  }

  // Migrations and dev plugins only run in the editor (authenticated context).
  // The display page is unauthenticated — PUT /api/config would fail with 401.
  const isEditor = typeof window !== 'undefined' && window.location.pathname.startsWith('/editor');
  if (!isEditor) return;

  // Run config migrations sequentially to avoid concurrent read-modify-write
  for (const { manifest, oldVersion, pluginId } of pendingMigrations) {
    const migrated = await migratePluginConfigs(manifest, oldVersion);
    // Only clear previousVersion if migration succeeded — otherwise it retries on next load
    if (migrated) {
      fetch('/api/plugins/install', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, clearPrevVersion: true }),
      }).catch(() => {}); // fire-and-forget
    }
  }

  // Load dev plugins from localStorage (these override installed versions)
  const devPlugins = getDevPlugins();
  for (const [pluginId, dev] of devPlugins) {
    try {
      await loadDevPlugin(dev.url);
      startDevPolling(pluginId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Dev plugin ${pluginId} failed to load:`, message);
      store.setError(pluginId, { message, phase: 'load' });
    }
  }
}

async function loadSinglePlugin(
  plugin: InstalledPlugin,
  store: ReturnType<typeof usePluginStore.getState>,
  pendingMigrations: PendingMigration[],
): Promise<void> {
  const moduleType = `plugin:${plugin.moduleType}`;

  try {
    // 1. Fetch manifest
    const manifestRes = await displayFetch(`/api/plugins/manifest/${plugin.id}`);
    if (!manifestRes.ok) {
      throw new Error(`Manifest fetch failed: ${manifestRes.status}`);
    }
    const manifest: PluginManifest = await manifestRes.json();

    // 2. Validate manifest before using it
    if (!manifest.id || !manifest.name || !manifest.moduleType) {
      throw new Error('Invalid manifest: missing required fields');
    }
    if (!manifest.category) {
      throw new Error('Invalid manifest: missing category');
    }

    // 3. Fetch bundle (version-stamped URL for cache busting)
    const bundleRes = await displayFetch(`/api/plugins/bundle/${plugin.id}?v=${plugin.version}`);
    if (!bundleRes.ok) {
      throw new Error(`Bundle fetch failed: ${bundleRes.status}`);
    }
    const bundleText = await bundleRes.text();

    // 3b. Pre-register plugin translations (if any) before the IIFE runs so
    // synchronous calls into `__HS_SDK__.translate` from the bundle's top
    // level resolve against real strings. Errors here only warn — the
    // plugin still loads.
    await loadPluginTranslations(manifest);

    // 4. Execute IIFE bundle
    const { component, configSection, deriveProvidedKeys } = executeBundle(bundleText, manifest);

    // 5. Queue migration if server reports a version change
    if (plugin.previousVersion && plugin.previousVersion !== manifest.version) {
      pendingMigrations.push({
        manifest,
        oldVersion: plugin.previousVersion,
        pluginId: plugin.id,
      });
    }

    // 6. Register into module registry and Zustand store
    registerPluginModule(manifest, { deriveProvidedKeys });
    store.registerPlugin(moduleType, component, manifest, configSection);

    // 7. Wire prefetchUrl into the fetch key registry if declared
    if (manifest.prefetchUrl) {
      const url = manifest.prefetchUrl;
      registerFetchKey(`plugin:${manifest.moduleType}`, {
        buildUrl: () => url,
        ttlMs: 300_000, // default 5min TTL for plugin prefetch
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to load plugin ${plugin.id}:`, message);
    store.setError(plugin.id, { message, phase: 'load' });
  }
}

/**
 * Execute an IIFE bundle by injecting it as a script tag.
 * The bundle assigns to window.__HS_PLUGIN__ which we read and clean up.
 */
function executeBundle(
  bundleText: string,
  manifest: PluginManifest,
): {
  component: ComponentType<Record<string, unknown>>;
  configSection?: ComponentType<PluginConfigSectionProps>;
  deriveProvidedKeys?: (config: Record<string, unknown>) => ProvidedStateKey[];
} {
  // Clean up any previous plugin global
  window.__HS_PLUGIN__ = undefined;

  try {
    // Create and inject script element (inline scripts execute synchronously)
    const script = document.createElement('script');
    script.textContent = bundleText;
    document.head.appendChild(script);
    document.head.removeChild(script);

    // Read the plugin exports from the global (script injection above sets this as a side effect)
    const pluginExports = window.__HS_PLUGIN__ as Record<string, unknown> | undefined;

    if (!pluginExports) {
      throw new Error('Bundle did not set window.__HS_PLUGIN__');
    }

    // Resolve the display component
    const componentExport = manifest.exports?.component ?? 'default';
    const component = (pluginExports[componentExport] ?? pluginExports.default) as
      | ComponentType<Record<string, unknown>>
      | undefined;

    if (!component) {
      throw new Error(`Bundle missing component export "${componentExport}"`);
    }

    // Resolve optional config section
    let configSection: ComponentType<PluginConfigSectionProps> | undefined;
    if (manifest.exports?.configSection) {
      configSection = pluginExports[manifest.exports.configSection] as
        | ComponentType<PluginConfigSectionProps>
        | undefined;
    }

    // Optional config-driven state-key deriver. Lives on the runtime
    // registration object (not the manifest) because the manifest is static
    // JSON and this must be a function. Conventional export name.
    const deriveProvidedKeys =
      typeof pluginExports.deriveProvidedKeys === 'function'
        ? (pluginExports.deriveProvidedKeys as (
            config: Record<string, unknown>,
          ) => ProvidedStateKey[])
        : undefined;

    return { component, configSection, deriveProvidedKeys };
  } catch (err) {
    throw new Error(`Bundle execution failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    window.__HS_PLUGIN__ = undefined;
  }
}

// ---------------------------------------------------------------------------
// i18n — fetch + register plugin-supplied translation dictionaries
// ---------------------------------------------------------------------------

/**
 * Resolve the active locale for plugin translation lookup. Reads
 * `globalSettings.locale` from `/api/config`; on any failure (no config,
 * network error, missing field) falls back to `DEFAULT_LOCALE`. Cached for
 * the lifetime of a single `loadAllPlugins` call so parallel
 * `loadSinglePlugin` invocations don't all re-issue the request.
 *
 * Failure-path caching is deliberately *off*: when the config fetch fails
 * (5xx, network error, malformed JSON) we return `DEFAULT_LOCALE` but do
 * not write the cache. The next caller retries the network. Otherwise a
 * single transient outage during plugin load would lock every plugin into
 * the fallback locale until the TTL expires (and would re-arm the same
 * window every time the cache was checked, ratcheting failures forever).
 */
let activeLocaleCache: { value: string; fetchedAt: number } | null = null;
const ACTIVE_LOCALE_TTL_MS = 5_000;

export async function getActiveLocale(): Promise<string> {
  const now = Date.now();
  if (activeLocaleCache && now - activeLocaleCache.fetchedAt < ACTIVE_LOCALE_TTL_MS) {
    return activeLocaleCache.value;
  }
  try {
    const res = await displayFetch('/api/config');
    if (!res.ok) {
      // Don't cache the failure — let the next call retry.
      return DEFAULT_LOCALE;
    }
    const config = await res.json();
    // `/api/config` returns the raw `ScreenConfiguration`, whose locale
    // lives at `settings.locale` (not the legacy `globalSettings` shape).
    // Matching the actual on-the-wire field is the only way plugin
    // translations resolve to the user's chosen locale.
    const locale = config?.settings?.locale;
    const value = typeof locale === 'string' && locale ? locale : DEFAULT_LOCALE;
    activeLocaleCache = { value, fetchedAt: now };
    return value;
  } catch {
    // Don't cache the failure — let the next call retry.
    return DEFAULT_LOCALE;
  }
}

/**
 * Invalidate the active-locale cache. The editor's locale-change save flow
 * should call this immediately after a successful PUT so the next plugin
 * translation fetch picks up the new locale without waiting for the TTL.
 *
 * Pair with {@link reloadPluginTranslations} to re-fetch dictionaries for
 * all currently-loaded plugins under the new locale.
 */
export function clearActiveLocaleCache(): void {
  activeLocaleCache = null;
}

/** @internal — drops the active-locale cache so tests can re-mock. */
export function __resetPluginLoaderActiveLocaleCacheForTests(): void {
  activeLocaleCache = null;
}

/**
 * Validate that a fetched payload looks like a translation dictionary —
 * a plain JSON object whose values are either strings or further nested
 * dictionaries. Returns the value cast to `Dictionary` on success or
 * `null` if the shape is wrong (so the caller can warn + skip).
 */
function isDictionary(value: unknown): value is Dictionary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return true;
}

/**
 * Build the URL the plugin loader fetches a translation file from. Kept as
 * its own function so dev plugins (loaded from a remote dev server) can
 * resolve relative to their own base URL while installed plugins fetch
 * via the local API. The dev-server case passes a `baseUrl`; the
 * installed-plugin case omits it and we fall back to the standard
 * `/api/plugins/asset/<id>` shape — this is the same pattern the
 * `manifest`/`bundle` endpoints use, just for arbitrary on-disk plugin
 * assets.
 *
 * Returns `null` when the manifest path is unsafe — absolute schemes
 * (`http:`, `file:`), parent-directory traversal (`..`), backslashes, or
 * embedded NUL bytes. Callers must skip the registration and warn. Even
 * though the asset route already enforces traversal containment, rejecting
 * here means we never even issue the request and never let a manifest
 * point at an arbitrary external origin via the dev-server passthrough.
 */
function buildTranslationUrl(
  pluginId: string,
  relativePath: string,
  baseUrl?: string,
): string | null {
  // Reject absolute schemes (http://, https://, file://, javascript:, etc.).
  // The dev-server `baseUrl` is the *only* authorized cross-origin escape
  // hatch and it's not in the manifest path — the manifest must always be
  // a relative path under the plugin root.
  if (/^[a-z][a-z0-9+.-]*:/i.test(relativePath)) {
    console.warn(
      `[plugin] translations path for "${pluginId}" rejected: absolute scheme not allowed (${relativePath}).`,
    );
    return null;
  }
  // Reject NUL bytes and backslashes — Windows-style separators or null
  // injection should never be in a sane manifest path.
  if (relativePath.includes('\0') || relativePath.includes('\\')) {
    console.warn(
      `[plugin] translations path for "${pluginId}" rejected: contains NUL or backslash.`,
    );
    return null;
  }
  // Normalise separators and reject any `..` segment after splitting. We
  // also reject empty segments produced by leading/trailing/double slashes
  // because those are almost always a manifest typo or a probe.
  const segments = relativePath.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      console.warn(
        `[plugin] translations path for "${pluginId}" rejected: parent-directory traversal (${relativePath}).`,
      );
      return null;
    }
  }
  // Manifest paths are relative to the plugin root and may use `/` as the
  // separator. Strip leading slashes after the safety checks above so the
  // checks see exactly what the manifest declared.
  const safePath = relativePath.replace(/^\/+/, '');
  if (!safePath) {
    console.warn(
      `[plugin] translations path for "${pluginId}" rejected: empty path.`,
    );
    return null;
  }
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/${safePath}`;
  }
  return `/api/plugins/asset/${encodeURIComponent(pluginId)}/${safePath}`;
}

// 1 MB cap on a single translation dictionary. A real-world dictionary is
// typically a few KB; the cap is here to keep a malicious or buggy plugin
// from pinning memory or stalling the load pipeline. Tunable if a future
// plugin legitimately ships a much larger dictionary, but the right answer
// at that size is to split per-namespace anyway.
const MAX_TRANSLATION_BYTES = 1_000_000;

/**
 * Read a `Response` body in chunks, aborting if the running byte counter
 * exceeds {@link MAX_TRANSLATION_BYTES}. Returns the decoded JSON value on
 * success or `null` on any failure (size cap, decode error, JSON parse
 * error). The caller logs an appropriate warning either way.
 */
async function readBoundedJson(res: Response, pluginId: string, tag: string): Promise<unknown | null> {
  // Fast path: trust a sane Content-Length header before consuming.
  const declaredLen = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_TRANSLATION_BYTES) {
    console.warn(
      `[plugin] translations for ${pluginId} (${tag}) exceeds ${MAX_TRANSLATION_BYTES}B `
      + `(declared ${declaredLen}B) — skipping.`,
    );
    return null;
  }

  const reader = res.body?.getReader();
  // No streaming body — fall back to res.json() with a best-effort length
  // re-check. Browsers should always expose a body; this branch is mostly
  // for older test mocks that return synthetic Responses without one.
  if (!reader) {
    const text = await res.text();
    if (text.length > MAX_TRANSLATION_BYTES) {
      console.warn(
        `[plugin] translations for ${pluginId} (${tag}) exceeds ${MAX_TRANSLATION_BYTES}B — skipping.`,
      );
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[plugin] translations JSON parse failed for ${pluginId} (${tag}): ${message}`,
      );
      return null;
    }
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > MAX_TRANSLATION_BYTES) {
      // Cancel the body so the connection (and any upstream socket) is
      // released promptly instead of being read to completion.
      try { await reader.cancel(); } catch { /* ignore */ }
      console.warn(
        `[plugin] translations for ${pluginId} (${tag}) exceeds ${MAX_TRANSLATION_BYTES}B `
        + `(read ${received}B before abort) — skipping.`,
      );
      return null;
    }
    chunks.push(value);
  }

  try {
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const decoded = new TextDecoder('utf-8').decode(merged);
    return JSON.parse(decoded);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[plugin] translations JSON parse failed for ${pluginId} (${tag}): ${message}`,
    );
    return null;
  }
}

/**
 * If `manifest.translations` is set, walk the locale fallback chain and
 * register the first dictionary that loads successfully under
 * `plugin:<pluginId>`. Silent no-op when `translations` is absent or empty.
 *
 * Failures (missing file, malformed JSON, non-object payload, oversize)
 * are logged as warnings — they never prevent the plugin from loading.
 *
 * **Locale-change limitation:** this runs once per plugin during
 * `loadAllPlugins` (or `loadDevPlugin`) and registers the dictionary for
 * the *current* active locale. When the user later switches locale at
 * runtime, the plugin's translations stay pinned to whatever was loaded.
 * Call {@link reloadPluginTranslations} from the locale-change save flow
 * to re-fetch dictionaries for every loaded plugin under the new locale.
 */
export async function loadPluginTranslations(
  manifest: PluginManifest,
  baseUrl?: string,
): Promise<void> {
  const translations = manifest.translations;
  if (!translations || typeof translations !== 'object') return;
  const tags = Object.keys(translations);
  if (tags.length === 0) return;

  let activeLocale: string;
  try {
    activeLocale = await getActiveLocale();
  } catch {
    activeLocale = DEFAULT_LOCALE;
  }
  const chain = resolveLocaleChain(activeLocale, FALLBACK_LOCALE);

  for (const tag of chain) {
    const relativePath = translations[tag];
    if (typeof relativePath !== 'string' || !relativePath) continue;

    const url = buildTranslationUrl(manifest.id, relativePath, baseUrl);
    if (url == null) {
      // buildTranslationUrl already warned with the precise reason. Skip
      // this tag entirely — the loop will try the next entry in the
      // fallback chain.
      continue;
    }
    let dict: Dictionary | null = null;
    try {
      const res = await displayFetch(url);
      if (!res.ok) {
        console.warn(
          `[plugin] translations fetch failed for ${manifest.id} (${tag}): ${res.status}`,
        );
        continue;
      }
      const json = await readBoundedJson(res, manifest.id, tag);
      if (json == null) {
        // readBoundedJson already warned (size cap or parse error).
        continue;
      }
      if (!isDictionary(json)) {
        console.warn(
          `[plugin] translations payload for ${manifest.id} (${tag}) is not a JSON object — skipping`,
        );
        continue;
      }
      dict = json;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[plugin] translations fetch threw for ${manifest.id} (${tag}): ${message}`,
      );
      continue;
    }

    try {
      registerPluginNamespace(manifest.id, activeLocale, dict);
    } catch (err) {
      // Invalid plugin IDs should already be caught upstream by the
      // manifest validator. Surface this loudly via the warning rather
      // than letting the throw bubble — the rest of the plugin can still
      // load successfully.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[plugin] translations register failed for ${manifest.id}: ${message}`,
      );
    }
    return;
  }
}

/**
 * Re-fetch and re-register translation dictionaries for every plugin the
 * Zustand store currently knows about, under the *current* active locale.
 *
 * Called by the editor's locale-change save flow after persisting the new
 * locale to `globalSettings.locale`. Sequence:
 *   1. PUT /api/config { ...globalSettings: { locale: newTag } }
 *   2. clearActiveLocaleCache()           — drop the stale cached value
 *   3. await reloadPluginTranslations()  — refill the namespace cache
 *   4. router.refresh()                   — re-render with new strings
 *
 * Failures inside individual plugin reloads are swallowed (and warned by
 * `loadPluginTranslations`) so a single broken plugin can't block the
 * reload of the rest.
 */
export async function reloadPluginTranslations(): Promise<void> {
  // Lazy-import the store so this function stays callable from contexts
  // (server modules, tests) that haven't pulled the editor bundle in.
  const { usePluginStore } = await import('@/stores/plugin-store');
  const plugins = usePluginStore.getState().plugins;

  // Reload dev plugins from their own dev-server origin and installed
  // plugins from the local /api/plugins/asset route. Dev plugins live
  // under the same plugin store entry — we look up the dev URL from the
  // localStorage map populated by `loadDevPlugin`.
  const devUrls = getDevPlugins();

  await Promise.allSettled(
    Array.from(plugins.values()).map(async ({ manifest }) => {
      const dev = devUrls.get(manifest.id);
      if (dev) {
        await loadPluginTranslations(manifest, dev.url);
      } else {
        await loadPluginTranslations(manifest);
      }
    }),
  );
}

// Re-export from @/lib/semver for backward compatibility
export { compareSemver } from '@/lib/semver';
