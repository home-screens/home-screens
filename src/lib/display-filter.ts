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
 * Canonical id for the primary/main display. The first display a user adds is
 * always created with this id by `addDisplay`, and the legacy single-display
 * redirect prefers this id when present. Importing this constant instead of
 * hard-coding `'main'` prevents the invariant from eroding across the
 * codebase — previous audits found 14 scattered literal comparisons.
 */
export const MAIN_DISPLAY_ID = 'main';

/** True when the given id is the canonical main display id. */
export function isMainDisplay(id: string | undefined | null): boolean {
  return id === MAIN_DISPLAY_ID;
}

/**
 * Find the main display in a list, preferring the canonical `main` id and
 * falling back to the first registered display. Returns `undefined` when
 * the list is empty. Used by the legacy single-display redirect and by any
 * UI that needs a "default display" when no specific id is in scope.
 */
export function findMainDisplay(displays: DisplayNode[] | undefined): DisplayNode | undefined {
  if (!displays || displays.length === 0) return undefined;
  return displays.find((d) => d.id === MAIN_DISPLAY_ID) ?? displays[0];
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
 * Internal precedence resolver. Preserves `undefined` in the "nothing
 * set anywhere" case so `filterConfigForDisplay` can keep a legacy
 * signal — the exported `getDisplayProfiles` wraps this with `?? []`
 * for UI callers that always want an iterable.
 */
function resolveDisplayProfiles(
  display: DisplayNode,
  pool: Profile[] | undefined,
): Profile[] | undefined {
  if (display.profiles) return display.profiles;
  if (display.profileIds) {
    const set = new Set(display.profileIds);
    return pool?.filter((p) => set.has(p.id));
  }
  return pool;
}

/**
 * Pick the effective profile list for a display:
 *
 *   1. `display.profiles` — owned profiles, scoped to this display's screens (preferred)
 *   2. `display.profileIds` over `pool` — legacy shared-pool references
 *   3. the full `pool` (or empty list if `pool` is undefined)
 *
 * Owned profiles win over `profileIds` for the same reason owned screens win
 * over `screenIds`: a display that has migrated to owned profiles is
 * self-contained and the shared-pool list is no longer relevant to it.
 */
export function getDisplayProfiles(
  display: DisplayNode,
  pool: Profile[] | undefined,
): Profile[] {
  return resolveDisplayProfiles(display, pool) ?? [];
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

  // Use the undefined-preserving resolver so a legacy config with no
  // profiles anywhere still surfaces as `FilteredDisplayConfig.profiles
  // === undefined`, matching legacy single-display behavior. The
  // exported `getDisplayProfiles` collapses that to `[]` for UI callers
  // that always want an iterable.
  const profiles = resolveDisplayProfiles(display, config.profiles);

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

/**
 * Remove every reference to a deleted screen id across every place it can
 * live: the global profile pool, each `display.screenIds` (legacy shared-pool
 * mode), and each `display.profiles[*].screenIds` (owned-profiles mode).
 *
 * Takes a config that already has the screen removed from
 * `config.screens` / the active display's owned screens, and returns a
 * new config with the cascade applied. Always returns a new object; if
 * nothing changed, the returned object is shallow-equal to `config`.
 *
 * The `selectedDisplayId` argument chooses which display to scan for
 * owned-profile pruning. When it's `null` (legacy single-display mode),
 * the shared-pool cascade runs across every display instead.
 */
export function pruneDanglingScreenRefs(
  config: ScreenConfiguration,
  deletedScreenId: string,
  selectedDisplayId: string | null,
): ScreenConfiguration {
  let next = config;

  // Global profile pool — profiles are shared across displays and may
  // reference owned-screen ids from any display.
  if (next.profiles) {
    const prunedProfiles = next.profiles.map((p) => ({
      ...p,
      screenIds: p.screenIds.filter((sid) => sid !== deletedScreenId),
    }));
    next = { ...next, profiles: prunedProfiles };
  }

  // Display-level cascade has two branches:
  //   1. Multi-display with a selected display that OWNS its profiles —
  //      prune the deleted id from its owned profiles only.
  //   2. Legacy (no selected display) — prune the deleted id from every
  //      display's shared-pool `screenIds` list.
  if (next.displays) {
    const updatedDisplays = selectedDisplayId
      ? next.displays.map((d) => {
          if (d.id !== selectedDisplayId || !d.profiles) return d;
          return {
            ...d,
            profiles: d.profiles.map((p) => ({
              ...p,
              screenIds: p.screenIds.filter((sid) => sid !== deletedScreenId),
            })),
          };
        })
      : next.displays.map((d) => ({
          ...d,
          ...(d.screenIds ? { screenIds: d.screenIds.filter((sid) => sid !== deletedScreenId) } : {}),
        }));
    next = { ...next, displays: updatedDisplays };
  }

  return next;
}

/**
 * URL-safe slug rule for display IDs. Exported so in-memory maps
 * (`display-commands.ts`), API routes, and client-side form validators can
 * reject the same inputs the config validator rejects — previous audits
 * found this regex duplicated in 4 places with "kept in lockstep" comments.
 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Hard upper bound on a display ID length. */
export const MAX_DISPLAY_ID_LEN = 64;

/**
 * Hard upper bound on per-display canvas dimensions. 16384 is well past
 * any plausible physical display and matches the WebGL / browser texture
 * limits on commodity hardware, so any value beyond this is almost
 * certainly a typo. Exported so the form validators and the config
 * validator agree on the cap.
 */
export const MAX_DISPLAY_DIMENSION = 16384;

const MAX_DISPLAYS = 64;
const MAX_SCREENS_PER_DISPLAY = 256;

/**
 * True when `id` is a non-empty, URL-safe slug within the length cap.
 * Shared by both the in-memory command queues and the config validator
 * so a display ID rejected at one layer is rejected at every layer.
 */
export function isValidDisplayId(id: string | undefined | null): boolean {
  if (!id) return false;
  return id.length <= MAX_DISPLAY_ID_LEN && SLUG_RE.test(id);
}

/** Context shared between per-display sub-validators. */
interface DisplayValidationCtx {
  /** Global screen-id set for legacy `screenIds` checks. */
  globalScreenIds: Set<string>;
  /** Global profile-id set for legacy `profileIds` / activeProfile checks. */
  globalProfileIds: Set<string>;
}

function validateDisplayId(display: DisplayNode, seen: Set<string>): string | null {
  if (!isValidDisplayId(display.id)) {
    return `Invalid display id "${display.id}": must be lowercase letters, digits, and hyphens (e.g. "kitchen", "bedroom-tv"), max ${MAX_DISPLAY_ID_LEN} chars`;
  }
  if (seen.has(display.id)) {
    return `Duplicate display id "${display.id}"`;
  }
  seen.add(display.id);
  return null;
}

function validateDisplayScreens(display: DisplayNode, ctx: DisplayValidationCtx): string | null {
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
      if (!ctx.globalScreenIds.has(sid)) {
        return `Display "${display.id}" references unknown screen "${sid}"`;
      }
    }
  }
  return null;
}

