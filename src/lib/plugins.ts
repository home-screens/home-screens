import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InstalledPluginsFile, InstalledPlugin, PluginManifest, RegistryPlugin, PluginRegistry } from '@/types/plugins';
import { deleteAllPluginSecrets, migrateLegacyPluginSecrets } from '@/lib/plugin-secrets';
import { sanitizePluginId, pluginsDir, pluginDir, getPluginManifest, PLUGIN_ID_PATTERN } from '@/lib/plugin-utils';
import { createJsonStore } from '@/lib/json-store';
import { SHARED_STATE_KEY_RE, MAX_SHARED_STATE_KEY_LENGTH } from '@/lib/shared-state-types';
import { pluginStatePrefix } from '@/lib/plugin-state-keys';

const execFileAsync = promisify(execFile);

const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// --- Installed plugins ---

// Serialized read-modify-write on installed.json lives in the shared
// json-store queue (prevents TOCTOU races between concurrent installs).
const installedStore = createJsonStore<InstalledPluginsFile>({
  path: 'data/plugins/installed.json',
  defaultValue: { schemaVersion: 1, plugins: [] },
});

// In-memory cache for installed.json (avoids disk reads every 3s poll)
let installedCache: { data: InstalledPluginsFile; mtime: number } | null = null;

export async function getInstalledPlugins(): Promise<InstalledPluginsFile> {
  try {
    const stat = await fs.stat(installedStore.filePath);
    const mtime = stat.mtimeMs;
    // Return cached if file hasn't changed
    if (installedCache && installedCache.mtime === mtime) {
      return installedCache.data;
    }
    const data = await installedStore.read();
    installedCache = { data, mtime };
    return data;
  } catch {
    return { schemaVersion: 1, plugins: [] };
  }
}

/** Atomic read-modify-write on installed.json. The mutator gets the freshest
 *  on-disk state (prior queued writes have landed) and must return a NEW
 *  object to persist changes, or its input unchanged to skip the write. */
function updateInstalled(
  mutator: (current: InstalledPluginsFile) => InstalledPluginsFile,
): Promise<InstalledPluginsFile> {
  return installedStore.updateAtomic(mutator).then((result) => {
    // mtime-based cache invalidation is implicit, but sub-ms writes can
    // collide on mtimeMs — drop the cache explicitly to be safe.
    installedCache = null;
    return result;
  });
}

// --- Plugin bundle ---

export function getPluginBundlePath(pluginId: string): string {
  return path.join(pluginDir(pluginId), 'dist', 'bundle.js');
}

// --- Install/uninstall ---

/**
 * Extract a plugin tarball into a temp directory with safety checks.
 * - Rejects tarballs containing `..` path entries (path traversal).
 * - Uses `--strip-components=1` to unwrap the top-level directory.
 *
 * Caller owns cleanup of both the tarball file and the tmp directory.
 */
async function extractPluginTarball(tarPath: string, tmpDir: string): Promise<void> {
  const { stdout } = await execFileAsync('tar', ['-tzf', tarPath]);
  if (stdout.split('\n').some((entry) => entry.split('/').includes('..'))) {
    throw new Error('Tarball contains path traversal entries');
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await execFileAsync('tar', ['-xzf', tarPath, '-C', tmpDir, '--strip-components=1']);
}

/**
 * Read and validate the manifest + bundle inside an extracted plugin directory.
 * Returns the parsed manifest, or throws a user-friendly error describing
 * exactly what's missing or malformed.
 */
async function validateExtractedPlugin(tmpDir: string): Promise<PluginManifest> {
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const bundlePath = path.join(tmpDir, 'dist', 'bundle.js');

  let manifest: PluginManifest;
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(raw);
  } catch {
    throw new Error(
      'Plugin manifest.json is missing after extraction — the tarball may be flat '
      + '(expected a root directory wrapping manifest.json and dist/)',
    );
  }
  if (!validateManifest(manifest)) {
    const missing = ['id', 'name', 'version', 'moduleType', 'category']
      .filter((k) => !(manifest as Record<string, unknown>)[k]);
    throw new Error(
      `Plugin manifest is invalid${missing.length ? `: missing ${missing.join(', ')}` : ''}`,
    );
  }
  try {
    await fs.access(bundlePath);
  } catch {
    throw new Error(
      'Plugin bundle is missing at dist/bundle.js — the tarball must contain a dist/ directory with bundle.js',
    );
  }
  return manifest;
}

