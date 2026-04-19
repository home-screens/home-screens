import { promises as fs } from 'fs';
import path from 'path';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';

type PluginSecretsStore = Record<string, string>;

// Secrets live *outside* the plugin directory so an upgrade — which wipes
// and replaces `data/plugins/{pluginId}/` wholesale — can't destroy them.
function pluginSecretsPath(pluginId: string): string {
  const safeId = sanitizePluginId(pluginId);
  return path.join(process.cwd(), 'data', 'plugin-secrets', `${safeId}.json`);
}

// Pre-fix location: inside the plugin's own directory. Kept for one-shot
// read-fallback + migration during the next plugin upgrade. Remove once all
// users have migrated.
function legacyPluginSecretsPath(pluginId: string): string {
  const safeId = sanitizePluginId(pluginId);
  return path.join(process.cwd(), 'data', 'plugins', safeId, 'secrets.json');
}

// --- Write serialization (prevents TOCTOU races on concurrent secret saves) ---

let writeQueue: Promise<void> = Promise.resolve();

function serializedWrite(fn: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(fn);
  writeQueue = next.catch(() => {});
  return next;
}

// --- Internal helpers ---

async function readPluginSecrets(pluginId: string): Promise<PluginSecretsStore> {
  try {
    const data = await fs.readFile(pluginSecretsPath(pluginId), 'utf-8');
    return JSON.parse(data) as PluginSecretsStore;
  } catch {
    // Fall through to legacy path so servers updated before their next plugin
    // upgrade still see the user's existing token.
  }
  try {
    const data = await fs.readFile(legacyPluginSecretsPath(pluginId), 'utf-8');
    return JSON.parse(data) as PluginSecretsStore;
  } catch {
    return {};
  }
}

async function writePluginSecrets(pluginId: string, store: PluginSecretsStore): Promise<void> {
  const filePath = pluginSecretsPath(pluginId);
  // 0o700 on the directory mirrors the 0o600 intent on each file — keeps the
  // tree unreadable to other users even if the per-file chmod races.
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, filePath);
  // Clean up any legacy file so read-fallback never surfaces a stale value.
  await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
}

/** Validate that a secret key is declared in the plugin's manifest */
async function isValidSecretKey(pluginId: string, key: string): Promise<boolean> {
  const manifest = await getPluginManifest(pluginId);
  if (!manifest?.secrets) return false;
  return manifest.secrets.some((s) => s.key === key);
}

// --- Public API ---

/** Get a single plugin secret value. Returns null if not set. */
export async function getPluginSecret(pluginId: string, key: string): Promise<string | null> {
  const store = await readPluginSecrets(pluginId);
  return store[key] ?? null;
}

/** Set a plugin secret. Validates key against manifest declaration. */
export async function setPluginSecret(pluginId: string, key: string, value: string): Promise<void> {
  if (!(await isValidSecretKey(pluginId, key))) {
    throw new Error(`Secret key "${key}" is not declared in plugin manifest`);
  }
  return serializedWrite(async () => {
    const store = await readPluginSecrets(pluginId);
    store[key] = value;
    await writePluginSecrets(pluginId, store);
  });
}

/** Delete a single plugin secret. Skips write if key wasn't present. */
export async function deletePluginSecret(pluginId: string, key: string): Promise<void> {
  return serializedWrite(async () => {
    const store = await readPluginSecrets(pluginId);
    if (!(key in store)) return;
    delete store[key];
    await writePluginSecrets(pluginId, store);
  });
}

/** Get configured status for all declared secrets (key → boolean). */
export async function getPluginSecretStatus(pluginId: string): Promise<Record<string, boolean>> {
  const manifest = await getPluginManifest(pluginId);
  if (!manifest?.secrets) return {};
  const store = await readPluginSecrets(pluginId);
  const status: Record<string, boolean> = {};
  for (const decl of manifest.secrets) {
    status[decl.key] = Boolean(store[decl.key]);
  }
  return status;
}

/** Delete all secrets for a plugin (called on uninstall). */
export async function deleteAllPluginSecrets(pluginId: string): Promise<void> {
  return serializedWrite(async () => {
    await fs.unlink(pluginSecretsPath(pluginId)).catch(() => {});
    await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
  });
}

/**
 * Move a legacy in-plugin-dir secrets.json to the new out-of-tree location.
 * Called immediately before `promotePluginDir` wipes the plugin directory,
 * so an upgrade no longer takes the user's token with it. No-op when no
 * legacy file exists, or when a new-location file already does. Serialized
 * through the same queue as setPluginSecret so a concurrent write during
 * upgrade can't race the migration.
 */
export async function migrateLegacyPluginSecrets(pluginId: string): Promise<void> {
  return serializedWrite(async () => {
    const legacyPath = legacyPluginSecretsPath(pluginId);
    let data: string;
    try {
      data = await fs.readFile(legacyPath, 'utf-8');
    } catch {
      return;
    }
    const newPath = pluginSecretsPath(pluginId);
    try {
      await fs.access(newPath);
      await fs.unlink(legacyPath).catch(() => {});
      return;
    } catch {
      // new path absent — proceed
    }
    await fs.mkdir(path.dirname(newPath), { recursive: true, mode: 0o700 });
    const tmp = newPath + '.tmp';
    await fs.writeFile(tmp, data, 'utf-8');
    await fs.chmod(tmp, 0o600);
    await fs.rename(tmp, newPath);
    await fs.unlink(legacyPath).catch(() => {});
  });
}
