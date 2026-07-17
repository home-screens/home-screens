import { describe, it, expect } from 'vitest';
import type { DisplayRule } from '@/types/config';
import type { SharedStateEntry } from '@/lib/shared-state-types';
import {
  MIN_WHILE_HOLD_MS,
  advanceRuleEngine,
  collectRuleSourceKeys,
  createRuleEngineState,
  evaluateRuleCondition,
  releaseTakeover,
  rulesContainTimeCondition,
  takeoverDeadline,
  type RuleEngineState,
} from '@/lib/display-rules';

const KEY = 'plugin:ha:binary_sensor.doorbell';
const KEY2 = 'plugin:ha:binary_sensor.smoke';

function states(entries: Record<string, string>): ReadonlyMap<string, SharedStateEntry> {
  const map = new Map<string, SharedStateEntry>();
  for (const [key, value] of Object.entries(entries)) {
    map.set(key, { value, updatedAt: 0 } as unknown as SharedStateEntry);
  }
  return map;
}

function makeRule(overrides: Partial<DisplayRule> & { id: string }): DisplayRule {
  return {
    name: overrides.id,
    when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 },
    ...overrides,
  };
}

const SCREENS = new Set(['home', 'cameras', 'security']);

/** Run one advance and return the step; keeps tests readable. */
function step(
  state: RuleEngineState,
  rules: DisplayRule[],
  entries: Record<string, string>,
  now: number,
  screens: ReadonlySet<string> = SCREENS,
) {
  return advanceRuleEngine(state, rules, states(entries), screens, now);
}

/** Initialize an engine with the given baseline condition values. */
function boot(rules: DisplayRule[], entries: Record<string, string>, now = 0): RuleEngineState {
  return step(createRuleEngineState(), rules, entries, now).next;
}

describe('evaluateRuleCondition', () => {
  it('is false for an empty condition tree (a blank rule never fires)', () => {
    const rule = makeRule({ id: 'r', when: [] });
    expect(evaluateRuleCondition(rule, states({ [KEY]: 'on' }))).toBe(false);
  });

  it('reports unpublished keys as unknown, published values as definite', () => {
    const rule = makeRule({ id: 'r' });
    expect(evaluateRuleCondition(rule, states({}))).toBe('unknown');
    expect(evaluateRuleCondition(rule, states({ [KEY]: 'on' }))).toBe(true);
    expect(evaluateRuleCondition(rule, states({ [KEY]: 'off' }))).toBe(false);
  });

  it('resolves compound trees with Kleene semantics over unknown keys', () => {
    const orRule = makeRule({ id: 'or', when: [{ kind: 'or', conditions: [
      { kind: 'state', sourceKey: KEY, equals: 'on' },
      { kind: 'state', sourceKey: KEY2, equals: 'on' },
    ] }] });
    // One branch definitively true → true, even with the other key unpublished.
    expect(evaluateRuleCondition(orRule, states({ [KEY]: 'on' }))).toBe(true);
    // One branch false, the other unpublished → could still be true → unknown.
    expect(evaluateRuleCondition(orRule, states({ [KEY]: 'off' }))).toBe('unknown');
    expect(evaluateRuleCondition(orRule, states({ [KEY]: 'off', [KEY2]: 'off' }))).toBe(false);

    const andRule = makeRule({ id: 'and', when: [{ kind: 'and', conditions: [
      { kind: 'state', sourceKey: KEY, equals: 'on' },
      { kind: 'numeric', sourceKey: KEY2, above: 10 },
    ] }] });
    // One branch definitively false → false, regardless of the unknown.
    expect(evaluateRuleCondition(andRule, states({ [KEY]: 'off' }))).toBe(false);
    expect(evaluateRuleCondition(andRule, states({ [KEY]: 'on' }))).toBe('unknown');
    expect(evaluateRuleCondition(andRule, states({ [KEY]: 'on', [KEY2]: '42' }))).toBe(true);

    const notRule = makeRule({ id: 'not', when: [{ kind: 'not', conditions: [
      { kind: 'state', sourceKey: KEY, equals: 'on' },
    ] }] });
    // `not` never launders an unknown into a definite value.
    expect(evaluateRuleCondition(notRule, states({}))).toBe('unknown');
    expect(evaluateRuleCondition(notRule, states({ [KEY]: 'on' }))).toBe(false);
    expect(evaluateRuleCondition(notRule, states({ [KEY]: 'off' }))).toBe(true);
  });
});

