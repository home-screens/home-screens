import type { ModuleType, Screen } from '@/types/config';
import { getAllModuleDefinitions, getModuleDefinition, type ProvidedStateKey } from '@/lib/module-registry';
import { logger } from '@/lib/logger';

const log = logger('shared-state');

/**
 * Demand-driven plugins (manifest `exports.stateProvider`) publish their
 * static `providesState` keys independent of any on-screen module instance —
 * the host mounts one provider per plugin regardless of placement, so an
 * un-flagged/absent instance still publishes once something demands the key
 * (see PluginServiceLayer). Scanning screens for these would find nothing;
 * the registry itself is the only source of truth. Deliberately screen- and
 * display-independent, matching how the runtime mounts these providers.
 */
function collectStateProviderKeys(): ProvidedStateKey[] {
  const out = new Map<string, ProvidedStateKey>();
  for (const def of getAllModuleDefinitions()) {
    if (!def.hasStateProvider) continue;
    for (const entry of Array.isArray(def.providesState) ? def.providesState : []) {
      if (!out.has(entry.key)) out.set(entry.key, entry);
    }
  }
  return Array.from(out.values());
}

/**
 * Aggregate the shared-state keys advertised by every background-provider
 * module across the given screens, for the editor's visibility-condition
 * picker. Static keys come from `providesState`; config-driven producers
 * (e.g. an entity list) are resolved by calling `deriveProvidedKeys` with
 * the instance's config. Merged with `collectStateProviderKeys` (demand-driven
 * plugins, screen-independent). Deduped by key, first label wins.
 *
 * Only `backgroundProvider: true` instances are scanned for the on-screen
 * source — an un-flagged instance never publishes reliably (it unmounts on
 * rotation), so offering its keys would suggest conditions that go stale.
 * That restriction doesn't apply to demand-driven plugins, which publish
 * without any instance at all.
 */
export function collectProvidedStateKeys(screens: Screen[]): ProvidedStateKey[] {
  const out = new Map<string, ProvidedStateKey>();
  for (const entry of collectStateProviderKeys()) out.set(entry.key, entry);
  for (const screen of screens) {
    for (const mod of screen.modules) {
      if (!mod.backgroundProvider || mod.enabled === false) continue;
      const def = getModuleDefinition(mod.type);
      if (!def) continue;
      // Array.isArray guards: providesState originates in third-party manifests;
      // registration filters malformed shapes, but the dev-plugin path and
      // built-in defs are not forced through validateManifest.
      for (const entry of Array.isArray(def.providesState) ? def.providesState : []) {
        if (!out.has(entry.key)) out.set(entry.key, entry);
      }
      if (def.deriveProvidedKeys) {
        try {
          const derived = def.deriveProvidedKeys(mod.config);
          for (const entry of Array.isArray(derived) ? derived : []) {
            if (!out.has(entry.key)) out.set(entry.key, entry);
          }
        } catch (err) {
          // A plugin's deriver is third-party code — never let it break the panel.
          log.warn(`deriveProvidedKeys threw for ${mod.type}:`, err);
        }
      }
    }
  }
  return Array.from(out.values());
}

/** True when this module type declares itself a state producer (editor shows the background toggle). */
export function isStateProducerType(type: ModuleType): boolean {
  const def = getModuleDefinition(type);
  return (Array.isArray(def?.providesState) && def.providesState.length > 0)
    || !!def?.deriveProvidedKeys;
}
