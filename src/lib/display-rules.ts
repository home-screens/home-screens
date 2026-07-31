/**
 * Display-rule engine: pure state machine behind `useDisplayRules`.
 *
 * Rules reuse the visibility condition tree unchanged; what this module adds
 * is the FIRING semantics, kept pure (state in, state out, `now` passed
 * explicitly) so every behavior is unit-testable without React:
 *
 * - **Edge-triggered, three-valued.** The condition tree is evaluated with
 *   Kleene logic (`evaluateConditionsTri`): true, false, or unknown when
 *   unpublished keys leave it undecidable. A rule fires on a transition INTO
 *   definite true — from definite false, or from unknown when the truth came
 *   from a key that was already published ("smoke OR co" fires off the smoke
 *   sensor alone even though the CO sensor never published). It never fires
 *   because a key ARRIVED true: a reboot must not slam the display onto an
 *   alert screen for a condition that has been true for days (providers
 *   publish their first values seconds after mount, which would otherwise
 *   read as an edge), and the same guard covers provider cold starts after a
 *   tombstone purge.
 * - **Armed, not queued.** An edge arms the rule; a `showScreen` rule fires
 *   as soon as no earlier takeover blocks it. Arming clears when the
 *   condition leaves definite true, so a doorbell pulse that came and went
 *   during an alarm takeover does not replay minutes later. `wake` rules
 *   skip the takeover gate entirely — waking doesn't contend for the render,
 *   so a doorbell wakes the display even mid-takeover.
 * - **Priority is list order.** An active takeover is never preempted; when
 *   it releases, the first armed rule in list order fires next.
 * - **Cooldown** is checked at fire time and swallows (disarms) rather than
 *   defers — repeated doorbell presses inside the window are dropped.
 * - **Min hold** for `while` mode: 5s floor so a flapping condition can't
 *   strobe the display (the shared-state tombstone grace already smooths
 *   producer restarts underneath this). Deleting or disabling the firing
 *   rule releases immediately — a config edit is not a flap.
 * - **Manual navigation releases** an active takeover (human wins). The
 *   rule re-fires only on a fresh edge into true, never by reasserting.
 */

import type { DisplayRule } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import { collectSourceKeys, containsTimeCondition, evaluateConditionsTri } from '@/lib/schedule';

/** Minimum time a `while`-mode takeover stays up, to ride out condition flaps. */
export const MIN_WHILE_HOLD_MS = 5_000;

/**
 * How long a takeover suppresses the sleep and dim overlays before the schedule
 * takes back over. The takeover itself keeps its screen pinned past this — only
 * the "ignore the sleep schedule" part expires.
 *
 * Uncapped, a `while` takeover on a latching sensor (garage door left open,
 * window open, printer offline) held a bedroom display at full brightness all
 * night: the sleep manager re-asserted `asleep` every 10s, but the render
 * unconditionally passed `displayState='active'` and `dimOpacity=0` while a
 * takeover existed. `for`-mode takeovers were already bounded by their own
 * `seconds`, and the sibling `wake` rule action was deliberately capped at
 * RULE_WAKE_HOLD_MS for exactly this reason; `while` was the only unbounded
 * path.
 *
 * Deliberately a separate constant from RULE_WAKE_HOLD_MS even though the
 * values match: one governs a rule waking a sleeping display, the other governs
 * a takeover outranking the sleep schedule. They are free to diverge.
 */
export const TAKEOVER_SLEEP_OVERRIDE_MS = 5 * 60_000;

export interface ActiveTakeover {
  ruleId: string;
  screenId: string;
  mode: 'while' | 'for';
  startedAt: number;
  /** Absolute release deadline; set only for `for` mode. */
  until?: number;
}

export interface RuleEngineState {
  /** False until the first advance has recorded baseline condition values. */
  initialized: boolean;
  /**
   * Last observed condition value per rule id — definite true/false, or
   * 'unknown' when unpublished keys left the tree undecidable. A missing
   * entry means the rule is new to the engine (added since the last
   * advance), which never counts as a firing edge.
   */
  prev: ReadonlyMap<string, boolean | 'unknown'>;
  /**
   * Condition-content fingerprint per rule id as of the last advance — a
   * stable stringify of `rule.when`. When a rule's fingerprint changes, the
   * user edited its condition; the resulting advance re-baselines that rule
   * (records prev, never arms) so streaming an autosave that happens to make
   * a rule's condition true does not fire it — the config changed, not the home.
   */
  fingerprints: ReadonlyMap<string, string>;
  /**
   * Keys published as of the last advance. Lets the next advance tell an
   * unknown→true caused by a KNOWN key changing (fires) apart from one
   * caused by a key arriving (never fires — boot / cold-start safety).
   */
  knownKeys: ReadonlySet<string>;
  /** Rules that edged true and have not fired (or left true) since. */
  armed: ReadonlySet<string>;
  /** Fire timestamps per rule id, for cooldown checks. */
  lastFiredAt: ReadonlyMap<string, number>;
  takeover: ActiveTakeover | null;
}