describe('a hand-edited rule missing `when`', () => {
  // A config.json edited by hand can drop `when` entirely. Every engine
  // function that reads it must treat a missing tree as the empty tree
  // rather than dereferencing undefined and black-screening the kiosk.
  const noWhen = { id: 'broken', name: 'broken', action: { kind: 'wake' } } as unknown as DisplayRule;

  it('evaluates as false (never fires) instead of throwing', () => {
    expect(evaluateRuleCondition(noWhen, states({ [KEY]: 'on' }))).toBe(false);
  });

  it('contributes no source keys and no time condition', () => {
    expect(collectRuleSourceKeys([noWhen])).toEqual([]);
    expect(rulesContainTimeCondition([noWhen])).toBe(false);
  });

  it('advances the engine without throwing and never fires', () => {
    const booted = boot([noWhen], { [KEY]: 'on' });
    const next = step(booted, [noWhen], { [KEY]: 'on' }, 1_000);
    expect(next.wake).toBe(false);
    expect(next.next.takeover).toBeNull();
  });
});

describe('collectRuleSourceKeys', () => {
  it('collects nested keys deduped and sorted, skipping disabled rules and empty keys', () => {
    const rules: DisplayRule[] = [
      makeRule({ id: 'a', when: [{ kind: 'or', conditions: [
        { kind: 'state', sourceKey: KEY2, equals: 'on' },
        { kind: 'numeric', sourceKey: KEY, above: 1 },
        { kind: 'state', sourceKey: '', equals: 'x' },
      ] }] }),
      makeRule({ id: 'b' }),
      makeRule({ id: 'c', enabled: false, when: [{ kind: 'state', sourceKey: 'plugin:ha:zzz', equals: 'on' }] }),
    ];
    expect(collectRuleSourceKeys(rules)).toEqual([KEY, KEY2]);
  });
});

