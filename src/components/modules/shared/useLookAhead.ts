'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { holdRotationFor } from '@/lib/interaction-hold';
import { useOwnedSwipe, type OwnedSwipeProps } from './useOwnedSwipe';
import { WALL_SCROLL_IDLE_MS } from '@/lib/wall-scroll';
import { clampLookAhead, lookAheadAnchor, type LookAheadStep } from '@/lib/look-ahead';
import { BROWSE_ROTATION_HOLD_MS } from '@/components/display/useTapRotationHold';
import { useRotation } from '@/components/display/rotation-context';
import { useLookAheadStore } from '@/stores/look-ahead-store';

/** How long "The wall goes up to 8 weeks ahead" stays after a tap past the end. */
export const LOOK_AHEAD_LIMIT_NOTICE_MS = 4_000;

/** What a module's root takes so a sideways swipe on it steps the week (`useOwnedSwipe`). */
export type LookAheadRootProps = OwnedSwipeProps;

export interface LookAhead {
  /** The arrows show: taps on, on a real display, in a view that steps. */
  on: boolean;
  step: LookAheadStep | null;
  /** Taps away from now; 0 at rest. */
  offset: number;
  away: boolean;
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
  /** Straight back to now (the This week button). */
  home: () => void;
  /** Any touch on the module: while away, someone is reading, so the minute starts again. */
  touched: () => void;
  /** The day the view draws from: `today` at rest. */
  anchor: Date;
  /** An arrow (or a swipe) went past the end of the reach a moment ago: which end. */
  limit: 'back' | 'forward' | null;
  /** For the module's root: a sideways swipe steps the week, and any touch keeps it there. */
  rootProps: LookAheadRootProps;
}

/**
 * Look-ahead arrows' state for one module: a step back or forward holds the
 * screen and starts a minute (`WALL_SCROLL_IDLE_MS`, the same minute a
 * scrolled list waits) after which it slides back to now. A screen change
 * comes back to now too: the rotator unmounts the old screen's modules, and
 * a module shown on every screen resets on the screen id.
 *
 * `reach` is for a calendar: while it is away, the days the arrows can bring
 * into view are registered with the display's shared calendar fetch
 * (`useLookAheadStore`), all at once so further taps fetch nothing.
 *
 * `reachNow` is for a calendar showing a view borrowed from the wall's
 * buttons: the days that view draws at rest, registered for as long as they
 * are passed, whether or not the view steps and wherever the arrows are. The
 * shared fetch only knows the saved view, so without it a borrowed Month
 * would draw with the saved view's week of events.
 */
export function useLookAhead({ step: stepIn, enabled, today, moduleId, reach, reachNow = null }: {
  step: LookAheadStep | null;
  enabled: boolean;
  today: Date;
  moduleId?: string;
  reach?: (step: LookAheadStep) => { start: Date; end: Date };
  reachNow?: { start: Date; end: Date } | null;
}): LookAhead {
  // Callers may build the step each render (`daySteps`); keep one object per distinct step.
  const stepKey = stepIn ? `${stepIn.unit}:${stepIn.count}:${stepIn.back}:${stepIn.forward}` : '';
  const stepRef = useRef(stepIn);
  if ((stepRef.current ? `${stepRef.current.unit}:${stepRef.current.count}:${stepRef.current.back}:${stepRef.current.forward}` : '') !== stepKey) stepRef.current = stepIn;
  const step = stepRef.current;
  const on = enabled && step !== null;
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  offsetRef.current = offset;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [limit, setLimit] = useState<'back' | 'forward' | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLimit = useCallback((end: 'back' | 'forward' | null) => {
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = end ? setTimeout(() => setLimit(null), LOOK_AHEAD_LIMIT_NOTICE_MS) : null;
    setLimit(end);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const home = useCallback(() => {
    clearTimer();
    showLimit(null);
    setOffset(0);
  }, [clearTimer, showLimit]);
  const keepAway = useCallback(() => {
    holdRotationFor(BROWSE_ROTATION_HOLD_MS);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setOffset(0);
    }, WALL_SCROLL_IDLE_MS);
  }, [clearTimer]);

  const move = useCallback((by: 1 | -1) => {
    if (!step) return;
    const next = clampLookAhead(offsetRef.current + by, step);
    if (next === offsetRef.current) {
      // Past the end: say how far the wall goes rather than doing nothing.
      showLimit(by > 0 ? 'forward' : 'back');
      if (next !== 0) keepAway();
      return;
    }
    showLimit(null);
    setOffset(next);
    if (next === 0) clearTimer();
    else keepAway();
  }, [step, keepAway, clearTimer, showLimit]);
  const back = useCallback(() => move(-1), [move]);
  const forward = useCallback(() => move(1), [move]);
  const touched = useCallback(() => {
    if (offsetRef.current !== 0) keepAway();
  }, [keepAway]);

  // Taps switched off or another view picked: back to now.
  useEffect(() => { home(); }, [on, stepKey, home]);
  // A module shown on every screen stays mounted through a screen change.
  const screenId = useRotation()?.activeScreenId ?? null;
  useEffect(() => { home(); }, [screenId, home]);
  useEffect(() => () => {
    clearTimer();
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
  }, [clearTimer]);

  // While away, a touch anywhere on the screen means someone is at the wall
  // (reading this, or using the meal plan beside it), so the minute starts
  // again for every stepped module on it, not only the one touched.
  const away = on && offset !== 0;
  useEffect(() => {
    if (!away) return;
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', touched, opts);
    return () => window.removeEventListener('pointerdown', touched, opts);
  }, [away, touched]);

  // A sideways swipe on the module steps the week: left for later, right for
  // earlier. A vertical scroll cancels the pointer.
  const rootProps: LookAheadRootProps = useOwnedSwipe(on, forward, back, touched);

  // Stepped away and borrowed at once: both together, so coming back to now
  // narrows to the borrowed view's days rather than dropping them.
  const spans = [away && step && reach ? reach(step) : null, reachNow].filter((s) => s !== null);
  const spanStart = spans.length > 0 ? Math.min(...spans.map((s) => s.start.getTime())) : null;
  const spanEnd = spans.length > 0 ? Math.max(...spans.map((s) => s.end.getTime())) : null;
  // One write per change, never a clear followed by a set: a gap would send
  // the shared fetch back to its at-rest address for a moment.
  useEffect(() => {
    if (!moduleId) return;
    useLookAheadStore.getState().setReach(moduleId, spanStart === null || spanEnd === null ? null : { start: spanStart, end: spanEnd });
  }, [moduleId, spanStart, spanEnd]);
  useEffect(() => {
    if (!moduleId) return;
    return () => useLookAheadStore.getState().setReach(moduleId, null);
  }, [moduleId]);

  const shown = on ? offset : 0;
  const todayMs = today.getTime();
  const stepped = useMemo(() => (step && shown !== 0 ? lookAheadAnchor(new Date(todayMs), shown, step) : null), [step, shown, todayMs]);
  return {
    on,
    step,
    offset: shown,
    away,
    canBack: on && step !== null && shown > -step.back,
    canForward: on && step !== null && shown < step.forward,
    back,
    forward,
    home,
    touched,
    anchor: stepped ?? today,
    limit: on ? limit : null,
    rootProps,
  };
}
