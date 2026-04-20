import type {
  ScreenConfiguration,
  ModuleInstance,
  Screen,
  Profile,
  DisplayNode,
} from '@/types/config';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import {
  MAIN_DISPLAY_ID,
  orientDimensions,
  getDisplayScreens,
} from '@/lib/display-filter';

/**
 * Returns the screens the editor is currently operating on. In legacy
 * single-display mode (no `selectedDisplayId`) this is `config.screens`.
 * In multi-display mode it delegates to `getDisplayScreens` (the same
 * helper `filterConfigForDisplay` uses server-side) so the editor's
 * active view and the rotator's rendered view can never disagree about
 * what "this display's screens" means.
 */
export function getActiveScreens(
  config: ScreenConfiguration,
  selectedDisplayId: string | null,
): Screen[] {
  if (!selectedDisplayId) return config.screens;
  const display = config.displays?.find((d) => d.id === selectedDisplayId);
  if (!display) return config.screens;
  return getDisplayScreens(display);
}

/**
 * Returns a new `ScreenConfiguration` with the active screens replaced.
 * Sibling displays and the legacy global pool are untouched.
 */
export function withActiveScreens(
  config: ScreenConfiguration,
  selectedDisplayId: string | null,
  screens: Screen[],
): ScreenConfiguration {
  if (!selectedDisplayId) return { ...config, screens };
  const displays = config.displays;
  if (!displays) return { ...config, screens };
  const idx = displays.findIndex((d) => d.id === selectedDisplayId);
  if (idx === -1) return { ...config, screens };
  const nextDisplays = [...displays];
  nextDisplays[idx] = { ...nextDisplays[idx], screens };
  return { ...config, displays: nextDisplays };
}

/**
 * Returns the effective canvas dimensions for the editor. Per-display
 * dimensions win over global; this is what every editor component should
 * consume instead of reading `config.settings.displayWidth` directly.
 *
 * The rotation (`displayTransform`) is authoritative for orientation: the
 * canvas long edge goes along the landscape axis when transform is
 * `normal`/`180`, and along the portrait axis when transform is `90`/`270`.
 * We sort the raw `(width, height)` pair into the right order regardless
 * of how the user typed them in the form, so "1440 × 2560 + Normal
 * (landscape)" produces a 2560 × 1440 landscape canvas rather than a
 * portrait one whose shape contradicts its rotation label.
 */
export function getActiveDimensions(
  config: ScreenConfiguration,
  selectedDisplayId: string | null,
): { width: number; height: number } {
  let rawWidth: number;
  let rawHeight: number;
  let transform: 'normal' | '90' | '180' | '270' | undefined;

  if (selectedDisplayId) {
    const display = config.displays?.find((d) => d.id === selectedDisplayId);
    if (display) {
      rawWidth = display.displayWidth ?? config.settings.displayWidth ?? DEFAULT_DISPLAY_WIDTH;
      rawHeight = display.displayHeight ?? config.settings.displayHeight ?? DEFAULT_DISPLAY_HEIGHT;
      transform = display.displayTransform ?? config.settings.displayTransform;
    } else {
      rawWidth = config.settings.displayWidth || DEFAULT_DISPLAY_WIDTH;
      rawHeight = config.settings.displayHeight || DEFAULT_DISPLAY_HEIGHT;
      transform = config.settings.displayTransform;
    }
  } else {
    rawWidth = config.settings.displayWidth || DEFAULT_DISPLAY_WIDTH;
    rawHeight = config.settings.displayHeight || DEFAULT_DISPLAY_HEIGHT;
    transform = config.settings.displayTransform;
  }

  return orientDimensions(rawWidth, rawHeight, transform);
}

/**
 * Decide where a profile mutation should land.
 *
 * - `{ kind: 'display', idx, display }` means the selected display owns its
 *   profile list and the mutation should target `display.profiles`.
 * - `{ kind: 'global' }` means the mutation targets `config.profiles` and
 *   `config.settings.activeProfile`. This is the case for legacy single-
 *   display installs, for multi-display installs with a shared profile
 *   pool, and for any display whose `profiles` field is unset.
 *
 * Extracted so the five profile actions (addProfile, removeProfile,
 * updateProfile, reorderProfiles, setActiveProfile) can't drift.
 */