describe('advanceRuleEngine — edges and boot', () => {
  it('does not fire for a rule already true at boot; fires on the next fresh edge', () => {
    const rule = makeRule({ id: 'r' });
    let state = boot([rule], { [KEY]: 'on' });
    expect(state.takeover).toBeNull();

    // Still true — no edge, no fire.
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();

    // Goes false, then true — a fresh edge fires.
    state = step(state, [rule], { [KEY]: 'off' }, 2_000).next;
    const fired = step(state, [rule], { [KEY]: 'on' }, 3_000).next;
    expect(fired.takeover).toMatchObject({
      ruleId: 'r', screenId: 'cameras', mode: 'for', startedAt: 3_000, until: 63_000,
    });
  });

  it('does not fire on unknown→true (provider cold start publishing an already-true state)', () => {
    const rule = makeRule({ id: 'r' });
    // Boot with the key unpublished — the provider hasn't published yet.
    let state = boot([rule], {});
    // The provider's first publish arrives true: not a firing edge.
    state = step(state, [rule], { [KEY]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();
    // Only a KNOWN false → true transition fires.
    state = step(state, [rule], { [KEY]: 'off' }, 3_000).next;
    state = step(state, [rule], { [KEY]: 'on' }, 4_000).next;
    expect(state.takeover).not.toBeNull();
  });

  it('does not fire when the key goes unknown and returns true (purge + republish)', () => {
    const rule = makeRule({ id: 'r' });
    let state = boot([rule], { [KEY]: 'off' });
    // Key tombstone-expires (removed from the snapshot) while the provider is down.
    state = step(state, [rule], {}, 1_000).next;
    // Provider returns and publishes true — stale event, no fire.
    state = step(state, [rule], { [KEY]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();
  });

  it('does not fire a disabled rule on an edge', () => {
    const rule = makeRule({ id: 'r', enabled: false });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();
  });

  it('re-enabling a rule whose condition stayed true does not fire (no fresh edge)', () => {
    const disabled = makeRule({ id: 'r', enabled: false });
    const enabled = makeRule({ id: 'r' });
    let state = boot([disabled], { [KEY]: 'off' });
    state = step(state, [disabled], { [KEY]: 'on' }, 1_000).next;
    state = step(state, [enabled], { [KEY]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();
  });

  it('does not fire when the target screen is missing or disabled', () => {
    const rule = makeRule({ id: 'r' });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000, new Set(['home'])).next;
    expect(state.takeover).toBeNull();
    // The arming was consumed — a later screens fix does not retro-fire.
    state = step(state, [rule], { [KEY]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();
  });
});

describe('advanceRuleEngine — partial knowledge (compound trees)', () => {
  const orRule = makeRule({ id: 'or', when: [{ kind: 'or', conditions: [
    { kind: 'state', sourceKey: KEY, equals: 'on' },
    { kind: 'state', sourceKey: KEY2, equals: 'on' },
  ] }] });

  it('an OR rule fires off one known branch when the other key never published', () => {
    // The CO sensor (KEY2) never publishes; only the smoke sensor (KEY) exists.
    let state = boot([orRule], { [KEY]: 'off' }); // tree unknown (KEY2 unpublished)
    state = step(state, [orRule], { [KEY]: 'on' }, 1_000).next;
    // unknown→true, but no key arrived — the change came from a known key. Fires.
    expect(state.takeover).toMatchObject({ ruleId: 'or' });
  });

  it('an OR rule does not fire when the truth arrives with a key\'s first publish', () => {
    let state = boot([orRule], { [KEY]: 'off' });
    // KEY2's first publish lands true: the tree turns true by ARRIVAL, not
    // by a known-key change — boot/cold-start safety, no fire.
    state = step(state, [orRule], { [KEY]: 'off', [KEY2]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();
    // A later real edge on the now-known key fires.
    state = step(state, [orRule], { [KEY]: 'off', [KEY2]: 'off' }, 2_000).next;
    state = step(state, [orRule], { [KEY]: 'off', [KEY2]: 'on' }, 3_000).next;
    expect(state.takeover).not.toBeNull();
  });

  it('an AND rule stays unknown (never fires) until every branch is decidable', () => {
    const andRule = makeRule({ id: 'and', when: [{ kind: 'and', conditions: [
      { kind: 'state', sourceKey: KEY, equals: 'on' },
      { kind: 'state', sourceKey: KEY2, equals: 'on' },
    ] }] });
    let state = boot([andRule], { [KEY]: 'off' });
    state = step(state, [andRule], { [KEY]: 'on' }, 1_000).next; // unknown — KEY2 missing
    expect(state.takeover).toBeNull();
    // KEY2 arrives true → tree true by arrival → no fire.
    state = step(state, [andRule], { [KEY]: 'on', [KEY2]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();
    // Fresh edge on a known key fires.
    state = step(state, [andRule], { [KEY]: 'on', [KEY2]: 'off' }, 3_000).next;
    state = step(state, [andRule], { [KEY]: 'on', [KEY2]: 'on' }, 4_000).next;
    expect(state.takeover).not.toBeNull();
  });

  it('a purge and true republish inside an OR does not fire (cold-start safety)', () => {
    let state = boot([orRule], { [KEY]: 'off', [KEY2]: 'off' });
    // KEY tombstone-expires while its provider is down → tree goes unknown.
    state = step(state, [orRule], { [KEY2]: 'off' }, 1_000).next;
    // The provider returns and publishes true — arrival, not an edge.
    state = step(state, [orRule], { [KEY]: 'on', [KEY2]: 'off' }, 2_000).next;
    expect(state.takeover).toBeNull();
  });

  it('a rule added to the list mid-flight is a baseline, not an edge', () => {
    const existing = makeRule({ id: 'existing' });
    let state = boot([existing], { [KEY]: 'on' });
    // A new rule whose condition is ALREADY true appears (user just saved it).
    const added = makeRule({ id: 'added', when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] });
    state = step(state, [existing, added], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();
    // It fires only from its own fresh edge.
    state = step(state, [existing, added], { [KEY]: 'off' }, 2_000).next;
    state = step(state, [existing, added], { [KEY]: 'on' }, 3_000).next;
    expect(state.takeover).not.toBeNull();
  });
});

describe('advanceRuleEngine — for mode and cooldown', () => {
  it('releases a for-mode takeover at its deadline and does not re-fire while still true', () => {
    const rule = makeRule({ id: 'r' });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).not.toBeNull();

    // Before the deadline the takeover holds.
    state = step(state, [rule], { [KEY]: 'on' }, 30_000).next;
    expect(state.takeover).not.toBeNull();

    // At the deadline it releases; the still-true condition is not an edge.
    state = step(state, [rule], { [KEY]: 'on' }, 61_000).next;
    expect(state.takeover).toBeNull();
    state = step(state, [rule], { [KEY]: 'on' }, 62_000).next;
    expect(state.takeover).toBeNull();
  });

  it('swallows edges inside the cooldown window and fires after it', () => {
    const rule = makeRule({ id: 'r', cooldownSeconds: 120, action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 10 } });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover?.startedAt).toBe(1_000);

    // Takeover expires at 11s; a repeat press at 30s is inside the cooldown.
    state = step(state, [rule], { [KEY]: 'off' }, 12_000).next;
    expect(state.takeover).toBeNull();
    state = step(state, [rule], { [KEY]: 'on' }, 30_000).next;
    expect(state.takeover).toBeNull();

    // The swallowed edge is not deferred: still true after the cooldown does not fire.
    state = step(state, [rule], { [KEY]: 'on' }, 130_000).next;
    expect(state.takeover).toBeNull();

    // A fresh edge after the cooldown fires.
    state = step(state, [rule], { [KEY]: 'off' }, 140_000).next;
    state = step(state, [rule], { [KEY]: 'on' }, 150_000).next;
    expect(state.takeover?.startedAt).toBe(150_000);
  });
});

describe('advanceRuleEngine — while mode and min hold', () => {
  const rule = makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'security', mode: 'while' } });

  it('holds while the condition is true and releases when it clears after the min hold', () => {
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).toMatchObject({ mode: 'while', screenId: 'security' });
    expect(state.takeover?.until).toBeUndefined();

    // Condition still true long past the hold — pinned.
    state = step(state, [rule], { [KEY]: 'on' }, 600_000).next;
    expect(state.takeover).not.toBeNull();

    // Condition clears — releases (hold long elapsed).
    state = step(state, [rule], { [KEY]: 'off' }, 601_000).next;
    expect(state.takeover).toBeNull();
  });

  it('rides out a flap shorter than the min hold', () => {
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;

    // Condition drops 2s in — still inside the 5s min hold.
    state = step(state, [rule], { [KEY]: 'off' }, 3_000).next;
    expect(state.takeover).not.toBeNull();

    // Condition comes back — takeover simply continues.
    state = step(state, [rule], { [KEY]: 'on' }, 4_000).next;
    expect(state.takeover).not.toBeNull();

    // Drops again after the hold — releases.
    state = step(state, [rule], { [KEY]: 'off' }, 1_000 + MIN_WHILE_HOLD_MS).next;
    expect(state.takeover).toBeNull();
  });

  it('releases at the min-hold deadline when the condition dropped early', () => {
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    state = step(state, [rule], { [KEY]: 'off' }, 2_000).next;
    expect(state.takeover).not.toBeNull();
    expect(takeoverDeadline(state, [rule], states({ [KEY]: 'off' }))).toBe(1_000 + MIN_WHILE_HOLD_MS);

    state = step(state, [rule], { [KEY]: 'off' }, 1_000 + MIN_WHILE_HOLD_MS).next;
    expect(state.takeover).toBeNull();
  });

  it('the flap that rode out the min hold does not re-fire the rule (no fresh edge processed as new)', () => {
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    const firstStart = state.takeover?.startedAt;
    state = step(state, [rule], { [KEY]: 'off' }, 2_000).next;
    state = step(state, [rule], { [KEY]: 'on' }, 3_000).next;
    // Same takeover, not a re-fire.
    expect(state.takeover?.startedAt).toBe(firstStart);
  });
});

describe('advanceRuleEngine — priority and blocking', () => {
  const doorbell = makeRule({ id: 'doorbell', action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 } });
  const smoke = makeRule({
    id: 'smoke',
    when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
    action: { kind: 'showScreen', screenId: 'security', mode: 'while' },
  });

  it('fires the first rule in list order when two edge true together', () => {
    let state = boot([smoke, doorbell], { [KEY]: 'off', [KEY2]: 'off' });
    state = step(state, [smoke, doorbell], { [KEY]: 'on', [KEY2]: 'on' }, 1_000).next;
    expect(state.takeover?.ruleId).toBe('smoke');
  });

  it('never preempts an active takeover; the armed later rule fires at release', () => {
    let state = boot([doorbell, smoke], { [KEY]: 'off', [KEY2]: 'off' });
    // Doorbell fires first.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    expect(state.takeover?.ruleId).toBe('doorbell');

    // Smoke edges true mid-takeover — armed but blocked, even though it is
    // EARLIER in priority than nothing (doorbell holds).
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 10_000).next;
    expect(state.takeover?.ruleId).toBe('doorbell');

    // Doorbell expires; smoke (still true, still armed) fires on the same advance.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 61_100).next;
    expect(state.takeover?.ruleId).toBe('smoke');
  });

  it('drops the arming when the blocked rule went false before release', () => {
    let state = boot([doorbell, smoke], { [KEY]: 'off', [KEY2]: 'off' });
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    // Smoke pulses on and off during the doorbell takeover.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 10_000).next;
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 20_000).next;
    // At release, nothing fires — the moment passed.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 61_100).next;
    expect(state.takeover).toBeNull();
  });
});

describe('advanceRuleEngine — wake action', () => {
  it('signals wake without taking over the render, and later rules can still fire', () => {
    const wakeRule = makeRule({ id: 'wake', action: { kind: 'wake' } });
    const show = makeRule({
      id: 'show',
      when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }],
      action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 5 },
    });
    let state = boot([wakeRule, show], { [KEY]: 'off' });
    const result = step(state, [wakeRule, show], { [KEY]: 'on' }, 1_000);
    expect(result.wake).toBe(true);
    expect(result.next.takeover?.ruleId).toBe('show');
    state = result.next;

    // Wake respects its own cooldown independently.
    const cooled = makeRule({ id: 'wake', action: { kind: 'wake' }, cooldownSeconds: 300 });
    state = step(state, [cooled, show], { [KEY]: 'off' }, 10_000).next;
    const again = step(state, [cooled, show], { [KEY]: 'on' }, 20_000);
    expect(again.wake).toBe(false); // 19s since last wake fire, inside 300s cooldown
  });

  it('fires a wake rule immediately even while a showScreen takeover is active', () => {
    const show = makeRule({ id: 'show' }); // for-mode 60s on KEY
    const wakeRule = makeRule({
      id: 'wake',
      when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
      action: { kind: 'wake' },
    });
    let state = boot([show, wakeRule], { [KEY]: 'off', [KEY2]: 'off' });
    state = step(state, [show, wakeRule], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    expect(state.takeover?.ruleId).toBe('show');

    // The wake edge lands mid-takeover: waking doesn't contend for the
    // render, so it must not queue behind the takeover's 60s hold.
    const result = step(state, [show, wakeRule], { [KEY]: 'on', [KEY2]: 'on' }, 10_000);
    expect(result.wake).toBe(true);
    expect(result.next.takeover?.ruleId).toBe('show'); // takeover untouched
    // And the arming was consumed — release does not replay the wake.
    const atRelease = step(result.next, [show, wakeRule], { [KEY]: 'on', [KEY2]: 'on' }, 61_100);
    expect(atRelease.wake).toBe(false);
  });
});

