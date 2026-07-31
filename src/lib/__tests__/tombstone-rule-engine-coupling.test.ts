import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sharedStateStore } from '../shared-state-store';
import { advanceRuleEngine, createRuleEngineState } from '../display-rules';
import type { DisplayRule } from '@/types/config';

/**
 * The tombstone grace window in `shared-state-store.ts` and the cold-start
 * guard in `display-rules.ts` are coupled, and neither file's behaviour is
 * wrong on its own. This is the only test that crosses the boundary.
 *
 * A cleared key is tombstoned, not deleted: the entry stays in the map with a
 * `staleAt` mark until TOMBSTONE_TTL_MS elapses. `advanceRuleEngine` derives
 * `knownKeys` from `states.keys()`, so a tombstoned key still counts as known.
 * That makes the TTL the boundary between two user-visible outcomes after a
 * producer restarts:
 *
 *   reload finishes INSIDE the window  -> key never left `knownKeys`
 *                                      -> re-publish is a false->true edge
 *                                      -> the rule FIRES
 *
 *   reload finishes OUTSIDE the window -> key was deleted, condition read
 *                                         'unknown', key is newly-known again
 *                                      -> cold-start guard suppresses arming
 *                                      -> the rule does NOT fire
 *
 * Concretely: "does the doorbell screen come up after I reload the Home
 * Assistant plugin?" is answered by a constant in a different subsystem.
 * Tuning TOMBSTONE_TTL_MS down to make conditioned modules hide faster looks
 * entirely reasonable from that constant's own docblock, and silently flips
 * this behaviour. If you are here because you changed that constant, the
 * change is not necessarily wrong, but it is not local.
 *
 * One refinement worth stating, because it is easy to model wrongly: the TTL
 * only matters when the engine ADVANCES while the key is deleted. Deleting and
 * re-publishing between two advances leaves `knownKeys` unchanged and the rule
 * fires regardless of the TTL. In production the tombstone sweep calls
 * `notify()` on delete, so an expiring tombstone reliably drives that advance —
 * but a test that skips it silently stops testing the coupling.
 */

const KEY = 'plugin:ha:binary_sensor.doorbell';
const SCREENS = new Set(['home', 'cameras']);

const RULE: DisplayRule = {
  id: 'doorbell',
  name: 'Doorbell',
  when: [{ kind: 'state', sourceKey: KEY, equals: 'on' }],
  action: { kind: 'showScreen', screenId: 'cameras', mode: 'for', seconds: 60 },
};

/** Advance the engine against the REAL store, not a hand-built map. */
function advance(state: ReturnType<typeof createRuleEngineState>, now: number) {
  return advanceRuleEngine(state, [RULE], sharedStateStore.snapshot(), SCREENS, now);
}

describe('TOMBSTONE_TTL_MS couples the shared-state store to the rule engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
  });

  afterEach(() => {
    sharedStateStore.__resetForTests();
    vi.useRealTimers();
  });

  it('fires when the producer restarts INSIDE the tombstone window', () => {
    // Baseline: producer is up and the condition is false.
    sharedStateStore.publish(KEY, 'off');
    let state = advance(createRuleEngineState(), 0).next;

    // Producer tears down. The key is tombstoned, still present in the map.
    sharedStateStore.clearKey(KEY);
    expect(sharedStateStore.snapshot().has(KEY)).toBe(true);

    // The engine advances mid-gap, which is what makes the TTL matter at all:
    // suppression needs the engine to OBSERVE the key missing, not merely for
    // it to have been deleted between two advances. In production the deletion
    // itself calls `notify()`, so an expiring tombstone drives exactly this
    // advance. Shorten TOMBSTONE_TTL_MS below 5s and this advance sees the key
    // already gone, which is what flips the outcome.
    vi.advanceTimersByTime(5_000);
    state = advance(state, 5_000).next;
    expect(state.knownKeys.has(KEY)).toBe(true);

    // Reload completes, still inside the grace window.
    sharedStateStore.publish(KEY, 'on');

    // A `showScreen` rule fires by opening a takeover, not by setting `wake`
    // (that flag is for `wake`-action rules).
    const step = advance(state, 6_000);
    state = step.next;
    expect(state.takeover?.screenId).toBe('cameras');
    expect(state.takeover?.ruleId).toBe('doorbell');
  });

  it('does NOT fire when the producer restarts OUTSIDE the tombstone window', () => {
    sharedStateStore.publish(KEY, 'off');
    let state = advance(createRuleEngineState(), 0).next;

    sharedStateStore.clearKey(KEY);

    // Grace window lapses: the tombstone timer really deletes the key.
    vi.advanceTimersByTime(20_000);
    expect(sharedStateStore.snapshot().has(KEY)).toBe(false);

    // The engine observes the gap, so the key leaves `knownKeys`.
    state = advance(state, 20_000).next;
    expect(state.knownKeys.has(KEY)).toBe(false);

    // Producer comes back. Its first publish is a cold start, not an edge.
    sharedStateStore.publish(KEY, 'on');
    const step = advance(state, 21_000);
    expect(step.next.takeover).toBeNull();
  });

  it('treats a tombstoned key as known, which is what makes the two cases differ', () => {
    sharedStateStore.publish(KEY, 'off');
    let state = advance(createRuleEngineState(), 0).next;
    expect(state.knownKeys.has(KEY)).toBe(true);

    sharedStateStore.clearKey(KEY);
    state = advance(state, 1_000).next;

    // Still known while tombstoned. If this ever flips, the first test above
    // stops describing reality and the coupling has changed shape.
    expect(state.knownKeys.has(KEY)).toBe(true);
  });
});
