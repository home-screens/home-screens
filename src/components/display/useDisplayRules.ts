'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { DisplayRule, Screen } from '@/types/config';
import { useSharedStateKeys } from '@/hooks/useSharedStateKeys';
import {
  advanceRuleEngine,
  collectRuleSourceKeys,
  createRuleEngineState,
  releaseTakeover,
  takeoverDeadline,
  type ActiveTakeover,
} from '@/lib/display-rules';

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
 * `onWake` fires when a rule with the `wake` action triggers. `showScreen`
 * takeovers do NOT call it — ScreenRotator suppresses the sleep overlay for
 * the takeover's duration instead, so scheduled sleep (which the sleep
 * manager re-asserts every 10s) resumes by itself when the takeover ends.
 */
export function useDisplayRules(
  rules: DisplayRule[] | undefined,
  allScreens: Screen[],
  onWake?: () => void,
): {
  /** The screen a takeover is currently pinning, or null when rotation owns the render. */
  takeoverScreen: Screen | null;
  /** Manual-navigation release (human wins). Safe to call when no takeover is active. */
  releaseActiveTakeover: () => void;
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
  // min-hold end, where no state or config change would otherwise re-run us.
  const [tick, bumpTick] = useReducer((n: number) => n + 1, 0);

  const onWakeRef = useRef(onWake);
  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    const { next, wake } = advanceRuleEngine(
      engineRef.current, ruleList, states, renderableScreenIds, Date.now(),
    );
    engineRef.current = next;
    // Unchanged takeovers keep their object identity through the engine, so
    // this setState bails out (Object.is) on the common no-change tick.
    setTakeover(next.takeover);
    if (wake) onWakeRef.current?.();

    const deadline = takeoverDeadline(next, ruleList, states);
    if (deadline === null) return;
    // +25ms so the woken advance lands past the deadline, not on its edge.
    const timer = setTimeout(bumpTick, Math.max(0, deadline - Date.now()) + 25);
    return () => clearTimeout(timer);
  }, [ruleList, states, renderableScreenIds, tick]);

  const releaseActiveTakeover = useCallback(() => {
    engineRef.current = releaseTakeover(engineRef.current);
    setTakeover(null);
  }, []);

  const takeoverScreen = useMemo(() => {
    if (!takeover) return null;
    return allScreens.find((s) => s.id === takeover.screenId && s.enabled !== false) ?? null;
  }, [takeover, allScreens]);

  return { takeoverScreen, releaseActiveTakeover };
}