/**
 * Result of one engine step. `wake`/`sleep` are true when a firing implies
 * waking or sleeping the display; they never fire together in one step (a
 * sleep firing releases any takeover — see `advanceRuleEngine`).
 */
export interface RuleEngineStep {
  next: RuleEngineState;
  wake: boolean;
  sleep: boolean;
}

export function createRuleEngineState(): RuleEngineState {
  return {
    initialized: false,
    prev: new Map(),
    fingerprints: new Map(),
    knownKeys: new Set(),
    armed: new Set(),
    lastFiredAt: new Map(),
    takeover: null,
  };
}

/**
 * Stable fingerprint of a rule's condition tree. Conditions come from config
 * JSON with a fixed key order, so a plain stringify is stable enough to detect
 * a content edit — the only thing this needs to distinguish.
 */
function conditionFingerprint(rule: DisplayRule): string {
  // A hand-edited config.json rule may omit `when` entirely; treat a missing
  // tree as the empty tree so the fingerprint stays a stable string.
  return JSON.stringify(rule.when ?? []);
}

/** All sourceKeys referenced by any enabled rule's condition tree, deduped and sorted. */
export function collectRuleSourceKeys(rules: readonly DisplayRule[]): string[] {
  const keys = new Set<string>();
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    // A hand-edited rule can be missing `when` — guard like state-demand.ts.
    if (rule.when) collectSourceKeys(rule.when, keys);
  }
  keys.delete('');
  return Array.from(keys).sort();
}

/** True when any enabled rule's condition tree contains a `time` condition —
 *  arms the wall-clock re-evaluation tick in `useDisplayRules`. */
export function rulesContainTimeCondition(rules: readonly DisplayRule[]): boolean {
  return rules.some((r) => r.enabled !== false && !!r.when && containsTimeCondition(r.when));
}

/** True when the rule's condition tree references any of the given keys. */
function ruleReferencesAny(rule: DisplayRule, keys: ReadonlySet<string>): boolean {
  if (keys.size === 0 || !rule.when) return false;
  const referenced = new Set<string>();
  collectSourceKeys(rule.when, referenced);
  for (const key of referenced) {
    if (keys.has(key)) return true;
  }
  return false;
}

/**
 * A rule's condition value right now: definite true/false, or 'unknown'
 * when unpublished keys leave the tree undecidable under Kleene semantics
 * (see `evaluateConditionsTri`). Only definite true can fire.
 */
export function evaluateRuleCondition(
  rule: DisplayRule,
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date = new Date(),
): boolean | 'unknown' {
  // An empty tree means "always true" for visibility; for a RULE it must
  // mean "never fires" — an always-true rule can never produce an edge into
  // true anyway, and treating it as false keeps a freshly-added blank rule
  // inert while the user is still authoring it. A hand-edited config.json rule
  // can omit `when` entirely; a missing tree is the same as an empty one.
  if (!rule.when || rule.when.length === 0) return false;
  return evaluateConditionsTri(rule.when, states, now) ?? 'unknown';
}

/**
 * When the active takeover should end, given the rule list and condition
 * values as of `now`. Exposed for the hook to schedule its re-check timer.
 * Returns null when no timer is needed (no takeover, or `while` with the
 * condition still true — the next state change re-advances the engine).
 */
