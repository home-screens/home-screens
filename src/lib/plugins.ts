import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InstalledPluginsFile, InstalledPlugin, PluginManifest, RegistryPlugin, PluginRegistry } from '@/types/plugins';
import { deleteAllPluginSecrets, migrateLegacyPluginSecrets } from '@/lib/plugin-secrets';
import { sanitizePluginId, pluginsDir, pluginDir, getPluginManifest, PLUGIN_ID_PATTERN } from '@/lib/plugin-utils';

const execFileAsync = promisify(execFile);

const INSTALLED_FILE = 'data/plugins/installed.json';
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function installedPath(): string {
  return path.join(process.cwd(), INSTALLED_FILE);
}

// --- Write serialization (prevents TOCTOU races on installed.json) ---

let writeQueue: Promise<void> = Promise.resolve();

function serializedWrite(fn: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(fn);
  writeQueue = next.catch(() => {});
  return next;
}

// --- Installed plugins ---

// In-memory cache for installed.json (avoids disk reads every 3s poll)
let installedCache: { data: InstalledPluginsFile; mtime: number } | null = null;

export async function getInstalledPlugins(): Promise<InstalledPluginsFile> {
  try {
    const filePath = installedPath();
    const stat = await fs.stat(filePath);
    const mtime = stat.mtimeMs;
    // Return cached if file hasn't changed
    if (installedCache && installedCache.mtime === mtime) {
      return installedCache.data;
    }
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as InstalledPluginsFile;
    installedCache = { data: parsed, mtime };
    return parsed;
  } catch {
    return { schemaVersion: 1, plugins: [] };
  }
}

function saveInstalledPlugins(data: InstalledPluginsFile): Promise<void> {
  return serializedWrite(async () => {
    const dir = path.dirname(installedPath());
    await fs.mkdir(dir, { recursive: true });
    const tmp = installedPath() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, installedPath());
    // Invalidate cache
    installedCache = null;
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

    // Update installed.json (serialized to prevent TOCTOU races)
    const installed = await getInstalledPlugins();
    const existing = installed.plugins.findIndex((p) => p.id === registryEntry.id);

    const entry: InstalledPlugin = {
      id: registryEntry.id,
      version,
      installedAt: new Date().toISOString(),
      enabled: true,
      moduleType: manifest.moduleType,
    };

    if (existing >= 0) {
      // Track the old version so the client-side loader can run config migrations
      const oldVersion = installed.plugins[existing].version;
      if (oldVersion !== version) {
        entry.previousVersion = oldVersion;
      }
      installed.plugins[existing] = entry;
    } else {
      installed.plugins.push(entry);
    }
    await saveInstalledPlugins(installed);
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
        const existing = installed.plugins.find((p) => p.id === manifest.id);
        if (existing && existing.source !== 'external') {
          throw new Error(
            `A marketplace plugin with ID '${manifest.id}' is already installed. `
            + `Uninstall it first to replace with an external version.`,
          );
        }

        await promotePluginDir(tmpDir, manifest.id);

        const entry: InstalledPlugin = {
          id: manifest.id,
          version: manifest.version,
          installedAt: new Date().toISOString(),
          enabled: true,
          moduleType: manifest.moduleType,
          source: 'external',
          externalUrl: tarballUrl,
        };
        if (existing && existing.version !== manifest.version) {
          entry.previousVersion = existing.version;
        }

        const idx = installed.plugins.findIndex((p) => p.id === manifest.id);
        if (idx >= 0) {
          installed.plugins[idx] = entry;
        } else {
          installed.plugins.push(entry);
        }
        await saveInstalledPlugins(installed);

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

  const installed = await getInstalledPlugins();
  installed.plugins = installed.plugins.filter((p) => p.id !== pluginId);
  await saveInstalledPlugins(installed);
}

export async function clearPreviousVersion(pluginId: string): Promise<void> {
  const installed = await getInstalledPlugins();
  const plugin = installed.plugins.find((p) => p.id === pluginId);
  if (!plugin || !plugin.previousVersion) return;
  delete plugin.previousVersion;
  await saveInstalledPlugins(installed);
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const installed = await getInstalledPlugins();
  const plugin = installed.plugins.find((p) => p.id === pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  plugin.enabled = enabled;
  await saveInstalledPlugins(installed);
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
  const installed = await getInstalledPlugins();
  const existing = installed.plugins.findIndex((p) => p.id === manifest.id);

  const entry: InstalledPlugin = {
    id: manifest.id,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    enabled: true,
    moduleType: manifest.moduleType,
  };

  if (existing >= 0) {
    installed.plugins[existing] = entry;
  } else {
    installed.plugins.push(entry);
  }
  await saveInstalledPlugins(installed);
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
