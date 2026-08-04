'use client';

import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { GlobalSettings, TransitionEffect } from '@/types/config';
import { getTransitionConfig, getViewTransitionKeyframes, type TransitionDirection } from '@/lib/transitions';

const supportsViewTransitions =
  typeof document !== 'undefined' && 'startViewTransition' in document;

/**
 * Wraps a DOM update in the View Transitions API for smooth compositor-driven
 * animation. Falls back to a direct update when the API isn't available.
 *
 * View Transitions capture GPU-backed screenshots of the old and new states,
 * then animate between them as flat textures on the compositor thread. This is
 * dramatically cheaper than animating live DOM layers.
 */
function startScreenTransition(
  updateFn: () => void,
  effect: TransitionEffect,
  durationMs: number,
  easing: string,
  direction: TransitionDirection,
) {
  if (!supportsViewTransitions || durationMs === 0 || effect === 'none') {
    updateFn();
    return;
  }

  const vt = document.startViewTransition(() => {
    flushSync(updateFn);
  });

  const kf = getViewTransitionKeyframes(effect, direction);

  vt.ready
    .then(() => {
      const opts: KeyframeAnimationOptions = { duration: durationMs, easing, fill: 'both' };

      document.documentElement.animate(kf.exit, {
        ...opts,
        pseudoElement: '::view-transition-old(root)',
      });
      document.documentElement.animate(kf.enter, {
        ...opts,
        pseudoElement: '::view-transition-new(root)',
      });
    })
    .catch(() => {
      // A concurrent startViewTransition() call aborted this transition. The
      // DOM update already committed via flushSync; only the animation is lost.
    });
}

/**
 * Returns a referentially stable `transition(updateFn)` that runs the update
 * inside a View Transition using the CURRENT transition settings.
 *
 * The stability is the point. ScreenRotator's navigation callbacks
 * (`goToScreen` / `nextScreen` / `prevScreen`) are dependencies of several
 * effects and are handed to the remote-command layer, so recreating them every
 * time an unrelated transition setting changes would churn all of that. Reading
 * the live config through refs keeps this callback's identity fixed for the
 * component's lifetime while still honouring an edit made seconds ago.
 *
 * Keeping the refs here rather than in ScreenRotator is what lets the
 * navigation callbacks list honest dependency arrays: previously each one
 * carried an `eslint-disable react-hooks/exhaustive-deps` to account for the
 * refs being read but not declared.
 */
export function useScreenTransition(
  settings: GlobalSettings,
): (updateFn: () => void, direction?: TransitionDirection) => void {
  const tc = getTransitionConfig(settings.transitionEffect, settings.transitionDuration);

  const effectRef = useRef<TransitionEffect>(settings.transitionEffect ?? 'fade');
  const durationMsRef = useRef(tc.duration * 1000);
  const easingRef = useRef(tc.easing);

  useEffect(() => {
    effectRef.current = settings.transitionEffect ?? 'fade';
    durationMsRef.current = tc.duration * 1000;
    easingRef.current = tc.easing;
  }, [settings.transitionEffect, tc.duration, tc.easing]);

  // Direction is a per-call argument (not a ref): backward mirrors the
  // directional effects so prev navigation animates the way it moves.
  return useCallback((updateFn: () => void, direction: TransitionDirection = 'forward') => {
    startScreenTransition(updateFn, effectRef.current, durationMsRef.current, easingRef.current, direction);
  }, []);
}
