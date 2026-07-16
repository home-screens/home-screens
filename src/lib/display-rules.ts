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
import { collectSourceKeys, evaluateConditionsTri } from '@/lib/schedule';

/** Minimum time a `while`-mode takeover stays up, to ride out condition flaps. */
export const MIN_WHILE_HOLD_MS = 5_000;

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

/** Result of one engine step. `wake` is true when a firing implies waking the display. */
export interface RuleEngineStep {
  next: RuleEngineState;
  wake: boolean;
}

export function createRuleEngineState(): RuleEngineState {
  return {
    initialized: false,
    prev: new Map(),
    knownKeys: new Set(),
    armed: new Set(),
    lastFiredAt: new Map(),
    takeover: null,
  };
}

/** All sourceKeys referenced by any enabled rule's condition tree, deduped and sorted. */
export function collectRuleSourceKeys(rules: readonly DisplayRule[]): string[] {
  const keys = new Set<string>();
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    collectSourceKeys(rule.when, keys);
  }
  keys.delete('');
  return Array.from(keys).sort();
}

/** True when the rule's condition tree references any of the given keys. */
function ruleReferencesAny(rule: DisplayRule, keys: ReadonlySet<string>): boolean {
  if (keys.size === 0) return false;
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
): boolean | 'unknown' {
  // An empty tree means "always true" for visibility; for a RULE it must
  // mean "never fires" — an always-true rule can never produce an edge into
  // true anyway, and treating it as false keeps a freshly-added blank rule
  // inert while the user is still authoring it.
  if (rule.when.length === 0) return false;
  return evaluateConditionsTri(rule.when, states) ?? 'unknown';
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
): number | null {
  const takeover = state.takeover;
  if (!takeover) return null;
  if (takeover.mode === 'for') return takeover.until ?? null;
  const rule = rules.find((r) => r.id === takeover.ruleId);
  const holdEnd = takeover.startedAt + MIN_WHILE_HOLD_MS;
  // Condition already false → release exactly when the min hold elapses.
  if (!rule || rule.enabled === false || evaluateRuleCondition(rule, states) !== true) return holdEnd;
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
export function advanceRuleEngine(
  state: RuleEngineState,
  rules: readonly DisplayRule[],
  states: ReadonlyMap<string, SharedStateEntry>,
  renderableScreenIds: ReadonlySet<string>,
  now: number,
): RuleEngineStep {
  const current = new Map<string, boolean | 'unknown'>();
  for (const rule of rules) {
    current.set(rule.id, evaluateRuleCondition(rule, states));
  }
  const knownKeys: ReadonlySet<string> = new Set(states.keys());

  // First advance after boot: record baselines, never fire. A rule that is
  // true right now fires only after leaving and re-entering true.
  if (!state.initialized) {
    return {
      next: { ...state, initialized: true, prev: current, knownKeys, armed: new Set() },
      wake: false,
    };
  }

  // Keys that became published since the last advance. An unknown→true
  // transition fires ONLY when none of the rule's keys just arrived — the
  // truth then came from a key that was already known changing value, not
  // from a provider's first (possibly days-stale) publish.
  const newlyKnown = new Set<string>();
  for (const key of knownKeys) {
    if (!state.knownKeys.has(key)) newlyKnown.add(key);
  }

  // Arm on fresh edges into definite true; disarm rules whose condition
  // left true, that were disabled, or that were deleted from the list.
  const armed = new Set(state.armed);
  for (const rule of rules) {
    const is = current.get(rule.id);
    const was = state.prev.get(rule.id);
    if (is !== true || rule.enabled === false) {
      armed.delete(rule.id);
    } else if (was === false) {
      armed.add(rule.id);
    } else if (was === 'unknown' && !ruleReferencesAny(rule, newlyKnown)) {
      armed.add(rule.id);
    }
    // `was === undefined` — rule new to the engine — is a baseline, never an edge.
  }
  for (const id of armed) {
    if (!current.has(id)) armed.delete(id);
  }

  // Maintain the active takeover before considering new firings — an active
  // takeover is never preempted (only released).
  let takeover = state.takeover;
  if (takeover) {
    const rule = rules.find((r) => r.id === takeover!.ruleId);
    if (!renderableScreenIds.has(takeover.screenId)) {
      takeover = null; // target screen deleted/disabled mid-takeover
    } else if (!rule || rule.enabled === false) {
      // The firing rule was deleted or switched off — the natural way to
      // kill a misfiring takeover. Releases immediately in both modes; the
      // min hold protects against condition flaps, not config edits.
      takeover = null;
    } else if (takeover.mode === 'for') {
      if (takeover.until !== undefined && now >= takeover.until) takeover = null;
    } else {
      const conditionHolds = current.get(rule.id) === true;
      const holdElapsed = now - takeover.startedAt >= MIN_WHILE_HOLD_MS;
      if (!conditionHolds && holdElapsed) takeover = null;
    }
  }

  const lastFiredAt = new Map(state.lastFiredAt);
  let wake = false;

  for (const rule of rules) {
    if (!armed.has(rule.id)) continue;

    if (rule.action.kind === 'wake') {
      // Wake doesn't contend for the render, so it skips the takeover gate
      // and fires immediately (still subject to its own cooldown).
      armed.delete(rule.id);
      if (!inCooldown(rule, lastFiredAt, now)) {
        lastFiredAt.set(rule.id, now);
        wake = true;
      }
      continue;
    }

    // showScreen: an active takeover blocks it. The arming is NOT consumed —
    // the rule stays armed and fires at release if its condition still holds.
    if (takeover) continue;

    armed.delete(rule.id); // every outcome below consumes the arming

    if (inCooldown(rule, lastFiredAt, now)) {
      continue; // swallowed by cooldown — not deferred
    }
    if (!renderableScreenIds.has(rule.action.screenId)) {
      continue; // target missing/disabled — cannot fire
    }

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
    // First armed showScreen rule in list order wins; later showScreen
    // rules now hit the `takeover` gate above, later wake rules still fire.
  }

  return {
    next: { initialized: true, prev: current, knownKeys, armed, lastFiredAt, takeover },
    wake,
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
 */
export function releaseTakeover(state: RuleEngineState): RuleEngineState {
  if (!state.takeover) return state;
  return { ...state, takeover: null };
}
