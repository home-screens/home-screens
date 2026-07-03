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
  ModuleInstance,
  ModuleSchedule,
  ModuleVisibility,
  Profile,
  Screen,
  ScreenConfiguration,
  DisplayNode,
  VisibilityCondition,
} from '@/types/config';
import { SHARED_STATE_KEY_RE } from '@/lib/shared-state-types';

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
 * Sort a `(width, height)` pair so the canvas orientation matches the
 * rotation the user selected. Shared by the editor canvas and the server-side
 * per-display filter so the two can never drift — a mismatch produced an
 * "upside-down" canvas in an earlier release.
 */
export function orientDimensions(
  width: number,
  height: number,
  transform: 'normal' | '90' | '180' | '270' | undefined,
): { width: number; height: number } {
  const isPortrait = transform === '90' || transform === '270';
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return isPortrait
    ? { width: short, height: long }
    : { width: long, height: short };
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
 * Pick the effective screen list for a display. Always returns the display's
 * owned `screens` array — every display owns its own screens.
 *
 * Most modern code paths should only need to read this; the editor store
 * uses it as a single source of truth for "what is this display showing?".
 */
export function getDisplayScreens(display: DisplayNode): Screen[] {
  return display.screens;
}

/**
 * Pick the effective profile list for a display:
 *
 *   1. `display.profiles` — owned profiles, scoped to this display's screens (preferred)
 *   2. the full shared `pool` (or empty list if `pool` is undefined)
 *
 * Owned profiles are self-contained, so the shared pool is ignored for any
 * display that has its own list.
 */
export function getDisplayProfiles(
  display: DisplayNode,
  pool: Profile[] | undefined,
): Profile[] {
  return display.profiles ?? pool ?? [];
}

/**
 * Find a screen by ID across every place it might live: each display's
 * owned `screens` or the legacy global `config.screens` pool.
 * Server-side routes that only know a `screenId` (e.g. the background
 * rotation endpoint) need this because screens are no longer guaranteed
 * to live in `config.screens` once the user adopts multi-display mode.
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
      const owned = display.screens.find((s) => s.id === screenId);
      if (owned) return owned;
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

  const screens = getDisplayScreens(display);

  // Preserve `undefined` in the "nothing set anywhere" case so a legacy
  // config with no profiles anywhere still surfaces as
  // `FilteredDisplayConfig.profiles === undefined`, matching legacy
  // single-display behavior. UI callers that want an iterable should
  // use `getDisplayProfiles` which collapses to `[]`.
  const profiles =
    display.profiles ?? config.profiles;

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

  if (merged.displayWidth && merged.displayHeight) {
    const oriented = orientDimensions(merged.displayWidth, merged.displayHeight, merged.displayTransform);
    merged.displayWidth = oriented.width;
    merged.displayHeight = oriented.height;
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
 * live: the global profile pool and each `display.profiles[*].screenIds`
 * (owned-profiles mode).
 *
 * Takes a config that already has the screen removed from
 * `config.screens` / the active display's owned screens, and returns a
 * new config with the cascade applied. Always returns a new object; if
 * nothing changed, the returned object is shallow-equal to `config`.
 *
 * The `selectedDisplayId` argument chooses which display to scan for
 * owned-profile pruning. When it's `null` (legacy single-display mode),
 * no display-level pruning runs — only the global profile pool is touched.
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

  // When a specific display is selected in the editor and it owns its own
  // profile list, prune the deleted id from that display's owned profiles.
  if (next.displays && selectedDisplayId) {
    const updatedDisplays = next.displays.map((d) => {
      if (d.id !== selectedDisplayId || !d.profiles) return d;
      return {
        ...d,
        profiles: d.profiles.map((p) => ({
          ...p,
          screenIds: p.screenIds.filter((sid) => sid !== deletedScreenId),
        })),
      };
    });
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
  /** Global profile-id set for the activeProfile cross-reference check. */
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

function validateDisplayScreens(display: DisplayNode): string | null {
  if (display.screens.length > MAX_SCREENS_PER_DISPLAY) {
    return `Display "${display.id}" has too many screens: ${display.screens.length} (max ${MAX_SCREENS_PER_DISPLAY})`;
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
): DisplayProfilesResult {
  if (!display.profiles) {
    return { kind: 'ok', ownedProfileIds: null };
  }

  // Owned-profile validation: profiles are self-contained, so their
  // screenIds must resolve within this display's own screens (NOT the
  // global pool). IDs must be unique within the owned list.
  const ownedProfileIds = new Set<string>();
  const ownedScreenIds = new Set(display.screens.map((s) => s.id));
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
  return null;
}

/**
 * Validate a single `ModuleSchedule` value. Returns an error string when the
 * schedule is structurally malformed, or `null` when OK (including for an
 * `undefined` schedule, which means "always visible").
 *
 * `parseTime` in `schedule.ts` already silently rejects out-of-range values
 * at runtime, so a bad schedule won't crash anything — it just silently
 * misbehaves. Catching the same conditions at the config-write boundary
 * means a typo in the editor surfaces as a save error instead of a screen
 * that mysteriously never appears (or, worse, never disappears).
 *
 * Used by both `Screen.schedule` and `ModuleInstance.schedule` so the two
 * surfaces can't drift in what they accept.
 */
export function validateModuleSchedule(
  schedule: ModuleSchedule | undefined,
  context: string,
): string | null {
  if (!schedule) return null;

  if (schedule.daysOfWeek !== undefined) {
    if (!Array.isArray(schedule.daysOfWeek)) {
      return `${context}: schedule.daysOfWeek must be an array`;
    }
    for (const day of schedule.daysOfWeek) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return `${context}: schedule.daysOfWeek values must be integers 0–6 (got ${day})`;
      }
    }
  }

  for (const field of ['startTime', 'endTime'] as const) {
    const value = schedule[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
      return `${context}: schedule.${field} must be "HH:MM" (got ${JSON.stringify(value)})`;
    }
    const [h, m] = value.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return `${context}: schedule.${field} hours must be 0–23 and minutes 0–59 (got "${value}")`;
    }
  }

  return null;
}

