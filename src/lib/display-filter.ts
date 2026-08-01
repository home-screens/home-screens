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
  DisplayRule,
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
  /** Rules owned by this display (no global fallback — ownership mirrors screens). */
  rules?: DisplayRule[];
}

/**
 * Canonical id for the primary/main display.
 *
 * `addDisplay` guarantees a display with this id exists once the registry is
 * populated, but NOT that it is the display the user just added: adding a
 * first display called something else seeds a sibling `main` from the legacy
 * globals beside it, while adding `main` first lets that display inherit the
 * globals directly. Either way the user's chosen id is preserved.
 *
 * The legacy `/display` route resolves this id via `findMainDisplay` and
 * renders that display **inline**. There is deliberately no redirect —
 * Chromium `--app` mode opens a duplicate window when it follows a 307 with
 * an RSC body, and the two windows then drain the same command queue. See the
 * header comment in `app/(display)/display/page.tsx` before reintroducing one.
 *
 * Importing this constant instead of hard-coding `'main'` prevents the
 * invariant from eroding across the codebase — previous audits found 14
 * scattered literal comparisons.
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
 * the list is empty. Used by the legacy `/display` route, which renders the
 * result inline rather than redirecting to it, and by any UI that needs a
 * "default display" when no specific id is in scope.
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
 * Every screen the installation has, across every display.
 *
 * This is the reader for surfaces that ask "does a module of type X exist
 * anywhere?" — `/remote`, `/chores`, system stats, plugin config migration.
 * They are display-agnostic by nature, so they must not read `config.screens`
 * directly: once the user adds a display, `config.screens` becomes a frozen
 * snapshot that `withActiveScreens` deliberately never writes to again, and
 * every later edit lands on `config.displays[*].screens`.
 *
 * In multi-display mode this counts ONLY the per-display screens, never
 * `config.screens`, because `addDisplay` seeds the `main` display from the
 * globals at migration time — including both would double-count. This mirrors
 * `buildMultiDisplayBreakdown` in `telemetry.ts`, which made the same call for
 * the same reason.
 */
export function getAllScreens(config: ScreenConfiguration): Screen[] {
  const displays = config.displays;
  if (!displays || displays.length === 0) return config.screens;
  return displays.flatMap(getDisplayScreens);
}

/**
 * Every profile the installation has, across every display, de-duplicated by id.
 *
 * Companion to `getAllScreens` for the same display-agnostic surfaces. Uses
 * `getDisplayProfiles` per display so the owned → global precedence is applied
 * exactly once: displays that own a list contribute theirs, displays that do
 * not contribute the shared pool. De-duplication by id keeps the shared pool
 * from being counted once per display that inherits it.
 */