describe('advanceRuleEngine — sleep action', () => {
  it('signals sleep on a fresh edge and respects its own cooldown', () => {
    const sleepRule = makeRule({ id: 'sleep', action: { kind: 'sleep' }, cooldownSeconds: 300 });
    let state = boot([sleepRule], { [KEY]: 'off' });
    const fired = step(state, [sleepRule], { [KEY]: 'on' }, 1_000);
    expect(fired.sleep).toBe(true);
    expect(fired.wake).toBe(false);
    state = fired.next;

    // Re-edge inside the cooldown is swallowed.
    state = step(state, [sleepRule], { [KEY]: 'off' }, 10_000).next;
    const again = step(state, [sleepRule], { [KEY]: 'on' }, 20_000);
    expect(again.sleep).toBe(false);
  });

  it('ends an active takeover when a sleep rule fires (sleep wins)', () => {
    const show = makeRule({ id: 'show' }); // for-mode 60s on KEY
    const sleepRule = makeRule({
      id: 'sleep',
      when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
      action: { kind: 'sleep' },
    });
    let state = boot([show, sleepRule], { [KEY]: 'off', [KEY2]: 'off' });
    // showScreen takes over first.
    state = step(state, [show, sleepRule], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    expect(state.takeover?.ruleId).toBe('show');

    // Sleep edge lands mid-takeover — the takeover is released so the display
    // genuinely blacks out, never a sleep overlay over a live takeover render.
    const result = step(state, [show, sleepRule], { [KEY]: 'on', [KEY2]: 'on' }, 10_000);
    expect(result.sleep).toBe(true);
    expect(result.next.takeover).toBeNull();
  });

  it('wins regardless of rule order, even when a showScreen edges in the same advance', () => {
    // sleep rule listed AFTER the showScreen rule; both edge true this advance.
    const show = makeRule({
      id: 'show',
      when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }],
      action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' },
    });
    const sleepRule = makeRule({
      id: 'sleep',
      when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
      action: { kind: 'sleep' },
    });
    const state = boot([show, sleepRule], { [KEY]: 'off', [KEY2]: 'off' });
    const result = step(state, [show, sleepRule], { [KEY]: 'on', [KEY2]: 'on' }, 1_000);
    expect(result.sleep).toBe(true);
    expect(result.next.takeover).toBeNull();
  });
});

