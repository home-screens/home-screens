'use client';

// Editor-side save path for plugin-level settings: one PUT + one store push,
// shared by the plugin manager's settings form (PluginSettingsSection) and
// the SDK's `setPluginSettings` (plugin ConfigSections saving connection
// values inline). Keeping both callers on this helper guarantees the plugin
// store map is always updated with exactly what the server stored — the
// route's sanitizer drops keys the on-disk schema doesn't declare, and a
// silent divergence between disk and store would resurface as "saved but
// nothing changed".

import { editorFetch } from '@/lib/editor-fetch';
import { usePluginStore } from '@/stores/plugin-store';

export type SavePluginSettingsResult =
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Replace a plugin's stored settings object. On success the returned
 * `settings` are what the server actually stored, already pushed into the
 * plugin store's settings map (no bundle reload — providers and module
 * instances see the new values as a prop/snapshot change).
 */
export async function savePluginSettings(
  pluginId: string,
  settings: Record<string, unknown>,
): Promise<SavePluginSettingsResult> {
  try {
    const res = await editorFetch(`/api/plugins/settings/${encodeURIComponent(pluginId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}` };
    }
    const stored: Record<string, unknown> = data.settings ?? {};
    const store = usePluginStore.getState();
    const next = new Map(store.pluginSettings);
    next.set(pluginId.toLowerCase(), stored);
    store.setPluginSettingsMap(next);
    return { ok: true, settings: stored };
  } catch {
    return { ok: false, error: 'network' };
  }
}