export function takeoverDeadline(
  state: RuleEngineState,
  rules: readonly DisplayRule[],
  states: ReadonlyMap<string, SharedStateEntry>,
  now: Date = new Date(),
): number | null {
  const takeover = state.takeover;
  if (!takeover) return null;
  const overrideEnd = takeover.startedAt + TAKEOVER_SLEEP_OVERRIDE_MS;
  if (takeover.mode === 'for') {
    // The sleep override expires for `for`-mode takeovers too, and `seconds` is
    // unbounded (the editor accepts any positive number, and nothing clamps it
    // server-side). Reporting only `until` meant a `for: 1800` rule left
    // `takeoverOverridesSleep` stuck true for its whole 30 minutes, because
    // nothing bumped the tick that recomputes it — the exact all-night-bright
    // scenario this cap exists to prevent, just with a different mode.
    if (takeover.until == null) return overrideEnd > Date.now() ? overrideEnd : null;
    return overrideEnd > Date.now() ? Math.min(takeover.until, overrideEnd) : takeover.until;
  }
  const rule = rules.find((r) => r.id === takeover.ruleId);
  const holdEnd = takeover.startedAt + MIN_WHILE_HOLD_MS;
  // Condition already false → release exactly when the min hold elapses.
  if (!rule || rule.enabled === false || evaluateRuleCondition(rule, states, now) !== true) return holdEnd;
  // Condition still true, so the takeover itself has no end — but the sleep
  // override does. Report its expiry so the hook re-renders and lets the sleep
  // overlay come back over the still-pinned screen.
  if (overrideEnd > Date.now()) return overrideEnd;
  return null;
}

/**
 * Advance the engine one step against the current shared-state snapshot.
 * Call on every state change, rules change, and timer deadline. Pure: the
 * input state is never mutated.
 *
 * `renderableScreenIds` is the set of screens a takeover may legally show —
 * the display's OWN full list minus disabled screens, ignoring the active
 * profile filter (an alert screen may be deliberately excluded from normal
 * rotation).
 */
/**
 * Decide which rules are armed after this advance.
 *
 * "Armed" means the rule's condition has just made a *fresh edge* into definite
 * true and is therefore eligible to fire. Extracted from `advanceRuleEngine` so
 * the branch chain can be tested directly over the tri-state cross product —
 * the three ordering subtleties below are what the whole feature's correctness
 * rests on, and each produces a failure that is unreproducible in the field
 * ("the doorbell screen didn't come up that one time"):
 *
 * 1. `contentEdited` is tested BEFORE the `was === false` edge. Otherwise
 *    autosaving a condition into an already-true state reads as a false→true
 *    edge and fires the rule mid-edit.
 * 2. `was === undefined` (a rule new to the engine) falls through silently.
 *    Otherwise every newly-created rule fires the instant it is created.
 * 3. The `unknown → true` arm additionally consults `newlyKnown`. Otherwise
 *    every reboot slams the display onto whichever alert screen happens to have
 *    been true for days.
 *
 * Pure: reads `state` but never mutates it, and returns a fresh Set.
 */
export function computeArmed(
  state: RuleEngineState,
  rules: readonly DisplayRule[],
  current: ReadonlyMap<string, boolean | 'unknown'>,
  fingerprints: ReadonlyMap<string, string>,
  newlyKnown: ReadonlySet<string>,
): Set<string> {
  // Arm on fresh edges into definite true; disarm rules whose condition
  // left true, that were disabled, or that were deleted from the list.
  const armed = new Set(state.armed);
  for (const rule of rules) {
    const is = current.get(rule.id);
    const was = state.prev.get(rule.id);
    // A rule whose condition CONTENT changed since the last advance was just
    // edited: re-baseline it (like `was === undefined`), never arm on this
    // advance. Otherwise autosaving a condition into an already-true state
    // would read as a false→true (or unknown→true) edge and fire mid-edit.
    const contentEdited =
      state.prev.has(rule.id) && state.fingerprints.get(rule.id) !== fingerprints.get(rule.id);
    if (is !== true || rule.enabled === false) {
      armed.delete(rule.id);
    } else if (contentEdited) {
      armed.delete(rule.id);
    } else if (was === false) {
      armed.add(rule.id);
    } else if (was === 'unknown' && !ruleReferencesAny(rule, newlyKnown)) {
      armed.add(rule.id);
    }
    // `was === undefined` — rule new to the engine — is a baseline, never an edge.
  }
  // Drop rules that were deleted from the list entirely.
  for (const id of armed) {
    if (!current.has(id)) armed.delete(id);
  }
  return armed;
}

/**
 * Phase 1 — evaluate every rule's condition against the bus snapshot, and
 * fingerprint its condition content so a later advance can tell "the user
 * edited this rule" apart from "the world changed". Pure.
 */
export function computeCurrent(
  rules: readonly DisplayRule[],
  states: ReadonlyMap<string, SharedStateEntry>,
  nowDate: Date,
): { current: Map<string, boolean | 'unknown'>; fingerprints: Map<string, string> } {
  const current = new Map<string, boolean | 'unknown'>();
  const fingerprints = new Map<string, string>();
  for (const rule of rules) {
    current.set(rule.id, evaluateRuleCondition(rule, states, nowDate));
    fingerprints.set(rule.id, conditionFingerprint(rule));
  }
  return { current, fingerprints };
}

