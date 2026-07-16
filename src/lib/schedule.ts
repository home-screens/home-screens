import type {
  ModuleInstance,
  ModuleSchedule,
  ModuleVisibility,
  Profile,
  Screen,
  VisibilityCondition,
} from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';

/**
 * Returns false only when the module has been explicitly disabled
 * (`enabled === false`). Undefined / true both mean "enabled".
 * Mirrors the `Screen.enabled` convention used by ScreenRotator and the remote view.
 */
export function isModuleEnabled(mod: Pick<ModuleInstance, 'enabled'>): boolean {
  return mod.enabled !== false;
}

/**
 * Determine whether a module should be visible right now based on its schedule.
 * Returns true if the module has no schedule (always visible).
 */
export function isModuleVisible(schedule: ModuleSchedule | undefined, now: Date): boolean {
  if (!schedule) return true;

  const { daysOfWeek, startTime, endTime, invert } = schedule;

  const start = parseTime(startTime) ?? 0;
  const end = parseTime(endTime) ?? 24 * 60;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // For overnight windows (e.g. 22:00–06:00), the post-midnight portion
  // (00:00–06:00) logically belongs to the previous day's schedule.
  // Use yesterday's day-of-week in that case.
  const isOvernight = start > end;
  const isPostMidnight = isOvernight && nowMinutes < end;
  const relevantDay = isPostMidnight ? (now.getDay() + 6) % 7 : now.getDay();

  const dayMatch = !daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.includes(relevantDay);
  const timeMatch = isInTimeWindow(start, end, nowMinutes);

  const inWindow = dayMatch && timeMatch;
  return invert ? !inWindow : inWindow;
}

/**
 * Evaluate a module's shared-state visibility conditions. Pure — takes a
 * state snapshot, never touches the store. Returns true = visible.
 *
 * Semantics (see the ModuleVisibility type for rationale):
 * - No visibility / empty conditions → visible.
 * - If ANY sourceKey referenced anywhere in the tree is unpublished, return
 *   the `whenUnknown` outcome (default hide) WITHOUT evaluating. Leaves are
 *   therefore always plain true/false over known values, so `not`/`or` never
 *   negate an "unknown" into a surprise "visible".
 * - Top-level conditions AND together. Met → show, unmet → hide.
 */
export function evaluateVisibility(
  visibility: ModuleVisibility | undefined,
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean {
  if (!visibility || visibility.conditions.length === 0) return true;

  if (hasUnknownKey(visibility.conditions, states)) {
    return (visibility.whenUnknown ?? 'hide') === 'show';
  }

  return visibility.conditions.every((c) => evaluateCondition(c, states));
}

function hasUnknownKey(
  conditions: VisibilityCondition[],
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean {
  for (const c of conditions) {
    if (c.kind === 'and' || c.kind === 'or' || c.kind === 'not') {
      if (hasUnknownKey(c.conditions, states)) return true;
    } else if (!states.has(c.sourceKey)) {
      return true;
    }
  }
  return false;
}

function evaluateCondition(
  condition: VisibilityCondition,
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean {
  switch (condition.kind) {
    case 'state': {
      const value = states.get(condition.sourceKey)?.value ?? '';
      if (condition.equals !== undefined && !matchesAny(value, condition.equals)) return false;
      if (condition.notEquals !== undefined && matchesAny(value, condition.notEquals)) return false;
      return true;
    }
    case 'numeric': {
      const raw = states.get(condition.sourceKey)?.value ?? '';
      const num = raw.trim() === '' ? NaN : Number(raw);
      // A published value that doesn't parse as a number fails the condition.
      if (!Number.isFinite(num)) return false;
      if (condition.above !== undefined && !(num > condition.above)) return false;
      if (condition.below !== undefined && !(num < condition.below)) return false;
      return true;
    }
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, states));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, states));
    case 'not':
      // HA semantics: `not` is true when NONE of its conditions are met.
      return !condition.conditions.some((c) => evaluateCondition(c, states));
  }
}

/**
 * Three-valued evaluation of a condition list (top-level AND): `undefined`
 * means the value cannot be determined from the published keys. Kleene
 * semantics — an `or` with one known-true branch is definitively true even
 * when a sibling key is unpublished, so "smoke OR co" resolves off the smoke
 * sensor alone. Module visibility keeps the coarser whenUnknown gate in
 * `evaluateVisibility`; the display-rule engine needs this finer result.
 *
 * Adding a condition kind means updating `evaluateCondition` AND
 * `evaluateConditionTri` below — both switches live here so neither can
 * drift out of sight of the other.
 */
