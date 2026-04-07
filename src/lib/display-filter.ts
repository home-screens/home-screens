/**
 * Pure helpers that filter a `ScreenConfiguration` for a specific display.
 *
 * The same filtering logic must run on both the server (in the per-display
 * route's server component) and the client (inside `useLiveConfig` after each
 * config poll). Both call into this single source of truth so they cannot
 * drift — a display showing the wrong screens because the two filters
 * disagreed would be very hard to debug.
 */

import type {
  GlobalSettings,
  Profile,
  Screen,
  ScreenConfiguration,
} from '@/types/config';

interface FilteredDisplayConfig {
  screens: Screen[];
  profiles?: Profile[];
  settings: GlobalSettings;
  /** Per-display active profile (falls back to settings.activeProfile when undefined) */
  activeProfile?: string;
}

/**
 * Filter a config to the screens, profiles, and settings that apply to a
 * single named display. Returns `null` if the display is not registered.
 *
 * Settings overrides are shallow-merged ({ ...global, ...perDisplay }) so
 * nested objects (sleep, screensaver) are full-replacement, not deep-merged.
 * This is intentional — partial sleep overrides would create surprising
 * fallback chains. Override the whole object or omit it.
 */
export function filterConfigForDisplay(
  config: ScreenConfiguration,
  displayId: string,
): FilteredDisplayConfig | null {
  const display = config.displays?.find((d) => d.id === displayId);
  if (!display) return null;

  const screenIdSet = new Set(display.screenIds);
  const screens = config.screens.filter((s) => screenIdSet.has(s.id));

  let profiles = config.profiles;
  if (display.profileIds) {
    const profileIdSet = new Set(display.profileIds);
    profiles = config.profiles?.filter((p) => profileIdSet.has(p.id));
  }

  // Merge per-display settings over global settings. Per-display values win.
  // We thread the per-display activeProfile through `settings.activeProfile`
  // so all the existing rotator/profile-resolution code keeps working unchanged.
  const merged: GlobalSettings = {
    ...config.settings,
    ...(display.settings ?? {}),
  };
  if (display.activeProfile !== undefined) {
    merged.activeProfile = display.activeProfile;
  }

  return {
    screens,
    profiles,
    settings: merged,
    activeProfile: display.activeProfile,
  };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_DISPLAY_ID_LEN = 64;
const MAX_DISPLAYS = 64;
const MAX_SCREENS_PER_DISPLAY = 256;

/**
 * Validate the `displays` registry on a config before it is written to disk.
 * Returns a human-readable error string when invalid, or `null` when OK.
 *
 * Rules:
 * - Each `id` must be a URL-safe slug (lowercase, digits, hyphens, leading alnum)
 *   and ≤ 64 characters (mirrors the in-memory map's `MAX_KNOWN_DISPLAYS` keying)
 * - IDs must be unique
 * - At most 64 displays per config (the broadcast loop iterates them — caps cost)
 * - Each display.screenIds is at most 256 entries
 * - Every `screenIds` entry must reference an existing screen
 * - Every `profileIds` entry must reference an existing profile
 * - `activeProfile`, when set, must reference an existing profile AND
 *   (when `profileIds` is set) be a member of `profileIds`
 */
export function validateDisplays(config: ScreenConfiguration): string | null {
  const displays = config.displays;
  if (!displays || displays.length === 0) return null;

  if (displays.length > MAX_DISPLAYS) {
    return `Too many displays: ${displays.length} (max ${MAX_DISPLAYS})`;
  }

  const screenIds = new Set(config.screens.map((s) => s.id));
  const profileIds = new Set((config.profiles ?? []).map((p) => p.id));
  const seen = new Set<string>();

  for (const display of displays) {
    if (!display.id || !SLUG_RE.test(display.id) || display.id.length > MAX_DISPLAY_ID_LEN) {
      return `Invalid display id "${display.id}": must be lowercase letters, digits, and hyphens (e.g. "kitchen", "bedroom-tv"), max ${MAX_DISPLAY_ID_LEN} chars`;
    }
    if (seen.has(display.id)) {
      return `Duplicate display id "${display.id}"`;
    }
    seen.add(display.id);

    if (display.screenIds.length > MAX_SCREENS_PER_DISPLAY) {
      return `Display "${display.id}" has too many screens: ${display.screenIds.length} (max ${MAX_SCREENS_PER_DISPLAY})`;
    }
    for (const sid of display.screenIds) {
      if (!screenIds.has(sid)) {
        return `Display "${display.id}" references unknown screen "${sid}"`;
      }
    }

    if (display.profileIds) {
      for (const pid of display.profileIds) {
        if (!profileIds.has(pid)) {
          return `Display "${display.id}" references unknown profile "${pid}"`;
        }
      }
    }

    if (display.activeProfile) {
      if (!profileIds.has(display.activeProfile)) {
        return `Display "${display.id}" has unknown activeProfile "${display.activeProfile}"`;
      }
      // When profileIds restricts the display, activeProfile must be in that set —
      // otherwise the merged settings select a profile the filtered list won't contain.
      if (display.profileIds && !display.profileIds.includes(display.activeProfile)) {
        return `Display "${display.id}" activeProfile "${display.activeProfile}" is not in its profileIds list`;
      }
    }
  }

  return null;
}
