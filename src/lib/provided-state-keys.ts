import type { ModuleType, Screen } from '@/types/config';
import { getModuleDefinition, type ProvidedStateKey } from '@/lib/module-registry';

/**
 * Aggregate the shared-state keys advertised by every background-provider
 * module across the given screens, for the editor's visibility-condition
 * picker. Static keys come from `providesState`; config-driven producers
 * (e.g. an entity list) are resolved by calling `deriveProvidedKeys` with
 * the instance's config. Deduped by key, first label wins.
 *
 * Only `backgroundProvider: true` instances are scanned — an un-flagged
 * instance never publishes reliably (it unmounts on rotation), so offering
 * its keys would suggest conditions that go stale.
 */
export function collectProvidedStateKeys(screens: Screen[]): ProvidedStateKey[] {
  const out = new Map<string, ProvidedStateKey>();
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
          console.warn(`[shared-state] deriveProvidedKeys threw for ${mod.type}:`, err);
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
