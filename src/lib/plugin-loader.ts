import type { ComponentType } from 'react';
import type { PluginManifest, InstalledPlugin, PluginConfigSectionProps } from '@/types/plugins';
import { usePluginStore } from '@/stores/plugin-store';
import { registerPluginModule } from '@/lib/module-registry';
import { registerFetchKey } from '@/lib/fetch-keys';
import { compareSemver } from '@/lib/semver';
import { displayFetch } from '@/lib/display-fetch';

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

  // 3. Execute bundle
  const { component, configSection } = executeBundle(bundleText, manifest);

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
  registerPluginModule(manifest);
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

    // 4. Execute IIFE bundle
    const { component, configSection } = executeBundle(bundleText, manifest);

    // 5. Queue migration if server reports a version change
    if (plugin.previousVersion && plugin.previousVersion !== manifest.version) {
      pendingMigrations.push({
        manifest,
        oldVersion: plugin.previousVersion,
        pluginId: plugin.id,
      });
    }

    // 6. Register into module registry and Zustand store
    registerPluginModule(manifest);
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

    return { component, configSection };
  } catch (err) {
    throw new Error(`Bundle execution failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    window.__HS_PLUGIN__ = undefined;
  }
}

// Re-export from @/lib/semver for backward compatibility
export { compareSemver } from '@/lib/semver';