/**
 * Phase 4 — decide whether a takeover carried in from a previous advance
 * survives this one. An active takeover is never preempted, only released, so
 * this runs BEFORE any new firing is considered.
 *
 * Four release reasons, in priority order:
 *   1. the target screen was deleted or disabled mid-takeover
 *   2. the firing rule was deleted or switched off (the natural way to kill a
 *      misfiring takeover; releases in both modes, because the minimum hold
 *      protects against condition flaps, not against config edits)
 *   3. `for` mode: its `until` deadline passed
 *   4. `while` mode: the condition stopped holding AND the minimum hold elapsed
 *
 * Pure. Returns the surviving takeover, or null.
 */
export function maintainTakeover(
  takeover: ActiveTakeover | null,
  rules: readonly DisplayRule[],
  current: ReadonlyMap<string, boolean | 'unknown'>,
  renderableScreenIds: ReadonlySet<string>,
  now: number,
): ActiveTakeover | null {
  if (!takeover) return null;

  if (!renderableScreenIds.has(takeover.screenId)) return null;

  const rule = rules.find((r) => r.id === takeover.ruleId);
  if (!rule || rule.enabled === false) return null;

  if (takeover.mode === 'for') {
    if (takeover.until !== undefined && now >= takeover.until) return null;
    return takeover;
  }

  const conditionHolds = current.get(rule.id) === true;
  const holdElapsed = now - takeover.startedAt >= MIN_WHILE_HOLD_MS;
  if (!conditionHolds && holdElapsed) return null;
  return takeover;
}

/**
 * Phase 5 — fire the armed rules, in list order.
 *
 * `wake`/`sleep` actions do not contend for the render, so they skip the
 * takeover gate and fire immediately (still subject to their own cooldown).
 * `showScreen` is blocked by an active takeover, and crucially does NOT consume
 * its arming when blocked: the rule stays armed and fires at release if its
 * condition still holds. Every other showScreen outcome (cooldown, missing
 * target, success) does consume it.
 *
 * The first armed showScreen rule in list order wins; later showScreen rules
 * then hit the takeover gate this function just closed.
 *
 * Pure: copies `armed` and `lastFiredAt` rather than mutating the caller's.
 */
export function fireArmed(
  armedIn: ReadonlySet<string>,
  rules: readonly DisplayRule[],
  takeoverIn: ActiveTakeover | null,
  lastFiredAtIn: ReadonlyMap<string, number>,
  renderableScreenIds: ReadonlySet<string>,
  now: number,
): {
  armed: Set<string>;
  takeover: ActiveTakeover | null;
  lastFiredAt: Map<string, number>;
  wake: boolean;
  sleep: boolean;
} {
  const armed = new Set(armedIn);
  const lastFiredAt = new Map(lastFiredAtIn);
  let takeover = takeoverIn;
  let wake = false;
  let sleep = false;

  for (const rule of rules) {
    if (!armed.has(rule.id)) continue;

    if (rule.action.kind === 'wake' || rule.action.kind === 'sleep') {
      armed.delete(rule.id);
      if (!inCooldown(rule, lastFiredAt, now)) {
        lastFiredAt.set(rule.id, now);
        if (rule.action.kind === 'wake') wake = true;
        else sleep = true;
      }
      continue;
    }

    if (takeover) continue; // blocked, arming deliberately preserved

    armed.delete(rule.id); // every outcome below consumes the arming

    if (inCooldown(rule, lastFiredAt, now)) continue; // swallowed, not deferred
    if (!renderableScreenIds.has(rule.action.screenId)) continue; // target gone

    lastFiredAt.set(rule.id, now);
    takeover = {
      ruleId: rule.id,
      screenId: rule.action.screenId,
      mode: rule.action.mode,
      startedAt: now,
      ...(rule.action.mode === 'for'
        ? { until: now + (rule.action.seconds ?? 0) * 1000 }
        : {}),
    };
  }

  return { armed, takeover, lastFiredAt, wake, sleep };
}

