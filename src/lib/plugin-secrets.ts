import { promises as fs } from 'fs';
import path from 'path';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';
import { createJsonStore } from '@/lib/json-store';

type PluginSecretsStore = Record<string, string>;
export const SECRETS_DIR = path.join('data', 'plugin-secrets');

// Secrets live outside the plugin directory so an upgrade, which wipes and
// replaces `data/plugins/{pluginId}/` wholesale, cannot destroy them.
function pluginSecretsPath(pluginId: string): string {
  const safeId = sanitizePluginId(pluginId);
  return path.join(process.cwd(), SECRETS_DIR, `${safeId}.json`);
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
      path: path.join(SECRETS_DIR, `${safeId}.json`),
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
 * backup. The write goes through the plugin's own serialized queue.
 */
export async function readAllPluginSecrets(pluginId: string): Promise<Record<string, string>> {
  return readPluginSecrets(pluginId);
}

export async function writeAllPluginSecrets(
  pluginId: string,
  secrets: Record<string, string>,
): Promise<void> {
  await storeFor(pluginId).write(secrets);
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
  await storeFor(pluginId).updateAtomic(async (current) => ({ ...current, [key]: value }));
}

/** Delete a single plugin secret. Skips write if key wasn't present. */
export async function deletePluginSecret(pluginId: string, key: string): Promise<void> {
  await storeFor(pluginId).updateAtomic(async (current) => {
    if (!(key in current)) return current; // no-op, skip write
    const { [key]: _dropped, ...rest } = current;
    return rest;
  });
}

/** Get configured status for all declared secrets (key to boolean). */
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
  await storeFor(pluginId).remove().catch(() => {});
}
