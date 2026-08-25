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
 * Map `visit` over every module in the config. Returns the `screens` and
 * `displays` fields to spread into the migrated config; untouched screens
 * and displays keep their identity so a migration that changes nothing is
 * a structural no-op.
 */
export function mapConfigModules(
  config: ScreenConfiguration,
  visit: (mod: Module) => Module,
): Pick<ScreenConfiguration, 'screens' | 'displays'> {
  const migrateScreen = (screen: Screen): Screen => {
    if (!Array.isArray(screen.modules)) return screen;
    let changed = false;
    const modules = screen.modules.map((mod) => {
      const next = visit(mod);
      if (next !== mod) changed = true;
      return next;
    });
    return changed ? { ...screen, modules } : screen;
  };

  return {
    screens: Array.isArray(config.screens) ? config.screens.map(migrateScreen) : config.screens,
    // Multi-display configs own their screens per display; the legacy
    // top-level `screens` array is still populated, so both must be walked.
    ...(Array.isArray(config.displays)
      ? {
          displays: config.displays.map((d) =>
            Array.isArray(d.screens) ? { ...d, screens: d.screens.map(migrateScreen) } : d,
          ),
        }
      : {}),
  };
}