export function evaluateConditionsTri(
  conditions: VisibilityCondition[],
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean | undefined {
  let unknown = false;
  for (const c of conditions) {
    const v = evaluateConditionTri(c, states);
    if (v === false) return false;
    if (v === undefined) unknown = true;
  }
  return unknown ? undefined : true;
}

function evaluateConditionTri(
  condition: VisibilityCondition,
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean | undefined {
  switch (condition.kind) {
    case 'state':
    case 'numeric':
      // Unpublished (or still-blank) keys are unknown, never plain false —
      // `not`/`or` must not launder an unknown into a definite value.
      if (!states.has(condition.sourceKey)) return undefined;
      return evaluateCondition(condition, states);
    case 'and':
      return evaluateConditionsTri(condition.conditions, states);
    case 'or': {
      let unknown = false;
      for (const c of condition.conditions) {
        const v = evaluateConditionTri(c, states);
        if (v === true) return true;
        if (v === undefined) unknown = true;
      }
      return unknown ? undefined : false;
    }
    case 'not': {
      // `not` is true when NONE of its conditions are met (HA semantics):
      // one met → definitively false; any unknown → could be met → unknown.
      let unknown = false;
      for (const c of condition.conditions) {
        const v = evaluateConditionTri(c, states);
        if (v === true) return false;
        if (v === undefined) unknown = true;
      }
      return unknown ? undefined : true;
    }
  }
}

/**
 * Collect every sourceKey referenced anywhere in a condition tree into
 * `into`. The ONE walker every consumer of the closed `VisibilityCondition`
 * union shares (module subscriptions, rule subscriptions, demand
 * computation) — a new condition kind added here is picked up by all of
 * them at once instead of silently missing from some.
 */
export function collectSourceKeys(conditions: VisibilityCondition[], into: Set<string>): void {
  for (const c of conditions) {
    if (c.kind === 'and' || c.kind === 'or' || c.kind === 'not') collectSourceKeys(c.conditions, into);
    else into.add(c.sourceKey);
  }
}

/**
 * All sourceKeys referenced by any module's visibility tree, deduped and
 * sorted (stable output for memoization). Lets the renderer subscribe to
 * only the shared-state keys the current screen actually conditions on.
 */
export function collectConditionSourceKeys(modules: ModuleInstance[]): string[] {
  const keys = new Set<string>();
  for (const mod of modules) {
    if (mod.visibility?.conditions) collectSourceKeys(mod.visibility.conditions, keys);
  }
  return Array.from(keys).sort();
}

/** String equality where an array means "matches any" (HA's array semantics). */
function matchesAny(value: string, expected: string | string[]): boolean {
  return Array.isArray(expected) ? expected.includes(value) : value === expected;
}

function isInTimeWindow(start: number, end: number, nowMinutes: number): boolean {
  if (start === 0 && end === 24 * 60) return true;

  if (start <= end) {
    // Normal window: e.g., 06:00–09:00
    return nowMinutes >= start && nowMinutes < end;
  } else {
    // Overnight window: e.g., 22:00–06:00 (wraps past midnight)
    return nowMinutes >= start || nowMinutes < end;
  }
}

function parseTime(time: string | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Resolve which screens should be displayed based on profiles.
 * - If a profile with a matching schedule exists, use its screens.
 * - Otherwise fall back to the manually set activeProfile.
 * - If no profile matches, return all screens (backward compatible).
 */
export function resolveProfileScreens(
  allScreens: Screen[],
  profiles: Profile[] | undefined,
  activeProfileId: string | undefined,
  now: Date,
): Screen[] {
  if (!profiles || profiles.length === 0) return allScreens;

  // Check scheduled profiles first (first match wins, skip if no valid screens)
  for (const profile of profiles) {
    if (profile.schedule && isModuleVisible(profile.schedule, now)) {
      const filtered = filterScreens(allScreens, profile.screenIds);
      if (filtered.length > 0) return filtered;
      // Schedule matched but all screens are stale — fall through to next
    }
  }

  // Fall back to manually set active profile
  if (activeProfileId) {
    const active = profiles.find((p) => p.id === activeProfileId);
    if (active) {
      const filtered = filterScreens(allScreens, active.screenIds);
      if (filtered.length > 0) return filtered;
    }
  }

  // No profile produced valid screens — show all
  return allScreens;
}

function filterScreens(allScreens: Screen[], screenIds: string[]): Screen[] {
  const screenMap = new Map(allScreens.map((s) => [s.id, s]));
  return screenIds.map((id) => screenMap.get(id)).filter((s): s is Screen => !!s);
}
