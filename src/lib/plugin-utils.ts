import { promises as fs } from 'fs';
import path from 'path';
import type { PluginManifest } from '@/types/plugins';

const PLUGINS_DIR = 'data/plugins';

export function pluginsDir(): string {
  return path.join(process.cwd(), PLUGINS_DIR);
}

export const PLUGIN_ID_PATTERN = /^[a-z0-9_-]+$/i;

/**
 * Validate a plugin ID. Throws on empty or unsafe input.
 *
 * Rejects (rather than strips) unsafe characters so two distinct IDs like
 * `foo/bar` and `foobar` can never resolve to the same on-disk directory.
 * Silent stripping let a malicious external plugin overwrite another plugin's
 * files via a manifest ID that survived `validateManifest` but collided after
 * sanitization.
 */
export function sanitizePluginId(pluginId: string): string {
  if (typeof pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error('Invalid plugin ID');
  }
  return pluginId;
}

export function pluginDir(pluginId: string): string {
  return path.join(pluginsDir(), sanitizePluginId(pluginId));
}

export async function getPluginManifest(pluginId: string): Promise<PluginManifest | null> {
  try {
    const manifestPath = path.join(pluginDir(pluginId), 'manifest.json');
    const data = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(data) as PluginManifest;
  } catch {
    return null;
  }
}
