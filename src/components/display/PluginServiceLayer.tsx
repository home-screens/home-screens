'use client';

import { memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import type { DisplayRule, Screen } from '@/types/config';
import type { StateProviderProps } from '@/types/plugins';
import { usePluginStore } from '@/stores/plugin-store';
import { collectDemandedKeys, demandByPlugin } from '@/lib/state-demand';

interface PluginServiceLayerProps {
  /** ALL configured screens (pre-profile-filter) — a provider must publish
   *  even when every referencing module is on a profile-excluded screen. */
  screens: Screen[];
  /** This display's rules — their condition keys join the demand set, so a
   *  rule on a never-displayed entity publishes automatically. */
  rules?: DisplayRule[];
}

const EMPTY_SETTINGS: Record<string, unknown> = {};

/**
 * Root-resident layer that mounts one instance of each loaded plugin's
 * `stateProvider` export, handing it the demand-driven key set: every
 * shared-state key of that plugin's namespace referenced by any visibility
 * condition or Text-module token on this display.
 *
 * This inverts the `backgroundProvider` flow — instead of the user placing a
 * hidden producer module and keeping its entity list in sync with their
 * conditions, referencing a key IS what makes it publish. The provider is a
 * headless React component so the whole plugin runtime (`pluginFetch`,
 * `useFetchData`, `publishState`, effect polling) works unchanged; it
 * renders null inside a zero-size hidden div.
 *
 * Prop-stability contract (providers key their fetch effects on these):
 * - `demandedKeys` is rebuilt only when its CONTENT changes. The per-plugin
 *   demand is reduced to a joined string first, so a config poll that edits
 *   an unrelated module (new `screens` identity, same demand) produces an
 *   equal string and the `useMemo` in ProviderMount keeps the same array.
 * - `settings` comes from the store's pluginSettings map. A settings save
 *   does NOT reload bundles — the editor (PluginSettingsSection) and the
 *   display poll (useLiveConfig's settings diff) push a new map into the
 *   store, preserving object identity for plugins whose settings didn't
 *   change, so only the affected provider re-renders with a new prop.
 *
 * Memoized like BackgroundProviderLayer: ScreenRotator re-renders at least
 * once a minute (clock tick) and this layer must not churn provider effects.
 * The plugin-store subscriptions re-render it when a bundle registers.
 */
function PluginServiceLayer({ screens, rules }: PluginServiceLayerProps) {
  const plugins = usePluginStore((s) => s.plugins);
  const pluginSettings = usePluginStore((s) => s.pluginSettings);

  const providers = useMemo(() => {
    const out: { id: string; Provider: ComponentType<StateProviderProps> }[] = [];
    for (const entry of plugins.values()) {
      if (!entry.stateProvider) continue;
      out.push({ id: entry.manifest.id.toLowerCase(), Provider: entry.stateProvider });
    }
    // Stable mount order regardless of Map insertion order across reloads.
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }, [plugins]);

  const demandStrings = useMemo(() => {
    const map = new Map<string, string>();
    if (providers.length === 0) return map;
    const demanded = collectDemandedKeys(screens, rules);
    const byPlugin = demandByPlugin(demanded, providers.map((p) => p.id));
    for (const { id } of providers) {
      map.set(id, (byPlugin.get(id) ?? []).join('\n'));
    }
    return map;
  }, [screens, rules, providers]);

  if (providers.length === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
      }}
    >
      {providers.map(({ id, Provider }) => (
        <ProviderMount
          key={id}
          Provider={Provider}
          demandString={demandStrings.get(id) ?? ''}
          settings={pluginSettings.get(id) ?? EMPTY_SETTINGS}
        />
      ))}
    </div>
  );
}

/**
 * Rebuilds the keys array only when the joined demand string changes —
 * string equality short-circuits the useMemo, so an unrelated config edit
 * never hands the provider a new array identity.
 */
function ProviderMount({
  Provider,
  demandString,
  settings,
}: {
  Provider: ComponentType<StateProviderProps>;
  demandString: string;
  settings: Record<string, unknown>;
}) {
  const demandedKeys = useMemo(
    () => (demandString ? demandString.split('\n') : []),
    [demandString],
  );
  return <Provider demandedKeys={demandedKeys} settings={settings} />;
}

export default memo(PluginServiceLayer);
