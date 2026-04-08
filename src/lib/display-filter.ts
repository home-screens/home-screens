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
  DisplayNode,
} from '@/types/config';

interface FilteredDisplayConfig {
  screens: Screen[];
  profiles?: Profile[];
  settings: GlobalSettings;
  /** Per-display active profile (falls back to settings.activeProfile when undefined) */
  activeProfile?: string;
}

/**
 * Pick the effective screen list for a display:
 *
 *   1. `display.screens` — owned screens, designed at this display's resolution (preferred)
 *   2. `display.screenIds` over `config.screens` — legacy shared-pool references
 *   3. empty list
 *
 * Most modern code paths should only need to read this; the editor store
 * uses it as a single source of truth for "what is this display showing?".
 */
export function getDisplayScreens(
  display: DisplayNode,
  pool: Screen[],
): Screen[] {
  if (display.screens) return display.screens;
  if (display.screenIds) {
    const set = new Set(display.screenIds);
    return pool.filter((s) => set.has(s.id));
  }
  return [];
}

/**
 * Find a screen by ID across every place it might live: each display's
 * owned `screens`, the legacy global `config.screens` pool, or both.
 * Server-side routes that only know a `screenId` (e.g. the background
 * rotation endpoint) need this because screens are no longer guaranteed
 * to live in `config.screens` once the user adopts owned-screens displays.
 *
 * Returns `null` when the screen can't be found anywhere.
 */
export function findScreenById(
  config: ScreenConfiguration,
  screenId: string,
): Screen | null {
  // Check owned screens first — they take precedence over the legacy
  // pool for any display that has migrated.
  if (config.displays) {
    for (const display of config.displays) {
      if (display.screens) {
        const owned = display.screens.find((s) => s.id === screenId);
        if (owned) return owned;
      }
    }
  }
  // Fall through to the legacy global pool.
  const pooled = config.screens.find((s) => s.id === screenId);
  return pooled ?? null;
}

/**
 * Filter a config to the screens, profiles, and settings that apply to a
 * single named display. Returns `null` if the display is not registered.
 *
 * Settings overrides are shallow-merged ({ ...global, ...perDisplay }) so
 * nested objects (sleep, screensaver) are full-replacement, not deep-merged.
 * This is intentional — partial sleep overrides would create surprising
 * fallback chains. Override the whole object or omit it.
 *
 * Per-display `displayWidth`/`displayHeight`/`displayTransform` fields on
 * the `DisplayNode` itself override the global equivalents so the rotator
 * renders at the right canvas size.
 */
export function filterConfigForDisplay(
  config: ScreenConfiguration,
  displayId: string,
): FilteredDisplayConfig | null {
  const display = config.displays?.find((d) => d.id === displayId);
  if (!display) return null;

  const screens = getDisplayScreens(display, config.screens);

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
    // Top-level DisplayNode dimension fields override the nested settings
    // so the rotator's canvas matches the physical display.
    ...(display.displayWidth != null ? { displayWidth: display.displayWidth } : {}),
    ...(display.displayHeight != null ? { displayHeight: display.displayHeight } : {}),
    ...(display.displayTransform != null ? { displayTransform: display.displayTransform } : {}),
  };

  // Rotation is authoritative for orientation: sort the (width, height) pair
  // so the canvas long edge points along the landscape axis when the rotation
  // is normal/180 and along the portrait axis when it's 90/270, regardless of
  // how the user typed them into the form.
  const rawW = merged.displayWidth;
  const rawH = merged.displayHeight;
  if (rawW && rawH) {
    const isPortrait = merged.displayTransform === '90' || merged.displayTransform === '270';
    const long = Math.max(rawW, rawH);
    const short = Math.min(rawW, rawH);
    merged.displayWidth = isPortrait ? short : long;
    merged.displayHeight = isPortrait ? long : short;
  }

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
 * - Each display must provide either owned `screens` or legacy `screenIds`
 *   (zero screens is allowed — an empty list just renders "no screens configured")
 * - Each display.screens / screenIds is at most 256 entries
 * - Every legacy `screenIds` entry must reference an existing global screen
 * - Owned screens are self-contained and validated separately
 * - Every `profileIds` entry must reference an existing profile
 * - `activeProfile`, when set, must reference an existing profile AND
 *   (when `profileIds` is set) be a member of `profileIds`
 * - Per-display dimensions, when set, must be positive integers
 */
export function validateDisplays(config: ScreenConfiguration): string | null {
  const displays = config.displays;
  if (!displays || displays.length === 0) return null;

  if (displays.length > MAX_DISPLAYS) {
    return `Too many displays: ${displays.length} (max ${MAX_DISPLAYS})`;
  }

  const globalScreenIds = new Set(config.screens.map((s) => s.id));
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

    // Screen count caps apply to whichever form is in use.
    if (display.screens && display.screens.length > MAX_SCREENS_PER_DISPLAY) {
      return `Display "${display.id}" has too many screens: ${display.screens.length} (max ${MAX_SCREENS_PER_DISPLAY})`;
    }
    if (display.screenIds && display.screenIds.length > MAX_SCREENS_PER_DISPLAY) {
      return `Display "${display.id}" has too many screens: ${display.screenIds.length} (max ${MAX_SCREENS_PER_DISPLAY})`;
    }

    // Legacy screenIds must resolve to real global screens; owned `screens`
    // are self-contained and have already been sanitized by the editor store.
    if (display.screenIds && !display.screens) {
      for (const sid of display.screenIds) {
        if (!globalScreenIds.has(sid)) {
          return `Display "${display.id}" references unknown screen "${sid}"`;
        }
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

    // Per-display dimensions must be positive integers if set.
    for (const field of ['displayWidth', 'displayHeight'] as const) {
      const value = display[field];
      if (value != null && (!Number.isInteger(value) || value <= 0 || value > 16384)) {
        return `Display "${display.id}" ${field} must be a positive integer ≤ 16384`;
      }
    }
  }

  return null;
}
