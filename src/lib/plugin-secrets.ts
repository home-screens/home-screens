import { promises as fs } from 'fs';
import path from 'path';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';
import { createJsonStore } from '@/lib/json-store';

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

// --- Per-plugin stores ---
// One json-store per secrets file gives each plugin its own serialized
// write queue (prevents TOCTOU races on concurrent secret saves) plus the
// tmp+rename atomic write, 0o600 file mode, and 0o700 directory mode.

const stores = new Map<string, ReturnType<typeof createJsonStore<PluginSecretsStore>>>();

function storeFor(pluginId: string) {
  const safeId = sanitizePluginId(pluginId);
  let store = stores.get(safeId);
  if (!store) {
    store = createJsonStore<PluginSecretsStore>({
      path: path.join('data', 'plugin-secrets', `${safeId}.json`),
      defaultValue: {},
      chmod: 0o600,
      dirMode: 0o700,
    });
    stores.set(safeId, store);
  }
  return store;
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

/** Validate that a secret key is declared in the plugin's manifest */
async function isValidSecretKey(pluginId: string, key: string): Promise<boolean> {
  const manifest = await getPluginManifest(pluginId);
  if (!manifest?.secrets) return false;
  return manifest.secrets.some((s) => s.key === key);
}

// --- Public API ---

/**
 * Whole-file read/write for a plugin's secrets, used by the credential
 * backup. `readAllPluginSecrets` includes the legacy-path fallback, so a
 * server that hasn't upgraded its plugins yet still backs up its tokens.
 * The write goes through the plugin's own serialized queue.
 */
export async function readAllPluginSecrets(pluginId: string): Promise<Record<string, string>> {
  return readPluginSecrets(pluginId);
}

export async function writeAllPluginSecrets(
  pluginId: string,
  secrets: Record<string, string>,
): Promise<void> {
  await storeFor(pluginId).write(secrets);
  // The new-location file now supersedes any legacy copy; drop it so the
  // read-fallback can never resurface a pre-restore value.
  await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
}

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
  await storeFor(pluginId).updateAtomic(async () => {
    // Read through the legacy-fallback path so keys still living only in the
    // legacy file survive this write (which supersedes the legacy file).
    const store = await readPluginSecrets(pluginId);
    return { ...store, [key]: value };
  });
  // Clean up any legacy file so read-fallback never surfaces a stale value.
  await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
}

/** Delete a single plugin secret. Skips write if key wasn't present. */
export async function deletePluginSecret(pluginId: string, key: string): Promise<void> {
  let removed = false;
  await storeFor(pluginId).updateAtomic(async (current) => {
    const store = await readPluginSecrets(pluginId);
    if (!(key in store)) return current; // no-op, skip write
    removed = true;
    const { [key]: _dropped, ...rest } = store;
    return rest;
  });
  if (removed) {
    await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
  }
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
  // Legacy file goes first so a queued migration can't re-adopt it after the
  // main file is removed.
  await fs.unlink(legacyPluginSecretsPath(pluginId)).catch(() => {});
  await storeFor(pluginId).remove().catch(() => {});
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
  const legacyPath = legacyPluginSecretsPath(pluginId);
  let migrated = false;
  await storeFor(pluginId).updateAtomic(async (current) => {
    let data: string;
    try {
      data = await fs.readFile(legacyPath, 'utf-8');
    } catch {
      return current; // no legacy file — nothing to migrate
    }
    try {
      await fs.access(pluginSecretsPath(pluginId));
      // New-location file already exists — it wins; drop the stale legacy copy.
      await fs.unlink(legacyPath).catch(() => {});
      return current;
    } catch {
      // new path absent — proceed with adoption
    }
    let parsed: PluginSecretsStore;
    try {
      parsed = JSON.parse(data) as PluginSecretsStore;
    } catch {
      return current; // corrupt legacy file — nothing usable to migrate
    }
    migrated = true;
    return parsed;
  });
  if (migrated) {
    // Only after the new-location write has landed, so a crash mid-migration
    // never leaves the token in neither place.
    await fs.unlink(legacyPath).catch(() => {});
  }
}