describe('advanceRuleEngine — time conditions', () => {
  const at = (day: number, h: number, m = 0) => new Date(2026, 2, 8 + day, h, m);

  it('fences a rule by the wall clock via the nowDate argument', () => {
    // Fires only when both the state edge AND the time window hold.
    const rule = makeRule({
      id: 'daytime',
      when: [
        { kind: 'state', sourceKey: KEY, equals: 'on' },
        { kind: 'time', startTime: '07:00', endTime: '21:00' },
      ],
      action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 5 },
    });
    // Boot at night with the state off.
    let state = advanceRuleEngine(
      createRuleEngineState(), [rule], states({ [KEY]: 'off' }), SCREENS, 0, at(1, 2)).next;

    // Edge to on, but still night → the time condition blocks the fire.
    const night = advanceRuleEngine(state, [rule], states({ [KEY]: 'on' }), SCREENS, 1_000, at(1, 2));
    expect(night.next.takeover).toBeNull();
    state = night.next;

    // Same on-state, now daytime (a pure clock tick, no state change) → fires.
    const day = advanceRuleEngine(state, [rule], states({ [KEY]: 'on' }), SCREENS, 60_000, at(1, 12));
    expect(day.next.takeover?.ruleId).toBe('daytime');
  });

  it('rulesContainTimeCondition detects time conditions in enabled rules only', () => {
    const timeRule = makeRule({ id: 't', when: [{ kind: 'time', startTime: '07:00' }] });
    const stateRule = makeRule({ id: 's' });
    expect(rulesContainTimeCondition([stateRule])).toBe(false);
    expect(rulesContainTimeCondition([timeRule])).toBe(true);
    expect(rulesContainTimeCondition([{ ...timeRule, enabled: false }])).toBe(false);
  });
});

