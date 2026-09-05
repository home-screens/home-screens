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
  const inWindow = matchesTimeWindow(
    schedule.daysOfWeek,
    schedule.startTime,
    schedule.endTime,
    now,
    schedule.endDayOffset,
  );
  return schedule.invert ? !inWindow : inWindow;
}

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Core day/time-window match shared by module schedules (`isModuleVisible`)
 * and `time` visibility conditions, so the two can never disagree about which
 * day a post-midnight instant belongs to. No `invert`, which is a
 * schedule-only concept; the condition tree negates with a `not` group. `now`
 * must already be shifted to the display's timezone (callers use `useTZClock`
 * / `createTZDate`).
 *
 * Every selected day opens one window on a minutes-since-Sunday-midnight line:
 * it opens at `day * 1440 + start` and closes at `(day + span) * 1440 + end`,
 * end exclusive. `span` comes from `resolveSpan` below: `endDayOffset` when
 * it is a usable value above zero, otherwise 1 for a window whose end is not
 * after its start and 0 for an ordinary one.
 *
 * Testing `now + one week` as well as `now` is what lets a window opened late
 * on Saturday reach into Sunday: Sunday is minute 0 of the line, so it only
 * falls inside such a window once a week has been added to it.
 */
function matchesTimeWindow(
  daysOfWeek: number[] | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
  now: Date,
  endDayOffset?: number,
): boolean {
  const start = parseTime(startTime) ?? 0;
  const end = parseTime(endTime) ?? MINUTES_PER_DAY;
  const span = resolveSpan(start, end, endDayOffset);

  const days = daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : ALL_DAYS;
  const nowMinutes = now.getMinutes() + now.getHours() * 60 + now.getDay() * MINUTES_PER_DAY;

  for (const day of days) {
    const opens = day * MINUTES_PER_DAY + start;
    const closes = (day + span) * MINUTES_PER_DAY + end;
    if (nowMinutes >= opens && nowMinutes < closes) return true;
    if (nowMinutes + MINUTES_PER_WEEK >= opens && nowMinutes + MINUTES_PER_WEEK < closes) return true;
  }
  return false;
}

/**
 * A span of 0-6 whole days, or null when unset. Anything out of range or
 * non-integer is treated as unset rather than trusted, so a hand-edited
 * config.json cannot produce a window that laps itself.
 */
function clampSpan(endDayOffset: number | undefined): number | null {
  if (endDayOffset === undefined || !Number.isInteger(endDayOffset)) return null;
  if (endDayOffset < 0 || endDayOffset > 6) return null;
  return endDayOffset;
}

/**
 * THE definition of the span, shared by the predicate above, the editor's
 * controls, the summary text and the week strip, so they cannot disagree
 * about what a stored schedule currently means.
 *
 * An explicit `endDayOffset` above zero wins. Zero means the same as omitted:
 * the span editor's "Ends on" select writes it when the start day is picked,
 * and the type promises it is a plain window, so an overnight pair must still
 * wrap. Without a usable offset, an end at or before the start closes the
 * next day. "At" matters: equal times are the only way to store a full
 * 24-hour repeating window (the strip's end drag lands there at its cap), and
 * a zero-length window is of no use to anyone.
 */
function resolveSpan(start: number, end: number, endDayOffset: number | undefined): number {
  const explicit = clampSpan(endDayOffset);
  if (explicit) return explicit;
  return start >= end ? 1 : 0;
}

/**
 * How many days after its start day a window closes. See `resolveSpan`.
 */
export function resolveSpanDays(schedule: ModuleSchedule | undefined): number {
  const start = parseTime(schedule?.startTime) ?? 0;
  const end = parseTime(schedule?.endTime) ?? MINUTES_PER_DAY;
  return resolveSpan(start, end, schedule?.endDayOffset);
}

