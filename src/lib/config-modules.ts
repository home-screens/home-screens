/**
 * The one walk over every module in a config: each module on the legacy
 * top-level `screens` and on every display's own `screens`.
 *
 * A config keeps screens in two places, and a walk written by hand that
 * visits only one of them is a fault that has shipped more than once (a
 * plugin's settings migrated on the first display and nowhere else). So
 * anything that rewrites, removes or looks for modules goes through here:
 * the schema migrations, the to-do fold, calendar and plugin clean-up, and
 * the repair of a hand-edited file.
 *
 * Malformed shapes pass through untouched rather than being normalised. A
 * hand-edited or v3-era node can be missing either array, or hold something
 * that is not a screen at all, and `updateConfigAtomic` does NOT catch
 * migration throws the way `readConfig` does: an unguarded `.map` would 500
 * every write path until someone fixed config.json by hand.
 *
 * Nothing is copied that did not change. A screen whose modules all came
 * back as they went in is the same object, and so is its array, its display
 * and, from the `rewrite*` functions, the config itself, which is what lets
 * `updateConfigAtomic` skip a write that would change nothing.
 */

import type { ScreenConfiguration, Screen, DisplayNode, ModuleInstance } from '@/types/config';

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
  /** The display whose screens hold the module; absent on the legacy array. */
  display?: DisplayNode;
}

type ScreenVisitor = (screen: Screen, site: 'legacy' | 'display', display: DisplayNode | undefined, index: number) => Screen;
type ModuleVisitor = (mod: ModuleInstance, site: ModuleSite) => ModuleInstance | null;

const isObject = (value: unknown): value is object => !!value && typeof value === 'object';

function hasLiveDisplays(config: ScreenConfiguration): boolean {
  return Array.isArray(config.displays) && config.displays.length > 0;
}

/** `list` with `visit` applied, or `list` itself when every item came back unchanged. */
function mapKeepingIdentity<T>(list: T[], visit: (item: T, index: number) => T): T[] {
  let changed = false;
  const next = list.map((item, index) => {
    const out = visit(item, index);
    if (out !== item) changed = true;
    return out;
  });
  return changed ? next : list;
}

/**
 * Map `visit` over every screen in the config. Returns the `screens` and
 * `displays` fields to spread into the config, which is the form a schema
 * migration wants (it sets other fields in the same literal). `displays` is
 * left out when the config has none.
 */
export function mapConfigScreens(
  config: ScreenConfiguration,
  visit: ScreenVisitor,
): Pick<ScreenConfiguration, 'screens' | 'displays'> {
  return {
    screens: Array.isArray(config.screens)
      ? mapKeepingIdentity(config.screens, (screen, index) => visit(screen, 'legacy', undefined, index))
      : config.screens,
    // Multi-display configs own their screens per display; the legacy
    // top-level `screens` array is still populated, so both must be walked.
    ...(Array.isArray(config.displays)
      ? {
          displays: mapKeepingIdentity(config.displays, (display) => {
            if (!isObject(display) || !Array.isArray(display.screens)) return display;
            const screens = mapKeepingIdentity(display.screens, (screen, index) => visit(screen, 'display', display, index));
            return screens === display.screens ? display : { ...display, screens };
          }),
        }
      : {}),
  };
}

/**
 * Map `visit` over every module in the config, in the same spreadable form
 * as `mapConfigScreens`. A visitor that returns `null` takes the module off
 * its screen.
 */
export function mapConfigModules(
  config: ScreenConfiguration,
  visit: ModuleVisitor,
): Pick<ScreenConfiguration, 'screens' | 'displays'> {
  const hasDisplays = hasLiveDisplays(config);
  return mapConfigScreens(config, (screen, site, display) => {
    if (!isObject(screen) || !Array.isArray(screen.modules)) return screen;
    let changed = false;
    const modules: ModuleInstance[] = [];
    for (const mod of screen.modules) {
      const next = visit(mod, { owner: site, live: site === 'display' || !hasDisplays, display });
      if (next !== mod) changed = true;
      if (next !== null) modules.push(next);
    }
    return changed ? { ...screen, modules } : screen;
  });
}

function withScreens(config: ScreenConfiguration, next: Pick<ScreenConfiguration, 'screens' | 'displays'>): ScreenConfiguration {
  const screensSame = next.screens === config.screens;
  const displaysSame = !('displays' in next) || next.displays === config.displays;
  if (screensSame && displaysSame) return config;
  return { ...config, ...(screensSame ? {} : { screens: next.screens }), ...(displaysSame ? {} : { displays: next.displays }) };
}

/** The config with `visit` applied to every screen, or `config` itself when nothing changed. */
export function rewriteConfigScreens(config: ScreenConfiguration, visit: ScreenVisitor): ScreenConfiguration {
  return withScreens(config, mapConfigScreens(config, visit));
}

/**
 * The config with `visit` applied to every module (`null` removes one), or
 * `config` itself when nothing changed.
 */
export function rewriteConfigModules(config: ScreenConfiguration, visit: ModuleVisitor): ScreenConfiguration {
  return withScreens(config, mapConfigModules(config, visit));
}

/** Call `visit` with every module in the config. For looking, or for a caller that edits a copy in place. */
export function forEachConfigModule(config: ScreenConfiguration, visit: (mod: ModuleInstance, site: ModuleSite) => void): void {
  mapConfigModules(config, (mod, site) => {
    visit(mod, site);
    return mod;
  });
}

/** True when any module in the config, on any screen pool, passes `test`. */
export function someConfigModule(config: ScreenConfiguration, test: (mod: ModuleInstance, site: ModuleSite) => boolean): boolean {
  let found = false;
  forEachConfigModule(config, (mod, site) => {
    if (!found && test(mod, site)) found = true;
  });
  return found;
}