export function getAllProfiles(config: ScreenConfiguration): Profile[] {
  const displays = config.displays;
  if (!displays || displays.length === 0) return config.profiles ?? [];
  const byId = new Map<string, Profile>();
  for (const display of displays) {
    for (const profile of getDisplayProfiles(display, config.profiles)) {
      if (!byId.has(profile.id)) byId.set(profile.id, profile);
    }
  }
  return [...byId.values()];
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
 * Resolve the active profile id for the given display (or the legacy
 * single-display config when `displayId` is null). Mirrors the ownership
 * rule of `getDisplayProfiles`: a display that owns its `profiles` list
 * also owns `activeProfile`; otherwise the global
 * `settings.activeProfile` applies.
 */
export function getActiveProfileId(
  config: ScreenConfiguration,
  displayId: string | null | undefined,
): string | undefined {
  const display = displayId ? config.displays?.find((d) => d.id === displayId) : undefined;
  return display?.profiles ? display.activeProfile : config.settings.activeProfile;
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

  // Mirror `getActiveProfileId`'s ownership rule so the display-rendering
  // path and the editor UI can never disagree: a display that OWNS a
  // `profiles` array also owns `activeProfile` — set it explicitly (even to
  // `undefined`, meaning "none active") so the global `settings.activeProfile`
  // spread in above never leaks into an owning display. A display WITHOUT its
  // own profiles keeps inheriting the global, only overridden by an explicit
  // per-display value.
  if (display.profiles) {
    merged.activeProfile = display.activeProfile;
  } else if (display.activeProfile !== undefined) {
    merged.activeProfile = display.activeProfile;
  }

  return {
    screens,
    profiles,
    settings: merged,
    activeProfile: display.activeProfile,
    rules: display.rules,
  };
}

/**
 * Remove every reference to a deleted screen id across every place it can
 * live: the legacy global profile pool, each `display.profiles[*].screenIds`
 * (owned-profiles mode, self-contained per display), and any display rule
 * whose `showScreen` action targets the deleted screen (the target is
 * blanked, which turns the rule into a saveable never-fires "incomplete"
 * rule rather than deleting the user's conditions with it).
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

  // The global `config.profiles` pool is the LEGACY single-display pool: its
  // `screenIds` reference `config.screens`, so it is pruned unconditionally
  // regardless of which display is selected. It is not a cross-display
  // mechanism — owned profiles are self-contained and are pruned separately
  // below. `validateDisplayProfiles` rejects an owned profile that reaches
  // into the global pool.
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

  // Blank rule targets pointing at the deleted screen — legacy list plus the
  // selected display's owned rules (a screen belongs to exactly one display,
  // so no other display's rules can reference it).
  const blankRuleTargets = (rules: DisplayRule[] | undefined): DisplayRule[] | undefined =>
    rules?.map((r) =>
      r.action.kind === 'showScreen' && r.action.screenId === deletedScreenId
        ? { ...r, action: { ...r.action, screenId: '' } }
        : r,
    );

  if (next.rules?.some((r) => r.action.kind === 'showScreen' && r.action.screenId === deletedScreenId)) {
    next = { ...next, rules: blankRuleTargets(next.rules) };
  }
  if (next.displays && selectedDisplayId) {
    const updatedDisplays = next.displays.map((d) =>
      d.id === selectedDisplayId && d.rules ? { ...d, rules: blankRuleTargets(d.rules) } : d,
    );
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
const MAX_DISPLAY_ID_LEN = 64;

/**
 * IDs a display may never claim, because the command layer already gives
 * them a meaning. `all` is the broadcast keyword in `enqueueCommand`
 * (`display-commands.ts`), so a display actually named `all` would turn
 * every command aimed at that one screen into a whole-house broadcast — a
 * `display-control` button meant to sleep the kitchen would sleep the
 * entire home.
 *
 * `__default__` (the legacy single-display queue key) cannot reach here —
 * `SLUG_RE` already rejects a leading underscore — but it is listed so the
 * reserved set is the complete answer to "which IDs are spoken for?" rather
 * than a partial one that relies on the slug rule staying as strict as it
 * is today.
 */
export const RESERVED_DISPLAY_IDS: ReadonlySet<string> = new Set(['all', '__default__']);

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
 * True when `id` is a non-empty, URL-safe slug within the length cap and is
 * not one of the reserved IDs. Shared by both the in-memory command queues
 * and the config validator so a display ID rejected at one layer is rejected
 * at every layer.
 *
 * Note that `enqueueCommand` tests for the broadcast keyword `all` *before*
 * calling this, so broadcasting still works; every other caller treats its
 * argument as one specific display, which `all` never is.
 */
export function isValidDisplayId(id: string | undefined | null): boolean {
  if (!id) return false;
  if (RESERVED_DISPLAY_IDS.has(id)) return false;
  return id.length <= MAX_DISPLAY_ID_LEN && SLUG_RE.test(id);
}

/** Context shared between per-display sub-validators. */
interface DisplayValidationCtx {
  /** Global profile-id set for the activeProfile cross-reference check. */
  globalProfileIds: Set<string>;
}

function validateDisplayId(display: DisplayNode, seen: Set<string>): string | null {
  // Checked ahead of the slug rule so a reserved id gets an explanation
  // instead of the generic "must be lowercase letters and hyphens" message,
  // which would be baffling for an id like "all" that follows every rule.
  if (RESERVED_DISPLAY_IDS.has(display.id)) {
    return `Display id "${display.id}" is reserved: it already has a special meaning when sending commands to displays. Please pick a different id, such as "kitchen" or "bedroom-tv"`;
  }
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
const MAX_CONDITIONS_PER_MODULE = 32;

const CONDITION_KINDS = new Set(['state', 'numeric', 'time', 'and', 'or', 'not']);

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

    // A `time` condition has no shared-state key — it carries the same
    // days/window fields as a ModuleSchedule, so reuse that validator (minus
    // `invert`, which time conditions don't have) to keep the accepted shape
    // identical to the schedule surface.
    if (condition.kind === 'time') {
      return validateModuleSchedule(
        { daysOfWeek: condition.daysOfWeek, startTime: condition.startTime, endTime: condition.endTime },
        context,
      );
    }

    // Empty sourceKey = an incomplete condition (the editor adds new
    // conditions blank while the user picks a key). It can never exist on
    // the bus, so the runtime evaluates it as unknown and the whenUnknown
    // fallback governs — saveable and harmless, never a validation error.
    if (
      typeof condition.sourceKey !== 'string'
      || (condition.sourceKey !== '' && !SHARED_STATE_KEY_RE.test(condition.sourceKey))
    ) {
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

/** Hard upper bound on rules per display — bounds per-tick evaluation cost. */
export const MAX_RULES_PER_DISPLAY = 64;

const RULE_ACTION_KINDS = new Set(['showScreen', 'wake', 'sleep']);

/**
 * Validate a display's rules list at the config-write boundary. Like
 * schedules and visibility conditions, the runtime degrades quietly on bad
 * input (a broken rule just never fires), so catching it here surfaces a
 * save error instead of a doorbell screen that mysteriously never appears.
 *
 * `screens` is the owning display's own screen list — `showScreen` targets
 * must resolve within it, mirroring the owned-profile screenIds rule.
 * Returns the first error, or `null` when OK (including `undefined` rules).
 */
export function validateDisplayRules(
  rules: DisplayRule[] | undefined,
  screens: Screen[],
  context: string,
): string | null {
  if (!rules) return null;
  if (!Array.isArray(rules)) {
    return `${context}: rules must be an array`;
  }
  if (rules.length > MAX_RULES_PER_DISPLAY) {
    return `${context}: too many rules: ${rules.length} (max ${MAX_RULES_PER_DISPLAY})`;
  }

  const screenIds = new Set(screens.map((s) => s.id));
  const seenIds = new Set<string>();

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      return `${context}: rule must be an object`;
    }
    const where = `${context} rule "${rule.id ?? '?'}"`;

    if (typeof rule.id !== 'string' || rule.id === '') {
      return `${where}: missing id`;
    }
    if (seenIds.has(rule.id)) {
      return `${context}: duplicate rule id "${rule.id}"`;
    }
    seenIds.add(rule.id);

    if (typeof rule.name !== 'string') {
      return `${where}: name must be a string`;
    }

    // The condition tree shares the visibility validator wholesale — same
    // kinds, same depth/count caps, same empty-sourceKey authoring allowance.
    const conditionError = validateModuleVisibility({ conditions: rule.when }, where);
    if (conditionError) return conditionError;

    if (rule.cooldownSeconds !== undefined
      && (typeof rule.cooldownSeconds !== 'number' || !Number.isFinite(rule.cooldownSeconds) || rule.cooldownSeconds < 0)) {
      return `${where}: cooldownSeconds must be a non-negative number`;
    }

    const action = rule.action;
    if (!action || typeof action !== 'object' || !RULE_ACTION_KINDS.has(action.kind)) {
      return `${where}: unknown action kind ${JSON.stringify((action as { kind?: unknown } | undefined)?.kind)}`;
    }
    if (action.kind === 'showScreen') {
      // Empty screenId = an incomplete rule being authored (same allowance
      // as an empty condition sourceKey). The engine can never fire it —
      // '' is not a renderable screen id — so it is saveable and harmless.
      if (action.screenId !== '' && !screenIds.has(action.screenId)) {
        return `${where}: action references unknown screen "${action.screenId}"`;
      }
      if (action.mode !== 'while' && action.mode !== 'for') {
        return `${where}: action mode must be "while" or "for"`;
      }
      if (action.mode === 'for'
        && (typeof action.seconds !== 'number' || !Number.isFinite(action.seconds) || action.seconds <= 0)) {
        return `${where}: action seconds must be a positive number when mode is "for"`;
      }
    }
  }
  return null;
}

/**
 * Walk every screen and every module on every screen in a config and validate
 * each schedule AND each module's visibility conditions (the two module-gating
 * surfaces share one walk so neither can sneak past the write gate), plus the
 * display rules owned by each container. Covers both single-display mode
 * (config.screens + config.rules) and multi-display mode (each
 * display.screens + display.rules).
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
  const globalRulesError = validateDisplayRules(config.rules, config.screens ?? [], 'config');
  if (globalRulesError) return globalRulesError;

  for (const display of config.displays ?? []) {
    for (const screen of display.screens ?? []) {
      const err = checkScreen(screen, `display "${display.id}"`);
      if (err) return err;
    }
    const rulesError = validateDisplayRules(display.rules, display.screens ?? [], `display "${display.id}"`);
    if (rulesError) return rulesError;
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
