import { promises as fs } from 'fs';
import path from 'path';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';

type PluginSecretsStore = Record<string, string>;

function pluginSecretsPath(pluginId: string): string {
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
    return {};
  }
}

async function writePluginSecrets(pluginId: string, store: PluginSecretsStore): Promise<void> {
  const filePath = pluginSecretsPath(pluginId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf-8');
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, filePath);
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
  try {
    await fs.unlink(pluginSecretsPath(pluginId));
  } catch {
    // File may not exist — that's fine
  }
}
