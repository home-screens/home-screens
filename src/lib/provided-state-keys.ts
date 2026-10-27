import type { GlobalSettings, ModuleType, Screen } from '@/types/config';
import { getAllModuleDefinitions, getModuleDefinition, type ProvidedStateKey } from '@/lib/module-registry';
import { calendarProvidedStateKeys } from '@/lib/calendar-state';
import { providerSendsWeatherAlerts, weatherProvidedStateKeys } from '@/lib/weather-state';
import { hasAnyCalendarSource } from '@/lib/calendar-sources';
import { notesProvidedStateKeys } from '@/lib/notes-state';
import { getLocation } from '@/lib/location';
import type { TranslateFn } from '@/i18n';
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
 * Host-published keys, which come from the display shell rather than from any
 * module instance. Screen-independent for the same reason `stateProvider`
 * plugins are: `useSharedDisplayData` fetches the calendar off settings
 * alone, so the values exist whether or not a calendar module is placed.
 *
 * `t` supplies the household-facing labels (plugin manifests carry their own
 * untranslated strings; built-ins should not). The settings gate each group
 * on its fetch actually producing something: the calendar keys need a
 * calendar source, the weather keys need a location, and the weather warning
 * keys need a default provider that sends warnings. Without those nothing
 * is ever fetched or the value never changes, and a condition built on
 * these keys would silently hide its module, or never fire a rule, forever.
 */
export interface HostStateKeyContext {
  t: TranslateFn;
  settings?: GlobalSettings;
}

function collectHostStateKeys(host: HostStateKeyContext): ProvidedStateKey[] {
  const out: ProvidedStateKey[] = [];
  if (hasAnyCalendarSource(host.settings?.calendar)) out.push(...calendarProvidedStateKeys(host.t));
  if (getLocation(host.settings)) {
    out.push(...weatherProvidedStateKeys(host.t, { alerts: providerSendsWeatherAlerts(host.settings?.weather?.provider) }));
  }
  // The notes board needs no setting: the shell reads it on every display,
  // and an empty board publishes zeros rather than nothing.
  out.push(...notesProvidedStateKeys(host.t));
  return out;
}

/**
 * Aggregate the shared-state keys advertised by every background-provider
 * module across the given screens, for the editor's visibility-condition
 * picker. Static keys come from `providesState`; config-driven producers
 * (e.g. an entity list) are resolved by calling `deriveProvidedKeys` with
 * the instance's config. Merged with `collectStateProviderKeys` (demand-driven
 * plugins, screen-independent) and, when `host` is supplied, the host's own
 * keys. Deduped by key, first label wins.
 *
 * Only `backgroundProvider: true` instances are scanned for the on-screen
 * source — an un-flagged instance never publishes reliably (it unmounts on
 * rotation), so offering its keys would suggest conditions that go stale.
 * That restriction doesn't apply to demand-driven plugins, which publish
 * without any instance at all.
 *
 * `host` is optional so plain module/plugin key collection stays callable
 * without an i18n context; every editor picker passes it, and omitting it
 * simply leaves the built-in keys out of the list.
 */
export function collectProvidedStateKeys(
  screens: Screen[],
  host?: HostStateKeyContext,
): ProvidedStateKey[] {
  const out = new Map<string, ProvidedStateKey>();
  if (host) {
    for (const entry of collectHostStateKeys(host)) out.set(entry.key, entry);
  }
  for (const entry of collectStateProviderKeys()) {
    if (!out.has(entry.key)) out.set(entry.key, entry);
  }
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
