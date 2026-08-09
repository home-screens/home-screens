'use client';

import { memo, useMemo } from 'react';
import type { Screen, GlobalSettings, ModuleInstance } from '@/types/config';
import { getModuleComponent } from '@/lib/module-components';
import { getLocation } from '@/lib/location';
import { usePluginStore } from '@/stores/plugin-store';
import { stableStringify } from '@/lib/stable-stringify';
import { buildModuleProps, toDisplaySource, type SharedDisplayData } from '@/lib/module-props';

interface BackgroundProviderLayerProps {
  /** ALL configured screens (pre-profile-filter) — a producer must run even
   *  when its home screen is rotated out or excluded by the active profile. */
  screens: Screen[];
  settings: GlobalSettings;
  sharedData: SharedDisplayData;
}

/**
 * Root-resident layer that keeps `backgroundProvider: true` module instances
 * mounted continuously, independent of which screen is showing.
 *
 * Why this exists: ScreenRotator unmounts off-screen modules, so a state
 * producer placed on a screen would go stale exactly when the display rotates
 * away — the documented anti-pattern of conflating "rendered" with "running".
 * Mounting producers here, as a sibling of ScreenRenderer inside the stable
 * outer div, decouples their data loop (and any `publishState` calls) from
 * rotation.
 *
 * Instances render through their normal module component so plugin
 * `pluginFetch` / `useFetchData` paths work unchanged; the layer is just
 * visually hidden. Duplicate producers (same type + config on several
 * screens) are deduped to a single mount — and the store's dedupe-on-equal
 * makes any residual double-publish harmless.
 *
 * Memoized: ScreenRotator re-renders at least once a minute (clock tick), so
 * this layer must not churn its providers' fetch loops on every parent render.
 * The memo blocks parent-driven re-renders, but plugin bundles register
 * asynchronously after first render without changing any of the memoized props,
 * so we subscribe to the plugin store's registration count directly — that
 * subscription re-renders this component when a plugin registers, letting a
 * plugin-only background provider finally resolve its component and mount.
 */
function BackgroundProviderLayer({ screens, settings, sharedData }: BackgroundProviderLayerProps) {
  // Re-render when a plugin registers so a plugin-only provider picks up its
  // now-available component (memoized props don't change on registration).
  usePluginStore((s) => s.plugins.size);

  const providers = useMemo(() => {
    const seen = new Set<string>();
    const result: ModuleInstance[] = [];
    for (const screen of screens) {
      for (const mod of screen.modules) {
        if (!mod.backgroundProvider || mod.enabled === false) continue;
        // JSON.stringify is key-order-sensitive, so two semantically identical
        // configs authored in different key orders would defeat dedupe and
        // double-mount a provider's fetch loop.
        const key = `${mod.type}:${stableStringify(mod.config)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(mod);
      }
    }
    return result;
  }, [screens]);

  if (providers.length === 0) return null;

  const source = toDisplaySource(settings, getLocation(settings), sharedData);

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
      {providers.map((mod) => {
        const Component = getModuleComponent(mod.type);
        // Plugin not yet loaded — nothing to run. The plugins.size subscription
        // above re-renders this layer once the bundle registers, at which point
        // getModuleComponent resolves and the provider mounts.
        if (!Component) return null;
        const extraProps = buildModuleProps(mod, source);
        return (
          <div key={mod.id} style={{ width: mod.size.w, height: mod.size.h }}>
            <Component config={mod.config} style={mod.style} {...extraProps} />
          </div>
        );
      })}
    </div>
  );
}

export default memo(BackgroundProviderLayer);