/** Atomically move an extracted+validated plugin into its final location. */
async function promotePluginDir(tmpDir: string, pluginId: string): Promise<void> {
  const dir = pluginDir(pluginId);
  // Rescue any pre-fix secrets.json sitting inside the plugin dir before the
  // recursive rm takes it out. Safe no-op once every install has migrated.
  await migrateLegacyPluginSecrets(pluginId);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rename(tmpDir, dir);
}

/** Track in-progress installs to prevent concurrent installs of the same plugin */
const installing = new Set<string>();

/** Track in-progress external installs to prevent concurrent installs of the same URL */
const installingExternal = new Set<string>();

export async function installPlugin(
  registryEntry: RegistryPlugin,
  version: string,
  downloadBuffer: Buffer,
  expectedSha256: string,
): Promise<void> {
  if (installing.has(registryEntry.id)) {
    throw new Error(`Plugin ${registryEntry.id} is already being installed`);
  }

  installing.add(registryEntry.id);
  try {
    // Verify SHA-256
    const hash = crypto.createHash('sha256').update(downloadBuffer).digest('hex');
    if (hash !== expectedSha256) {
      throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, got ${hash}`);
    }

    const safeId = sanitizePluginId(registryEntry.id);
    await fs.mkdir(pluginsDir(), { recursive: true });
    const tmpTarPath = path.join(pluginsDir(), `${safeId}.tar.gz`);
    await fs.writeFile(tmpTarPath, downloadBuffer);

    try {
      const tmpDir = path.join(pluginsDir(), `.tmp-${safeId}`);
      try {
        await extractPluginTarball(tmpTarPath, tmpDir);
        await validateExtractedPlugin(tmpDir);
        await promotePluginDir(tmpDir, registryEntry.id);
      } catch (err) {
        await fs.rm(tmpDir, { recursive: true, force: true });
        throw err;
      }
    } finally {
      await fs.unlink(tmpTarPath).catch(() => {});
    }

    // Re-read manifest from final location for installed.json entry
    const manifest = await getPluginManifest(registryEntry.id);
    if (!manifest) {
      throw new Error('Plugin manifest missing after install');
    }

    // Update installed.json (queued read-modify-write, no TOCTOU)
    await updateInstalled((installed) => {
      const entry: InstalledPlugin = {
        id: registryEntry.id,
        version,
        installedAt: new Date().toISOString(),
        enabled: true,
        moduleType: manifest.moduleType,
      };
      const plugins = [...installed.plugins];
      const existing = plugins.findIndex((p) => p.id === registryEntry.id);
      if (existing >= 0) {
        // Track the old version so the client-side loader can run config migrations
        const oldVersion = plugins[existing].version;
        if (oldVersion !== version) {
          entry.previousVersion = oldVersion;
        }
        plugins[existing] = entry;
      } else {
        plugins.push(entry);
      }
      return { ...installed, plugins };
    });
  } finally {
    installing.delete(registryEntry.id);
  }
}

export async function installExternalPlugin(
  tarballUrl: string,
  downloadBuffer: Buffer,
): Promise<{ pluginId: string; version: string }> {
  if (installingExternal.has(tarballUrl)) {
    throw new Error(`An install from ${tarballUrl} is already in progress`);
  }
  installingExternal.add(tarballUrl);

  const tmpSuffix = crypto.randomBytes(8).toString('hex');
  const tmpTarPath = path.join(pluginsDir(), `.tmp-ext-${tmpSuffix}.tar.gz`);
  const tmpDir = path.join(pluginsDir(), `.tmp-ext-${tmpSuffix}`);

  try {
    await fs.mkdir(pluginsDir(), { recursive: true });
    await fs.writeFile(tmpTarPath, downloadBuffer);

    try {
      await extractPluginTarball(tmpTarPath, tmpDir);
      const manifest = await validateExtractedPlugin(tmpDir);

      // Fast-fail collision guard before extraction completes its side-effects
      // (the fresh recheck below is what actually protects against overwrites).
      const earlyInstalled = await getInstalledPlugins();
      const earlyExisting = earlyInstalled.plugins.find((p) => p.id === manifest.id);
      if (earlyExisting && earlyExisting.source !== 'external') {
        throw new Error(
          `A marketplace plugin with ID '${manifest.id}' is already installed. `
          + `Uninstall it first to replace with an external version.`,
        );
      }

      // Acquire the ID-based lock now that we know the ID
      if (installing.has(manifest.id)) {
        throw new Error(`Plugin ${manifest.id} is already being installed`);
      }
      installing.add(manifest.id);

      try {
        // Re-read installed.json AFTER acquiring the ID lock to close a TOCTOU
        // race: a concurrent marketplace install of the same ID could have
        // completed between the early check and the lock acquisition.
        const installed = await getInstalledPlugins();
        const locked = installed.plugins.find((p) => p.id === manifest.id);
        if (locked && locked.source !== 'external') {
          throw new Error(
            `A marketplace plugin with ID '${manifest.id}' is already installed. `
            + `Uninstall it first to replace with an external version.`,
          );
        }

        await promotePluginDir(tmpDir, manifest.id);

        await updateInstalled((current) => {
          const entry: InstalledPlugin = {
            id: manifest.id,
            version: manifest.version,
            installedAt: new Date().toISOString(),
            enabled: true,
            moduleType: manifest.moduleType,
            source: 'external',
            externalUrl: tarballUrl,
          };
          const plugins = [...current.plugins];
          const idx = plugins.findIndex((p) => p.id === manifest.id);
          if (idx >= 0) {
            if (plugins[idx].version !== manifest.version) {
              entry.previousVersion = plugins[idx].version;
            }
            plugins[idx] = entry;
          } else {
            plugins.push(entry);
          }
          return { ...current, plugins };
        });

        return { pluginId: manifest.id, version: manifest.version };
      } finally {
        installing.delete(manifest.id);
      }
    } catch (err) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      throw err;
    }
  } finally {
    await fs.unlink(tmpTarPath).catch(() => {});
    installingExternal.delete(tarballUrl);
  }
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  // Secrets live outside the plugin directory, but we still clear them
  // explicitly so an uninstall doesn't leave per-plugin credentials behind.
  // (Also removes any leftover legacy in-plugin-dir secrets.json.)
  await deleteAllPluginSecrets(pluginId);

  const dir = pluginDir(pluginId);
  await fs.rm(dir, { recursive: true, force: true });

  await updateInstalled((installed) => ({
    ...installed,
    plugins: installed.plugins.filter((p) => p.id !== pluginId),
  }));
}

export async function clearPreviousVersion(pluginId: string): Promise<void> {
  await updateInstalled((installed) => {
    const plugin = installed.plugins.find((p) => p.id === pluginId);
    if (!plugin || !plugin.previousVersion) return installed; // no-op, skip write
    return {
      ...installed,
      plugins: installed.plugins.map((p) => {
        if (p.id !== pluginId) return p;
        const { previousVersion: _dropped, ...rest } = p;
        return rest;
      }),
    };
  });
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  await updateInstalled((installed) => {
    const plugin = installed.plugins.find((p) => p.id === pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return {
      ...installed,
      plugins: installed.plugins.map((p) => (p.id === pluginId ? { ...p, enabled } : p)),
    };
  });
}

// --- Dev plugin registration ---

/**
 * Register a dev plugin server-side so the proxy can find its manifest.
 * Writes the manifest to disk and adds/updates an installed.json entry.
 */
export async function registerDevPlugin(manifest: PluginManifest): Promise<void> {
  const safeId = sanitizePluginId(manifest.id);
  const dir = pluginDir(safeId);

  // Write manifest to disk
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  // Add/update installed.json entry
  await updateInstalled((installed) => {
    const entry: InstalledPlugin = {
      id: manifest.id,
      version: manifest.version,
      installedAt: new Date().toISOString(),
      enabled: true,
      moduleType: manifest.moduleType,
    };
    const plugins = [...installed.plugins];
    const existing = plugins.findIndex((p) => p.id === manifest.id);
    if (existing >= 0) {
      plugins[existing] = entry;
    } else {
      plugins.push(entry);
    }
    return { ...installed, plugins };
  });
}

// --- Plugin hash (for display change detection) ---

export async function getPluginHash(): Promise<string> {
  const installed = await getInstalledPlugins();
  const content = installed.plugins
    .map((p) => `${p.id}:${p.version}:${p.enabled}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// --- Manifest validation ---

export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const m = manifest as Record<string, unknown>;
  // ID must match the on-disk-directory format. Without this check, a manifest
  // ID like "foo/bar" would survive validation, then collide with "foobar"
  // after sanitizePluginId — letting an external install overwrite another
  // plugin's directory inside promotePluginDir.
  if (typeof m.id !== 'string' || !PLUGIN_ID_PATTERN.test(m.id)) return false;
  if (typeof m.name !== 'string' || !m.name) return false;
  if (typeof m.version !== 'string') return false;
  if (typeof m.moduleType !== 'string' || !m.moduleType) return false;
  if (typeof m.category !== 'string' || !m.category) return false;
  // Validate optional secrets array
  if (m.secrets !== undefined) {
    if (!Array.isArray(m.secrets)) return false;
    for (const s of m.secrets) {
      if (!s || typeof s !== 'object') return false;
      if (typeof s.key !== 'string' || !/^[a-z0-9_-]+$/i.test(s.key)) return false;
      if (typeof s.label !== 'string' || !s.label) return false;
      if (typeof s.required !== 'boolean') return false;
    }
  }
  // Validate optional allowedDomains array
  if (m.allowedDomains !== undefined) {
    if (!Array.isArray(m.allowedDomains)) return false;
    if (!m.allowedDomains.every((d: unknown) => typeof d === 'string')) return false;
  }
  // Validate optional providesState array. Keys are declared un-prefixed;
  // registration prefixes them with `plugin:<id>:`, so check the charset
  // against the raw key and the length cap against the prefixed key.
  if (m.providesState !== undefined) {
    if (!Array.isArray(m.providesState)) return false;
    const prefix = pluginStatePrefix(m.id);
    for (const p of m.providesState) {
      if (!p || typeof p !== 'object') return false;
      const entry = p as Record<string, unknown>;
      if (typeof entry.key !== 'string' || !SHARED_STATE_KEY_RE.test(entry.key)) return false;
      if (prefix.length + entry.key.length > MAX_SHARED_STATE_KEY_LENGTH) return false;
      if (typeof entry.label !== 'string' || !entry.label) return false;
      if (entry.sampleValues !== undefined
        && (!Array.isArray(entry.sampleValues) || !entry.sampleValues.every((v: unknown) => typeof v === 'string'))) return false;
    }
  }
  return true;
}

// --- External registry fetch + cache ---

let registryCache: { data: PluginRegistry; fetchedAt: number } | null = null;

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/home-screens/home-screens-plugins/main/plugins.json';

export async function fetchRegistry(registryUrl?: string): Promise<PluginRegistry> {
  const now = Date.now();
  if (registryCache && now - registryCache.fetchedAt < REGISTRY_CACHE_TTL_MS) {
    return registryCache.data;
  }

  const url = registryUrl ?? DEFAULT_REGISTRY_URL;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
  const data = (await res.json()) as PluginRegistry;
  registryCache = { data, fetchedAt: now };
  return data;
}
