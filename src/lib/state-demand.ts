/**
 * Demand-driven shared-state key computation.
 *
 * The host knows exactly which shared-state keys a display needs: every
 * `sourceKey` in a module's visibility-condition tree plus every `{key}`
 * token in a Text module's content (and, later, display-rule conditions).
 * This module generalizes that into a display-wide demand set and groups it
 * by owning plugin, so `PluginServiceLayer` can hand each plugin's
 * `stateProvider` exactly the keys it must publish — no second module, no
 * `backgroundProvider` flag, no entity-list sync.
 */

import type { Screen, VisibilityCondition } from '@/types/config';
import { collectConditionSourceKeys } from '@/lib/schedule';
import { extractSharedStateKeys } from '@/lib/shared-state-template';

/**
 * Structural stand-in for item 3's `DisplayRule` — rules join the demand set
 * through their condition tree only, so only `when` matters here.
 */
interface RuleLike {
  when: VisibilityCondition[];
}

/**
 * All shared-state keys referenced anywhere on this display: module
 * visibility conditions + Text module tokens + (item 3) rule conditions.
 *
 * Callers pass ALL of the display's screens, pre-profile-filter, for the
 * same reason `BackgroundProviderLayer` does: a profile switch must not
 * cold-start providers. Disabled screens and disabled modules are skipped —
 * ScreenRotator excludes disabled screens before profile resolution, so
 * their conditions are never evaluated and demanding their keys would make
 * providers poll for consumers that can never render. Unlike the
 * profile-filter case there is no blink-window rationale for including
 * them: re-enabling is a config edit, and demand recomputes on the same
 * poll that delivers it.
 */
export function collectDemandedKeys(screens: Screen[], rules?: RuleLike[]): Set<string> {
  const demanded = new Set<string>();

  for (const screen of screens) {
    if (screen.enabled === false) continue;
    const activeModules = screen.modules.filter((m) => m.enabled !== false);
    for (const key of collectConditionSourceKeys(activeModules)) {
      demanded.add(key);
    }
    for (const mod of activeModules) {
      if (mod.type !== 'text') continue;
      const content = mod.config?.content;
      if (typeof content !== 'string') continue;
      for (const key of extractSharedStateKeys(content)) {
        demanded.add(key);
      }
    }
  }

  if (rules) {
    const walk = (conditions: VisibilityCondition[]): void => {
      for (const c of conditions) {
        if (c.kind === 'and' || c.kind === 'or' || c.kind === 'not') walk(c.conditions);
        else if (c.sourceKey) demanded.add(c.sourceKey);
      }
    };
    for (const rule of rules) {
      if (rule.when) walk(rule.when);
    }
  }

  // Conditions may legally hold an empty sourceKey while being authored —
  // evaluated as unknown, never publishable, so it is not a demand.
  demanded.delete('');
  return demanded;
}

const PLUGIN_KEY_RE = /^plugin:([^:]+):(.+)$/;

/**
 * Group a demand set by owning plugin id; strips the `plugin:<id>:` prefix
 * so entries match what the plugin passes to `publishState`. Keys not
 * matching any loaded plugin (native producers, typos, uninstalled plugins)
 * are ignored. Each plugin's list is deduped and sorted — stable output for
 * memoization. Plugin ids are matched lowercased (the canonical namespace
 * form; see `pluginStatePrefix`).
 */
export function demandByPlugin(
  demanded: ReadonlySet<string>,
  loadedPluginIds: string[],
): Map<string, string[]> {
  const known = new Set(loadedPluginIds.map((id) => id.toLowerCase()));
  const grouped = new Map<string, Set<string>>();

  for (const key of demanded) {
    const match = PLUGIN_KEY_RE.exec(key);
    if (!match) continue;
    const pluginId = match[1].toLowerCase();
    if (!known.has(pluginId)) continue;
    let keys = grouped.get(pluginId);
    if (!keys) {
      keys = new Set();
      grouped.set(pluginId, keys);
    }
    keys.add(match[2]);
  }

  const out = new Map<string, string[]>();
  for (const [pluginId, keys] of grouped) {
    out.set(pluginId, Array.from(keys).sort());
  }
  return out;
}