describe('takeover lifecycle — deletion and manual release', () => {
  it('releases immediately when the target screen disappears mid-takeover', () => {
    const rule = makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).not.toBeNull();
    state = step(state, [rule], { [KEY]: 'on' }, 2_000, new Set(['home'])).next;
    expect(state.takeover).toBeNull();
  });

  it('releases immediately when the firing rule is deleted — a config edit is not a flap', () => {
    const rule = makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).not.toBeNull();
    state = step(state, [], {}, 2_000).next; // deleted — releases inside the min hold
    expect(state.takeover).toBeNull();
  });

  it('releases a for-mode takeover immediately when its rule is disabled or deleted', () => {
    const rule = makeRule({ id: 'r' }); // for-mode, 60s
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).not.toBeNull();

    // Disabling the misfiring rule kills its takeover now, not at the deadline.
    const disabled = makeRule({ id: 'r', enabled: false });
    state = step(state, [disabled], { [KEY]: 'on' }, 2_000).next;
    expect(state.takeover).toBeNull();

    // Same for deletion.
    let state2 = boot([rule], { [KEY]: 'off' });
    state2 = step(state2, [rule], { [KEY]: 'on' }, 1_000).next;
    state2 = step(state2, [], {}, 2_000).next;
    expect(state2.takeover).toBeNull();
  });

  it('disabling an armed-but-blocked rule drops its arming', () => {
    const doorbell = makeRule({ id: 'doorbell' }); // for-mode, 60s
    const smoke = makeRule({
      id: 'smoke',
      when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
      action: { kind: 'showScreen', screenId: 'security', mode: 'while' },
    });
    let state = boot([doorbell, smoke], { [KEY]: 'off', [KEY2]: 'off' });
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    // Smoke arms behind the doorbell takeover, then the user disables it.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 10_000).next;
    const smokeOff = makeRule({ ...smoke, enabled: false });
    state = step(state, [doorbell, smokeOff], { [KEY]: 'on', [KEY2]: 'on' }, 20_000).next;
    // At the doorbell's release, the disabled rule must not fire.
    state = step(state, [doorbell, smokeOff], { [KEY]: 'on', [KEY2]: 'on' }, 61_100).next;
    expect(state.takeover).toBeNull();
  });

  it('manual release ends the takeover and the rule does not reassert while still true', () => {
    const rule = makeRule({ id: 'r', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } });
    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).not.toBeNull();

    state = releaseTakeover(state);
    expect(state.takeover).toBeNull();

    // Condition still true — no reassertion.
    state = step(state, [rule], { [KEY]: 'on' }, 60_000).next;
    expect(state.takeover).toBeNull();

    // Fresh edge fires again.
    state = step(state, [rule], { [KEY]: 'off' }, 61_000).next;
    state = step(state, [rule], { [KEY]: 'on' }, 62_000).next;
    expect(state.takeover).not.toBeNull();
  });

  it('manual release disarms a second rule waiting behind the takeover', () => {
    const doorbell = makeRule({ id: 'doorbell', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } });
    const smoke = makeRule({
      id: 'smoke',
      when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }],
      action: { kind: 'showScreen', screenId: 'security', mode: 'while' },
    });
    let state = boot([doorbell, smoke], { [KEY]: 'off', [KEY2]: 'off' });
    // Doorbell fires and holds.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 1_000).next;
    expect(state.takeover?.ruleId).toBe('doorbell');
    // Smoke edges true mid-takeover — armed but blocked.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 2_000).next;
    expect(state.takeover?.ruleId).toBe('doorbell');
    expect(state.armed.has('smoke')).toBe(true);

    // Human navigates: manual release clears the takeover AND the armed smoke,
    // so the display doesn't reassert against the person on the next advance.
    state = releaseTakeover(state);
    expect(state.takeover).toBeNull();
    expect(state.armed.has('smoke')).toBe(false);

    // Smoke still true → does NOT re-take the display.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 3_000).next;
    expect(state.takeover).toBeNull();

    // A genuinely new event (smoke goes false then true) re-fires on its own edge.
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'off' }, 4_000).next;
    state = step(state, [doorbell, smoke], { [KEY]: 'on', [KEY2]: 'on' }, 5_000).next;
    expect(state.takeover?.ruleId).toBe('smoke');
  });
});

