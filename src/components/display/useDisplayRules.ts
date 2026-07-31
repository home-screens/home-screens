'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DisplayRule, Screen } from '@/types/config';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import { createTZDate } from '@/lib/timezone';
import {
  advanceRuleEngine,
  collectRuleSourceKeys,
  createRuleEngineState,
  releaseTakeover,
  rulesContainTimeCondition,
  takeoverDeadline,
  TAKEOVER_SLEEP_OVERRIDE_MS,
  type ActiveTakeover,
} from '@/lib/display-rules';

/** How often the wall-clock tick re-advances the engine while any rule has a
 *  `time` condition — a time-boundary crossing has no state change behind it. */
const TIME_CONDITION_TICK_MS = 30_000;

const NO_RULES: readonly DisplayRule[] = [];

/**
 * Evaluate this display's rules against the shared-state bus and expose the
 * active takeover, if any, as a render source for ScreenRotator.
 *
 * Subscribes to exactly the keys the rules reference (same targeted-
 * subscription pattern as ScreenRenderer), advances the pure engine in
 * `src/lib/display-rules.ts` on every state/config change, and schedules a
 * timer for time-based releases (`for` expiry, `while` min-hold). All firing
 * semantics — edges, cooldown, priority — live in the engine, not here.
 *
 * `allScreens` is the display's OWN full screen list, pre-profile-filter: an
 * alert screen may be deliberately excluded from normal rotation. Disabled
 * screens are never takeover targets (disabled means off, everywhere).
 *
 * `wake`/`sleep`-action firings are reported as the incrementing counters
 * `wakeRequest` / `sleepRequest` rather than invoked as callbacks. This hook
 * has to run ABOVE `useDisplayControl` in ScreenRotator, because it produces
 * the `renderedScreen` that `useDisplayControl` consumes — so it cannot call
 * that hook's `wake`/`forceSleep` directly. Counters make that ordering an
 * ordinary data dependency the caller resolves below, where both are in scope.
 * (This previously went through late-bound refs, which meant reordering the two
 * hook calls left the refs on their no-op initializers and silently stopped
 * `wake`/`sleep` rules from doing anything.)
 *
 * `showScreen` takeovers bump neither counter — ScreenRotator suppresses the
 * sleep overlay for the takeover's duration instead, so scheduled sleep (which
 * the sleep manager re-asserts every 10s) resumes by itself when it ends.
 *
 * `timezone` is the display's configured timezone; `time` conditions are
 * evaluated against it (matching how module/profile schedules resolve their
 * wall clock). When any rule has a `time` condition, a 30s tick re-advances
 * the engine so a boundary crossing flips a rule without a state change.
 */
export function useDisplayRules(
  rules: DisplayRule[] | undefined,
  allScreens: Screen[],
  timezone?: string,
): {
  /** The screen a takeover is currently pinning, or null when rotation owns the render. */
  takeoverScreen: Screen | null;
  /**
   * True while the takeover still outranks the sleep/dim schedule. Goes false
   * TAKEOVER_SLEEP_OVERRIDE_MS after the takeover started, even though
   * `takeoverScreen` stays pinned — so a latching condition cannot hold a
   * display lit indefinitely.
   */
  takeoverOverridesSleep: boolean;
  /** Manual-navigation release (human wins). Safe to call when no takeover is active. */
  releaseActiveTakeover: () => void;
  /**
   * Increments once per `wake`-action firing. Starts at 0, so a caller must
   * act on *changes* rather than on the value being truthy.
   */
  wakeRequest: number;
  /** Increments once per `sleep`-action firing. Same contract as `wakeRequest`. */
  sleepRequest: number;
} {
  const ruleList = rules ?? (NO_RULES as DisplayRule[]);

  // Key list identity only changes when the referenced-key CONTENT changes —
  // a config poll that edits an unrelated module keeps the same subscription.
  const keysJoined = useMemo(() => collectRuleSourceKeys(ruleList).join('\n'), [ruleList]);
  const keys = useMemo(() => (keysJoined ? keysJoined.split('\n') : []), [keysJoined]);
  const states = useSharedStateKeys(keys);

  const renderableScreenIds = useMemo(
    () => new Set(allScreens.filter((s) => s.enabled !== false).map((s) => s.id)),
    [allScreens],
  );

  const engineRef = useRef(createRuleEngineState());
  const [takeover, setTakeover] = useState<ActiveTakeover | null>(null);
  // Bumped by the deadline timer to force a re-advance at `for` expiry /
  // min-hold end, and by the wall-clock tick for `time` conditions — cases
  // where no state or config change would otherwise re-run us.
  const [tick, bumpTick] = useReducer((n: number) => n + 1, 0);

  const [wakeRequest, requestWake] = useReducer((n: number) => n + 1, 0);
  const [sleepRequest, requestSleep] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const nowDate = createTZDate(timezone);
    const { next, wake, sleep } = advanceRuleEngine(
      engineRef.current, ruleList, states, renderableScreenIds, Date.now(), nowDate,
    );
    engineRef.current = next;
    // Unchanged takeovers keep their object identity through the engine, so
    // this setState bails out (Object.is) on the common no-change tick.
    setTakeover(next.takeover);
    if (wake) requestWake();
    if (sleep) requestSleep();

    const deadline = takeoverDeadline(next, ruleList, states, nowDate);
    if (deadline === null) return;
    // +25ms so the woken advance lands past the deadline, not on its edge.
    const timer = setTimeout(bumpTick, Math.max(0, deadline - Date.now()) + 25);
    return () => clearTimeout(timer);
  }, [ruleList, states, renderableScreenIds, timezone, tick]);

  // Wall-clock re-evaluation tick, armed ONLY while a rule has a `time`
  // condition — otherwise the engine advances purely on state/config/deadline
  // changes as before, and no idle timer runs.
  const hasTimeCondition = useMemo(() => rulesContainTimeCondition(ruleList), [ruleList]);
  useEffect(() => {
    if (!hasTimeCondition) return;
    const id = setInterval(bumpTick, TIME_CONDITION_TICK_MS);
    return () => clearInterval(id);
  }, [hasTimeCondition]);

  const releaseActiveTakeover = useCallback(() => {
    engineRef.current = releaseTakeover(engineRef.current);
    setTakeover(null);
  }, []);

  const takeoverScreen = useMemo(() => {
    if (!takeover) return null;
    return allScreens.find((s) => s.id === takeover.screenId && s.enabled !== false) ?? null;
  }, [takeover, allScreens]);

  // Whether the takeover still outranks the sleep/dim schedule. Expires
  // TAKEOVER_SLEEP_OVERRIDE_MS after the takeover started, while the takeover
  // itself keeps its screen pinned — so a latching sensor shows its alert
  // screen and the display still sleeps on schedule.
  //
  // `tick` is in the deps because takeoverDeadline now reports the override
  // expiry as a wake-up point, so the timer that fires there re-renders us and
  // this recomputes to false.
  const takeoverOverridesSleep = useMemo(() => {
    if (!takeover) return false;
    return Date.now() - takeover.startedAt < TAKEOVER_SLEEP_OVERRIDE_MS;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is the deliberate re-evaluation trigger
  }, [takeover, tick]);

  return { takeoverScreen, takeoverOverridesSleep, releaseActiveTakeover, wakeRequest, sleepRequest };
}