type DisplayProfilesResult =
  | { kind: 'error'; message: string }
  | { kind: 'ok'; ownedProfileIds: Set<string> | null };

/**
 * Validate a display's profiles. Returns either an error message or the
 * owned-profile id set (non-null only when `display.profiles` is set).
 * The id set is threaded to `validateDisplayActiveProfile` below so the
 * activeProfile check doesn't have to re-derive it.
 */
function validateDisplayProfiles(
  display: DisplayNode,
  ctx: DisplayValidationCtx,
): DisplayProfilesResult {
  // Owned profiles and the legacy `profileIds` reference are mutually
  // exclusive — a display either references the shared pool or owns its
  // own list, never both. Mirrors the owned-vs-`screenIds` rule.
  if (display.profiles && display.profileIds) {
    return { kind: 'error', message: `Display "${display.id}" sets both "profiles" and "profileIds" — pick one` };
  }

  if (display.profileIds) {
    for (const pid of display.profileIds) {
      if (!ctx.globalProfileIds.has(pid)) {
        return { kind: 'error', message: `Display "${display.id}" references unknown profile "${pid}"` };
      }
    }
  }

  if (!display.profiles) {
    return { kind: 'ok', ownedProfileIds: null };
  }

  // Owned-profile validation: profiles are self-contained, so their
  // screenIds must resolve within this display's own screens (NOT the
  // global pool). IDs must be unique within the owned list.
  const ownedProfileIds = new Set<string>();
  const ownedScreenIds = new Set((display.screens ?? []).map((s) => s.id));
  for (const profile of display.profiles) {
    if (ownedProfileIds.has(profile.id)) {
      return { kind: 'error', message: `Display "${display.id}" has duplicate profile id "${profile.id}"` };
    }
    ownedProfileIds.add(profile.id);
    for (const sid of profile.screenIds) {
      if (!ownedScreenIds.has(sid)) {
        return { kind: 'error', message: `Display "${display.id}" profile "${profile.id}" references unknown screen "${sid}"` };
      }
    }
  }
  return { kind: 'ok', ownedProfileIds };
}

