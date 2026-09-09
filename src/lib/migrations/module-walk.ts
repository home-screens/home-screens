/**
 * The one walk every module-level migration needs: visit each module on the
 * legacy top-level `screens` and on every display's own `screens`, replacing
 * a module only when the visitor returns something new.
 *
 * Malformed shapes pass through untouched rather than being normalised. A
 * hand-edited or v3-era node can be missing either array, and
 * `updateConfigAtomic` does NOT catch migration throws the way `readConfig`
 * does — an unguarded `.map` would 500 every write path until someone fixed
 * config.json by hand.
 */

import type { ScreenConfiguration, Screen } from '@/types/config';

type Module = Screen['modules'][number];

/**
 * Where a module was found. In multi-display mode the top-level `screens`
 * array is a frozen snapshot that no display renders (see
 * `getDisplayScreens`), so a migration that creates something per module
 * (rather than rewriting one in place) must not treat it as live.
 */
export interface ModuleSite {
  /** 'legacy' = the top-level `screens` array; 'display' = a display's own. */
  owner: 'legacy' | 'display';
  /** True when this module renders somewhere: always in legacy single-display mode. */
  live: boolean;
}

/**
 * Map `visit` over every module in the config. Returns the `screens` and
 * `displays` fields to spread into the migrated config; untouched screens
 * and displays keep their identity so a migration that changes nothing is
 * a structural no-op.
 */
export function mapConfigModules(
  config: ScreenConfiguration,
  visit: (mod: Module, site: ModuleSite) => Module,
): Pick<ScreenConfiguration, 'screens' | 'displays'> {
  const hasDisplays = Array.isArray(config.displays) && config.displays.length > 0;
  return mapConfigScreens(config, (screen, site) => {
    if (!Array.isArray(screen.modules)) return screen;
    let changed = false;
    const modules = screen.modules.map((mod) => {
      const next = visit(mod, { owner: site, live: site === 'display' || !hasDisplays });
      if (next !== mod) changed = true;
      return next;
    });
    return changed ? { ...screen, modules } : screen;
  });
}

/**
 * Map `migrateScreen` over every screen in the config, on the legacy
 * top-level `screens` and on every display's own `screens`. Same identity
 * rules as `mapConfigModules`.
 */
export function mapConfigScreens(
  config: ScreenConfiguration,
  migrateScreen: (screen: Screen, site: 'legacy' | 'display') => Screen,
): Pick<ScreenConfiguration, 'screens' | 'displays'> {
  return {
    screens: Array.isArray(config.screens) ? config.screens.map((s) => migrateScreen(s, 'legacy')) : config.screens,
    // Multi-display configs own their screens per display; the legacy
    // top-level `screens` array is still populated, so both must be walked.
    ...(Array.isArray(config.displays)
      ? {
          displays: config.displays.map((d) =>
            Array.isArray(d.screens) ? { ...d, screens: d.screens.map((s) => migrateScreen(s, 'display')) } : d,
          ),
        }
      : {}),
  };
}