describe('advanceRuleEngine — condition content edits', () => {
  it('does not fire when a blank rule\'s condition is edited into an already-true state', () => {
    const blank = makeRule({ id: 'r', when: [] });
    // Baseline: empty when evaluates false, even though the key is already on.
    let state = boot([blank], { [KEY]: 'on' });
    // The user picks a key+value the entity is currently in; autosave streams
    // the edited rule to the display. The content changed, so this is a
    // re-baseline, not a false->true edge.
    const edited = makeRule({ id: 'r', when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] });
    state = step(state, [edited], { [KEY]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();
  });

  it('fires a genuine false->true edge after the condition was edited into a true state', () => {
    const blank = makeRule({ id: 'r', when: [] });
    let state = boot([blank], { [KEY]: 'on' });
    const edited = makeRule({ id: 'r', when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] });
    state = step(state, [edited], { [KEY]: 'on' }, 1_000).next; // re-baseline
    expect(state.takeover).toBeNull();

    // With the condition now settled, a real edge on the same (unchanged) rule fires.
    state = step(state, [edited], { [KEY]: 'off' }, 2_000).next;
    state = step(state, [edited], { [KEY]: 'on' }, 3_000).next;
    expect(state.takeover).not.toBeNull();
  });

  it('does not fire when a rule\'s condition is edited from one true state to another', () => {
    const original = makeRule({ id: 'r', when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }] });
    let state = boot([original], { [KEY]: 'on' }); // true baseline
    // Edit the match to a different value the key is currently in — still true.
    const edited = makeRule({ id: 'r', when: [{ kind: 'state', sourceKey: KEY, equals: 'active' }] });
    state = step(state, [edited], { [KEY]: 'active' }, 1_000).next;
    expect(state.takeover).toBeNull();
  });

  it('re-baselines a rule whose condition edit lands on an unknown->true (edited key never published)', () => {
    // The edited condition references a key that is not in the snapshot: the
    // tree is unknown at the edit advance, then the key publishes true. Because
    // the content changed, the edit advance re-baselines rather than arming.
    const blank = makeRule({ id: 'r', when: [] });
    let state = boot([blank], {});
    const edited = makeRule({ id: 'r', when: [{ kind: 'state', sourceKey: KEY2, equals: 'on' }] });
    state = step(state, [edited], { [KEY2]: 'on' }, 1_000).next;
    expect(state.takeover).toBeNull();
  });
});

describe('takeoverDeadline', () => {
  it('is null with no takeover, the until for for-mode, and null for a held while-mode', () => {
    const rule = makeRule({ id: 'r' });
    expect(takeoverDeadline(createRuleEngineState(), [rule], states({}))).toBeNull();

    let state = boot([rule], { [KEY]: 'off' });
    state = step(state, [rule], { [KEY]: 'on' }, 1_000).next;
    expect(takeoverDeadline(state, [rule], states({ [KEY]: 'on' }))).toBe(61_000);

    const whileRule = makeRule({ id: 'w', action: { kind: 'showScreen', screenId: 'cameras', mode: 'while' } });
    let ws = boot([whileRule], { [KEY]: 'off' });
    ws = step(ws, [whileRule], { [KEY]: 'on' }, 1_000).next;
    expect(takeoverDeadline(ws, [whileRule], states({ [KEY]: 'on' }))).toBeNull();
    expect(takeoverDeadline(ws, [whileRule], states({ [KEY]: 'off' }))).toBe(1_000 + MIN_WHILE_HOLD_MS);
  });
});