/**
 * Which of the two shapes a schedule is, derived rather than stored.
 *
 * `repeat` gives every picked day its own window, at most 24 hours long, so
 * two picked days can never light the same hour. `span` is one stretch from a
 * single start day, which is the only shape that can run for days.
 *
 * Keeping them apart is what makes overlap impossible: an explicit
 * `endDayOffset` above zero means a span, and a span always has exactly one
 * start day. A zero offset is a plain window either way, so it reads as
 * `repeat` and nothing is lost.
 */
export function scheduleShape(schedule: ModuleSchedule | undefined): 'repeat' | 'span' {
  const explicit = clampSpan(schedule?.endDayOffset);
  return explicit !== null && explicit > 0 ? 'span' : 'repeat';
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
  now: Date = new Date(),
): boolean {
  if (!visibility || visibility.conditions.length === 0) return true;

  if (hasUnknownKey(visibility.conditions, states)) {
    return (visibility.whenUnknown ?? 'hide') === 'show';
  }

  return visibility.conditions.every((c) => evaluateCondition(c, states, now));
}

function hasUnknownKey(
  conditions: VisibilityCondition[],
  states: ReadonlyMap<string, SharedStateEntry>,
): boolean {
  for (const c of conditions) {
    if (c.kind === 'and' || c.kind === 'or' || c.kind === 'not') {
      if (hasUnknownKey(c.conditions, states)) return true;
    } else if (c.kind === 'time') {
      // A time condition has no shared-state key — it is always decidable
      // from the clock, never unknown, so it can't trip whenUnknown.
      continue;
    } else if (!states.has(c.sourceKey)) {
      return true;
    }
  }
  return false;
}

function evaluateCondition(
  condition: VisibilityCondition,
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date,
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
      if (condition.above !== undefined) {
        const met = condition.aboveInclusive ? num >= condition.above : num > condition.above;
        if (!met) return false;
      }
      if (condition.below !== undefined) {
        const met = condition.belowInclusive ? num <= condition.below : num < condition.below;
        if (!met) return false;
      }
      return true;
    }
    case 'time':
      return matchesTimeWindow(
        condition.daysOfWeek,
        condition.startTime,
        condition.endTime,
        now,
        condition.endDayOffset,
      );
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, states, now));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, states, now));
    case 'not':
      // HA semantics: `not` is true when NONE of its conditions are met.
      return !condition.conditions.some((c) => evaluateCondition(c, states, now));
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
  now: Date = new Date(),
): boolean | undefined {
  let unknown = false;
  for (const c of conditions) {
    const v = evaluateConditionTri(c, states, now);
    if (v === false) return false;
    if (v === undefined) unknown = true;
  }
  return unknown ? undefined : true;
}

function evaluateConditionTri(
  condition: VisibilityCondition,
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date,
): boolean | undefined {
  switch (condition.kind) {
    case 'state':
    case 'numeric':
      // Unpublished (or still-blank) keys are unknown, never plain false —
      // `not`/`or` must not launder an unknown into a definite value.
      if (!states.has(condition.sourceKey)) return undefined;
      return evaluateCondition(condition, states, now);
    case 'time':
      // Always decidable from the clock — a definite boolean, never unknown.
      return evaluateCondition(condition, states, now);
    case 'and':
      return evaluateConditionsTri(condition.conditions, states, now);
    case 'or': {
      let unknown = false;
      for (const c of condition.conditions) {
        const v = evaluateConditionTri(c, states, now);
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
        const v = evaluateConditionTri(c, states, now);
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
    else if (c.kind === 'time') continue; // no shared-state key to demand
    else into.add(c.sourceKey);
  }
}

/**
 * True when any condition in the tree is a `time` condition. Callers use this
 * to arm a wall-clock re-evaluation tick (the display re-runs condition
 * evaluation on shared-state changes only; a time boundary crossing has no
 * state change behind it). Cheap enough to run per render.
 */
export function containsTimeCondition(conditions: VisibilityCondition[]): boolean {
  for (const c of conditions) {
    if (c.kind === 'time') return true;
    if ((c.kind === 'and' || c.kind === 'or' || c.kind === 'not') && containsTimeCondition(c.conditions)) {
      return true;
    }
  }
  return false;
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