export type ProfileTarget =
  | { kind: 'display'; idx: number; display: DisplayNode }
  | { kind: 'global' };

export function resolveProfileTarget(
  config: ScreenConfiguration,
  selectedDisplayId: string | null,
): ProfileTarget {
  if (!selectedDisplayId || !config.displays) return { kind: 'global' };
  const idx = config.displays.findIndex((d) => d.id === selectedDisplayId);
  if (idx === -1) return { kind: 'global' };
  const display = config.displays[idx];
  if (!display.profiles) return { kind: 'global' };
  return { kind: 'display', idx, display };
}

export function updateModuleInConfig(
  config: ScreenConfiguration,
  selectedDisplayId: string | null,
  screenId: string,
  moduleId: string,
  updater: (mod: ModuleInstance) => ModuleInstance,
): ScreenConfiguration {
  const screens = getActiveScreens(config, selectedDisplayId).map((s) =>
    s.id === screenId
      ? { ...s, modules: s.modules.map((m) => (m.id === moduleId ? updater(m) : m)) }
      : s,
  );
  return withActiveScreens(config, selectedDisplayId, screens);
}

/**
 * When the first display added is NOT `main`, promote the pre-multi-display
 * global screens/profiles/dimensions into a sibling `main` display so the hub
 * kiosk keeps rendering what it rendered before the user turned multi-display
 * on. The legacy shared profile pool is deep-cloned — in multi-display mode
 * profiles are per-display.
 */
export function buildBootstrapMain(config: ScreenConfiguration): DisplayNode {
  return {
    id: MAIN_DISPLAY_ID,
    name: 'Main Display',
    screens: structuredClone(config.screens),
    profiles: structuredClone(config.profiles ?? []),
    ...(config.settings.activeProfile
      ? { activeProfile: config.settings.activeProfile }
      : {}),
    displayWidth: config.settings.displayWidth,
    displayHeight: config.settings.displayHeight,
    ...(config.settings.displayTransform
      ? { displayTransform: config.settings.displayTransform }
      : {}),
  };
}

/**
 * Assemble the DisplayNode for a brand-new display. `inheritFromGlobal` is
 * true only for the "add main as the very first display" bootstrap path —
 * that display then inherits the legacy global screens/profiles/activeProfile,
 * since there can only be one `main` and we can't seed a sibling.
 *
 * Everyone else starts with an empty screens list (fresh display designed at
 * its own resolution) and an empty profiles list.
 */
export function buildNewDisplay(
  display: { id: string; name: string } & Partial<Omit<DisplayNode, 'id' | 'name' | 'screens'>> & { screens?: Screen[] },
  config: ScreenConfiguration,
  inheritFromGlobal: boolean,
): DisplayNode {
  const initialProfiles: Profile[] = inheritFromGlobal
    ? structuredClone(config.profiles ?? [])
    : [];
  const inheritedActiveProfile = inheritFromGlobal
    ? config.settings.activeProfile
    : undefined;

  const screens: Screen[] = inheritFromGlobal
    ? structuredClone(config.screens)
    : display.screens ?? [];

  return {
    id: display.id,
    name: display.name,
    screens,
    profiles: initialProfiles,
    ...(display.displayWidth != null ? { displayWidth: display.displayWidth } : {}),
    ...(display.displayHeight != null ? { displayHeight: display.displayHeight } : {}),
    ...(display.displayTransform ? { displayTransform: display.displayTransform } : {}),
    ...(display.activeProfile
      ? { activeProfile: display.activeProfile }
      : inheritedActiveProfile
        ? { activeProfile: inheritedActiveProfile }
        : {}),
    ...(display.settings ? { settings: display.settings } : {}),
  };
}