export function advanceRuleEngine(
  state: RuleEngineState,
  rules: readonly DisplayRule[],
  states: ReadonlyMap<string, SharedStateEntry>,
  renderableScreenIds: ReadonlySet<string>,
  now: number,
  /**
   * Wall-clock instant, shifted to the display's timezone, used ONLY to
   * evaluate `time` conditions. Separate from the epoch `now` above, which
   * drives cooldown/hold math and must stay a real UTC epoch. Defaults to
   * `new Date(now)` so callers that don't use time conditions (and tests) can
   * pass the epoch alone.
   */
  nowDate: Date = new Date(now),
): RuleEngineStep {
  // Phase 1 — where every rule stands right now.
  const { current, fingerprints } = computeCurrent(rules, states, nowDate);

  // "Known" here means present in the map, which includes tombstoned entries:
  // `clearKey` keeps the last value and marks `staleAt` rather than deleting,
  // and only really deletes after TOMBSTONE_TTL_MS (`shared-state-store.ts`).
  // So that TTL is the boundary deciding whether a producer restart looks like
  // an ordinary value edge or like a cold start to the guard below. See
  // `__tests__/tombstone-rule-engine-coupling.test.ts`.
  const knownKeys: ReadonlySet<string> = new Set(states.keys());

  // First advance after boot: record baselines, never fire. A rule that is
  // true right now fires only after leaving and re-entering true.
  if (!state.initialized) {
    return {
      next: { ...state, initialized: true, prev: current, fingerprints, knownKeys, armed: new Set() },
      wake: false,
      sleep: false,
    };
  }

  // Phase 2 — keys that became published since the last advance. An
  // unknown→true transition fires ONLY when none of the rule's keys just
  // arrived: the truth then came from a key that was already known changing
  // value, not from a provider's first (possibly days-stale) publish.
  const newlyKnown = new Set<string>();
  for (const key of knownKeys) {
    if (!state.knownKeys.has(key)) newlyKnown.add(key);
  }

  // Phase 3 — arm on fresh edges into definite true, disarm everything else.
  const armedAfterEdges = computeArmed(state, rules, current, fingerprints, newlyKnown);

  // Phase 4 — release the carried-in takeover if it no longer holds. Runs
  // before phase 5 because an active takeover is never preempted, only
  // released, and phase 5 gates on whether one is still standing.
  const heldTakeover = maintainTakeover(state.takeover, rules, current, renderableScreenIds, now);

  // Phase 5 — fire.
  const fired = fireArmed(armedAfterEdges, rules, heldTakeover, state.lastFiredAt, renderableScreenIds, now);
  const armed = fired.armed;
  let takeover = fired.takeover;

  // Post-pass: sleep wins over any takeover, regardless of rule order.
  // Releasing here rather than gating phase 5 on `sleep` guarantees BOTH a
  // takeover carried in from a previous advance AND one that fired earlier in
  // this same phase are gone, so the display genuinely blacks out. Armed
  // showScreen rules are dropped too so the next advance can't immediately
  // re-take the sleeping display — they re-fire only on a fresh edge, the same
  // posture as a manual-navigation release.
  if (fired.sleep) {
    takeover = null;
    armed.clear();
  }

  return {
    next: {
      initialized: true,
      prev: current,
      fingerprints,
      knownKeys,
      armed,
      lastFiredAt: fired.lastFiredAt,
      takeover,
    },
    wake: fired.wake,
    sleep: fired.sleep,
  };
}

function inCooldown(
  rule: DisplayRule,
  lastFiredAt: ReadonlyMap<string, number>,
  now: number,
): boolean {
  const cooldownMs = (rule.cooldownSeconds ?? 0) * 1000;
  if (cooldownMs <= 0) return false;
  const firedAt = lastFiredAt.get(rule.id);
  return firedAt !== undefined && now - firedAt < cooldownMs;
}

/**
 * Release the active takeover because the user navigated (human wins). The
 * firing rule stays fired (`lastFiredAt` was set when it fired), and it is
 * not re-armed — it can only fire again from a fresh edge into true.
 *
 * Manual navigation also disarms every rule waiting behind the takeover: a
 * second showScreen rule that armed while blocked must not re-take the display
 * against the person at the next advance. It re-fires only on its own fresh
 * false→true edge. (Only showScreen rules are ever left armed between advances
 * — wake rules disarm the moment they fire — so clearing `armed` is exactly
 * "disarm every armed showScreen rule".) Natural release runs inside
 * `advanceRuleEngine` and keeps the armed-rule-fires-at-release semantics.
 */
export function releaseTakeover(state: RuleEngineState): RuleEngineState {
  if (!state.takeover && state.armed.size === 0) return state;
  return { ...state, takeover: null, armed: new Set() };
}