/** Max nesting depth for and/or/not visibility-condition groups. */
export const MAX_CONDITION_DEPTH = 5;

/** Max total conditions (leaves + groups) per module, to bound evaluation cost. */
export const MAX_CONDITIONS_PER_MODULE = 32;

const CONDITION_KINDS = new Set(['state', 'numeric', 'and', 'or', 'not']);

function isStringOrStringArray(value: unknown): boolean {
  return typeof value === 'string'
    || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

/**
 * Validate a single `ModuleVisibility` value at the config-write boundary.
 * The runtime evaluator (`evaluateVisibility`) degrades quietly on bad input
 * (a broken condition just hides the module), so — like schedules — catching
 * malformed conditions here surfaces a save error instead of a module that
 * mysteriously never appears.
 *
 * Returns an error string when malformed, or `null` when OK (including for
 * an `undefined` visibility, which means "always visible").
 */
export function validateModuleVisibility(
  visibility: ModuleVisibility | undefined,
  context: string,
): string | null {
  if (!visibility) return null;

  if (!Array.isArray(visibility.conditions)) {
    return `${context}: visibility.conditions must be an array`;
  }
  if (visibility.whenUnknown !== undefined
    && visibility.whenUnknown !== 'hide' && visibility.whenUnknown !== 'show') {
    return `${context}: visibility.whenUnknown must be "hide" or "show" (got ${JSON.stringify(visibility.whenUnknown)})`;
  }

  let count = 0;
  const checkCondition = (condition: VisibilityCondition, depth: number): string | null => {
    if (!condition || typeof condition !== 'object') {
      return `${context}: visibility condition must be an object`;
    }
    if (!CONDITION_KINDS.has(condition.kind)) {
      return `${context}: unknown visibility condition kind ${JSON.stringify((condition as { kind?: unknown }).kind)}`;
    }
    if (++count > MAX_CONDITIONS_PER_MODULE) {
      return `${context}: too many visibility conditions (max ${MAX_CONDITIONS_PER_MODULE} per module)`;
    }

    if (condition.kind === 'and' || condition.kind === 'or' || condition.kind === 'not') {
      if (depth >= MAX_CONDITION_DEPTH) {
        return `${context}: visibility conditions nested too deeply (max ${MAX_CONDITION_DEPTH})`;
      }
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        return `${context}: "${condition.kind}" condition must have a non-empty conditions array`;
      }
      for (const child of condition.conditions) {
        const err = checkCondition(child, depth + 1);
        if (err) return err;
      }
      return null;
    }

    if (typeof condition.sourceKey !== 'string' || !SHARED_STATE_KEY_RE.test(condition.sourceKey)) {
      return `${context}: visibility sourceKey must match ${SHARED_STATE_KEY_RE} (got ${JSON.stringify(condition.sourceKey)})`;
    }

    if (condition.kind === 'state') {
      for (const field of ['equals', 'notEquals'] as const) {
        const value = condition[field];
        if (value !== undefined && !isStringOrStringArray(value)) {
          return `${context}: visibility ${field} must be a string or string array`;
        }
      }
    } else {
      for (const field of ['above', 'below'] as const) {
        const value = condition[field];
        if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
          return `${context}: visibility ${field} must be a finite number`;
        }
      }
    }
    return null;
  };

  for (const condition of visibility.conditions) {
    const err = checkCondition(condition, 1);
    if (err) return err;
  }
  return null;
}