function validateDisplayActiveProfile(
  display: DisplayNode,
  ctx: DisplayValidationCtx,
  ownedProfileIds: Set<string> | null,
): string | null {
  if (!display.activeProfile) return null;

  // When the display owns profiles, activeProfile is resolved against the
  // owned list and the global pool is irrelevant.
  if (ownedProfileIds) {
    if (!ownedProfileIds.has(display.activeProfile)) {
      return `Display "${display.id}" has unknown activeProfile "${display.activeProfile}"`;
    }
    return null;
  }

  if (!ctx.globalProfileIds.has(display.activeProfile)) {
    return `Display "${display.id}" has unknown activeProfile "${display.activeProfile}"`;
  }
  // When profileIds restricts the display, activeProfile must be in that set —
  // otherwise the merged settings select a profile the filtered list won't contain.
  if (display.profileIds && !display.profileIds.includes(display.activeProfile)) {
    return `Display "${display.id}" activeProfile "${display.activeProfile}" is not in its profileIds list`;
  }
  return null;
}

function validateDisplayDimensions(display: DisplayNode): string | null {
  for (const field of ['displayWidth', 'displayHeight'] as const) {
    const value = display[field];
    if (value != null && (!Number.isInteger(value) || value <= 0 || value > MAX_DISPLAY_DIMENSION)) {
      return `Display "${display.id}" ${field} must be a positive integer ≤ ${MAX_DISPLAY_DIMENSION}`;
    }
  }
  return null;
}

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
 *
 * Internally this dispatches to a set of focused sub-validators so each
 * rule is readable on its own and individually testable. The top-level
 * function just sequences them per display and returns the first error.
 */
export function validateDisplays(config: ScreenConfiguration): string | null {
  const displays = config.displays;
  if (!displays || displays.length === 0) return null;

  if (displays.length > MAX_DISPLAYS) {
    return `Too many displays: ${displays.length} (max ${MAX_DISPLAYS})`;
  }

  const ctx: DisplayValidationCtx = {
    globalScreenIds: new Set(config.screens.map((s) => s.id)),
    globalProfileIds: new Set((config.profiles ?? []).map((p) => p.id)),
  };
  const seen = new Set<string>();

  for (const display of displays) {
    const idError = validateDisplayId(display, seen);
    if (idError) return idError;

    const screensError = validateDisplayScreens(display, ctx);
    if (screensError) return screensError;

    const profileResult = validateDisplayProfiles(display, ctx);
    if (profileResult.kind === 'error') return profileResult.message;

    const activeError = validateDisplayActiveProfile(display, ctx, profileResult.ownedProfileIds);
    if (activeError) return activeError;

    const dimError = validateDisplayDimensions(display);
    if (dimError) return dimError;
  }

  return null;
}
