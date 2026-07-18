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

import type { DisplayRule, ModuleInstance, Screen } from '@/types/config';
import { collectSourceKeys } from '@/lib/schedule';
import { extractSharedStateKeys } from '@/lib/shared-state-template';

/**
 * Rules join the demand set through their condition tree only, so demand
 * computation needs just `when` and the disable toggle — but the fields are
 * pinned to `DisplayRule` so a schema rename can't silently strand this.
 */
type RuleConditions = Pick<DisplayRule, 'when' | 'enabled'>;

/**
 * The single config traversal behind both `collectDemandedKeys` and
 * `collectKeyReferences`: every key source (module visibility conditions,
 * Text module tokens, display-rule conditions) and every skip rule (disabled
 * screens/modules/rules, empty authoring-time keys) lives here exactly once,
 * so the demand-driven providers and the editor's bus inspector can never
 * disagree about which keys the config references.
 *
 * Disabled screens, modules, and rules are skipped: ScreenRotator excludes
 * disabled screens before profile resolution and the rule engine never
 * evaluates disabled rules, so their conditions can never run and demanding
 * their keys would make providers poll for consumers that can never render.
 * Empty sourceKeys are dropped — a condition may legally hold one while
 * being authored, evaluated as unknown and never publishable.
 */
function walkReferencedKeys<R extends RuleConditions>(
  screens: Screen[],
  rules: readonly R[] | undefined,
  onModuleKey: (key: string, screen: Screen, mod: ModuleInstance) => void,
  onRuleKey: (key: string, rule: R) => void,
): void {
  for (const screen of screens) {
    if (screen.enabled === false) continue;
    for (const mod of screen.modules) {
      if (mod.enabled === false) continue;
      const keys = new Set<string>();
      if (mod.visibility?.conditions) collectSourceKeys(mod.visibility.conditions, keys);
      if (mod.type === 'text' && typeof mod.config?.content === 'string') {
        for (const key of extractSharedStateKeys(mod.config.content)) keys.add(key);
      }
      keys.delete('');
      for (const key of keys) onModuleKey(key, screen, mod);
    }
  }

  if (rules) {
    for (const rule of rules) {
      if (rule.enabled === false) continue;
      const keys = new Set<string>();
      if (rule.when) collectSourceKeys(rule.when, keys);
      keys.delete('');
      for (const key of keys) onRuleKey(key, rule);
    }
  }
}

/**
 * All shared-state keys referenced anywhere on this display: module
 * visibility conditions + Text module tokens + display-rule conditions.
 *
 * Callers pass ALL of the display's screens, pre-profile-filter, for the
 * same reason `BackgroundProviderLayer` does: a profile switch must not
 * cold-start providers. Re-enabling a disabled screen/module is a config
 * edit, and demand recomputes on the same poll that delivers it.
 */
export function collectDemandedKeys(screens: Screen[], rules?: readonly RuleConditions[]): Set<string> {
  const demanded = new Set<string>();
  const add = (key: string) => demanded.add(key);
  walkReferencedKeys(screens, rules, add, add);
  return demanded;
}

/** One consumer of a shared-state key, for the editor's bus inspector. */
export type StateKeyReference =
  | { kind: 'module'; screenId: string; screenName: string; moduleId: string; moduleType: string }
  | { kind: 'rule'; ruleId: string; ruleName: string };

/** Rules need id + name here (the inspector lists them), unlike demand. */
type RuleReference = Pick<DisplayRule, 'id' | 'name' | 'when' | 'enabled'>;

/**
 * Key → every module/rule that references it. The inspector's view over the
 * same `walkReferencedKeys` traversal that feeds `collectDemandedKeys`, so
 * the key set of the returned map always equals the demand set for the same
 * input — by construction, and asserted by a unit test.
 */
export function collectKeyReferences(
  screens: Screen[],
  rules?: readonly RuleReference[],
): Map<string, StateKeyReference[]> {
  const refs = new Map<string, StateKeyReference[]>();
  const add = (key: string, ref: StateKeyReference) => {
    const list = refs.get(key);
    if (list) list.push(ref);
    else refs.set(key, [ref]);
  };

  walkReferencedKeys(
    screens,
    rules,
    (key, screen, mod) =>
      add(key, {
        kind: 'module',
        screenId: screen.id,
        screenName: screen.name,
        moduleId: mod.id,
        moduleType: mod.type,
      }),
    (key, rule) => add(key, { kind: 'rule', ruleId: rule.id, ruleName: rule.name }),
  );

  return refs;
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