/**
 * Walk every screen and every module on every screen in a config and validate
 * each schedule AND each module's visibility conditions (the two module-gating
 * surfaces share one walk so neither can sneak past the write gate). Covers
 * both single-display mode (config.screens) and multi-display mode (each
 * display.screens).
 *
 * Returns the first error encountered, or `null` when everything validates.
 */
export function validateAllSchedules(config: ScreenConfiguration): string | null {
  const checkScreen = (screen: Screen, where: string): string | null => {
    const screenError = validateModuleSchedule(screen.schedule, `${where} screen "${screen.id}"`);
    if (screenError) return screenError;
    for (const mod of screen.modules ?? []) {
      const modContext = `${where} screen "${screen.id}" module "${mod.id}"`;
      const modError = validateModuleSchedule((mod as ModuleInstance).schedule, modContext);
      if (modError) return modError;
      const visibilityError = validateModuleVisibility((mod as ModuleInstance).visibility, modContext);
      if (visibilityError) return visibilityError;
    }
    return null;
  };

  for (const screen of config.screens ?? []) {
    const err = checkScreen(screen, 'config');
    if (err) return err;
  }

  for (const display of config.displays ?? []) {
    for (const screen of display.screens ?? []) {
      const err = checkScreen(screen, `display "${display.id}"`);
      if (err) return err;
    }
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
 * - Each display must own a `screens` array (zero screens is allowed — an empty
 *   list just renders "no screens configured")
 * - Each display.screens is at most 256 entries
 * - Owned screens are self-contained and validated separately
 * - `activeProfile`, when set, must reference an existing profile
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
    globalProfileIds: new Set((config.profiles ?? []).map((p) => p.id)),
  };
  const seen = new Set<string>();

  for (const display of displays) {
    const idError = validateDisplayId(display, seen);
    if (idError) return idError;

    const screensError = validateDisplayScreens(display);
    if (screensError) return screensError;

    const profileResult = validateDisplayProfiles(display);
    if (profileResult.kind === 'error') return profileResult.message;

    const activeError = validateDisplayActiveProfile(display, ctx, profileResult.ownedProfileIds);
    if (activeError) return activeError;

    const dimError = validateDisplayDimensions(display);
    if (dimError) return dimError;
  }

  return null;
}
