/**
 * Small shared helpers for surfacing provider-health in the editor: map a bus
 * key to its owning plugin, resolve a friendly plugin name, and pick the note
 * for the first unhealthy provider among a set of referenced keys. Kept out of
 * the components so the condition editor, the outcome line, and the bus
 * inspector all format the same "<plugin>: <message>" the same way.
 */

import type { ProviderHealthEntry } from '@/lib/provider-health-store';
import type { LoadedPlugin } from '@/types/plugins';

const PLUGIN_KEY_RE = /^plugin:([^:]+):/;

/** Lowercased plugin id owning a `plugin:<id>:<rest>` bus key, or null. */
export function pluginIdFromStateKey(key: string): string | null {
  const match = PLUGIN_KEY_RE.exec(key);
  return match ? match[1].toLowerCase() : null;
}

/** Friendly plugin name for an id from the loaded-plugin manifests; falls
 *  back to the raw id when the plugin isn't loaded. */
export function pluginDisplayName(pluginId: string, plugins: Map<string, LoadedPlugin>): string {
  for (const plugin of plugins.values()) {
    if (plugin.manifest.id.toLowerCase() === pluginId) return plugin.manifest.name;
  }
  return pluginId;
}

/**
 * The unhealthy-provider note for a set of referenced keys: the friendly name
 * and verbatim message of the FIRST key whose owning plugin is currently
 * unhealthy, or null when none are. Lets a "waiting for data" hint explain
 * the real cause ("the service is down") instead of a bare missing key.
 */
export function unhealthyNoteForKeys(
  keys: Iterable<string>,
  providerHealth: Record<string, ProviderHealthEntry>,
  plugins: Map<string, LoadedPlugin>,
): { pluginName: string; message: string } | null {
  for (const key of keys) {
    const id = pluginIdFromStateKey(key);
    if (id && providerHealth[id]) {
      return { pluginName: pluginDisplayName(id, plugins), message: providerHealth[id].message };
    }
  }
  return null;
}
