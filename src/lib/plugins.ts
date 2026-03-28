import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { InstalledPluginsFile, InstalledPlugin, PluginManifest, RegistryPlugin, PluginRegistry } from '@/types/plugins';
import { deleteAllPluginSecrets } from '@/lib/plugin-secrets';
import { sanitizePluginId, pluginsDir, pluginDir, getPluginManifest } from '@/lib/plugin-utils';

// Re-export for backward compatibility — many files import these from '@/lib/plugins'
export { sanitizePluginId, getPluginManifest };

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

/** Track in-progress installs to prevent concurrent installs of the same plugin */
const installing = new Set<string>();

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
    const tmpTarPath = path.join(pluginsDir(), `${safeId}.tar.gz`);
    await fs.writeFile(tmpTarPath, downloadBuffer);

    try {
      // Pre-flight: reject tarballs containing path traversal entries
      const { stdout } = await execFileAsync('tar', ['-tzf', tmpTarPath]);
      if (stdout.split('\n').some((entry) => entry.split('/').includes('..'))) {
        throw new Error('Tarball contains path traversal entries');
      }

      // Extract to temp directory first — only promote after validation
      const tmpDir = path.join(pluginsDir(), `.tmp-${safeId}`);
      await fs.rm(tmpDir, { recursive: true, force: true });
      await fs.mkdir(tmpDir, { recursive: true });

      try {
        await execFileAsync('tar', ['-xzf', tmpTarPath, '-C', tmpDir, '--strip-components=1']);

        // Validate manifest in temp directory before promoting
        const manifestPath = path.join(tmpDir, 'manifest.json');
        let manifest: PluginManifest;
        try {
          const raw = await fs.readFile(manifestPath, 'utf-8');
          manifest = JSON.parse(raw);
        } catch {
          throw new Error('Plugin manifest is missing or unreadable');
        }
        if (!validateManifest(manifest)) {
          throw new Error('Plugin manifest is invalid');
        }

        // Validation passed — atomically promote to final location
        const dir = pluginDir(registryEntry.id);
        await fs.rm(dir, { recursive: true, force: true });
        await fs.rename(tmpDir, dir);
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

export async function uninstallPlugin(pluginId: string): Promise<void> {
  // Delete plugin secrets before removing the directory (secrets file lives inside it)
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
  if (typeof m.id !== 'string' || !m.id) return false;
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
