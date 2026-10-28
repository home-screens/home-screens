import type { ModuleInstance, Screen } from '@/types/config';

export interface PinnedModule {
  mod: ModuleInstance;
  /** The screen the module is placed on in the editor. */
  screenId: string;
}

/** Drawn by the display's pinned layer rather than by its home screen. */
export function isPinnedModule(mod: Pick<ModuleInstance, 'showOnEveryScreen' | 'backgroundProvider'>): boolean {
  return mod.showOnEveryScreen === true && !mod.backgroundProvider;
}

/**
 * The modules a display draws on every screen: every `showOnEveryScreen`
 * instance on a screen that is switched on, in screen order and then by
 * stacking order. The home screen being out of the rotation (profile,
 * schedule, conditions) does not matter, only its on/off switch does. The
 * wall's PinnedModuleLayer mounts this list; the editor canvas draws the same
 * list as ghosts.
 */
export function collectPinnedModules(screens: readonly Pick<Screen, 'id' | 'enabled' | 'modules'>[]): PinnedModule[] {
  const out: PinnedModule[] = [];
  for (const screen of screens) {
    if (screen.enabled === false) continue;
    for (const mod of screen.modules) {
      if (isPinnedModule(mod)) out.push({ mod, screenId: screen.id });
    }
  }
  return out.sort((a, b) => a.mod.zIndex - b.mod.zIndex);
}
