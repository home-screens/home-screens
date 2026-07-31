'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Max gap between the two taps of a double-tap, in ms. */
const DOUBLE_TAP_MS = 300;
/** Fallback auto-resume when `pauseTimeoutSeconds` is unset. */
const DEFAULT_PAUSE_TIMEOUT_S = 300;

interface UsePauseRotationOptions {
  /** `settings.pauseEnabled`; undefined means enabled. */
  pauseEnabled: boolean | undefined;
  /** `settings.pauseTimeoutSeconds`; 0 means stay paused indefinitely. */
  pauseTimeoutSeconds: number | undefined;
  /** Index of the screen currently showing. */
  activeIndex: number;
  /** Identity of the resolved screen set; a change is a hard reset. */
  screenKey: string;
  /** Navigate to a screen. Called for a tap on a non-active dot. */
  goToScreen: (index: number) => void;
}

/**
 * Owns "rotation is paused" in one place.
 *
 * Pausing is a deliberately hidden gesture — double-tap the ACTIVE pagination
 * dot — so that a passer-by cannot freeze a wall display by brushing it, but
 * someone reading a recipe can hold the screen. Because it is hidden, every
 * path that could leave a display mysteriously stuck has to clear it, and those
 * clears were previously spread across five non-adjacent sites in ScreenRotator.
 *
 * Pause is cleared when:
 *   - the screen set changes (profile switch, live config edit)
 *   - the feature is switched off via live config
 *   - the auto-resume timeout elapses
 *   - the user navigates to a different screen
 *   - the display wakes from sleep — the ONE clear that cannot live here,
 *     because it needs `displayState` from `useDisplayControl`, which in turn
 *     consumes the `clearPause` this hook returns. ScreenRotator performs it
 *     just below its `useDisplayControl` call, using `clearPause`.
 *
 * A frozen kiosk is a support-ticket-shaped failure that looks identical from
 * across the room whatever caused it, so keeping these together matters more
 * than the line count suggests.
 */
export function usePauseRotation({
  pauseEnabled,
  pauseTimeoutSeconds,
  activeIndex,
  screenKey,
  goToScreen,
}: UsePauseRotationOptions): {
  paused: boolean;
  /** Tap handler for pagination dot `index`. */
  handleDotClick: (index: number) => void;
  /** Force-resume. Used by remote/plugin navigation, which bypasses the dots. */
  clearPause: () => void;
} {
  const [paused, setPaused] = useState(false);
  const lastDotTapRef = useRef(0);

  const clearPause = useCallback(() => setPaused(false), []);

  // Hard reset when the active screen set changes (profile switch, or a
  // same-length swap to different screens). ScreenRotator resets its index on
  // the same key.
  useEffect(() => {
    setPaused(false);
  }, [screenKey]);

  // Turning the feature off via live config must release an existing pause,
  // otherwise the display stays stuck with no gesture left to unstick it.
  useEffect(() => {
    if (pauseEnabled === false) setPaused(false);
  }, [pauseEnabled]);

  // Auto-resume, so a forgotten pause self-heals.
  useEffect(() => {
    if (!paused) return;
    const timeout = pauseTimeoutSeconds ?? DEFAULT_PAUSE_TIMEOUT_S;
    if (timeout === 0) return; // 0 means stay paused indefinitely
    const timer = setTimeout(() => setPaused(false), timeout * 1000);
    return () => clearTimeout(timer);
  }, [paused, pauseTimeoutSeconds]);

  const handleDotClick = useCallback(
    (index: number) => {
      if (index === activeIndex && (pauseEnabled ?? true)) {
        const now = Date.now();
        if (now - lastDotTapRef.current < DOUBLE_TAP_MS) {
          setPaused((p) => !p);
          lastDotTapRef.current = 0; // reset so a triple-tap doesn't re-trigger
          return;
        }
        lastDotTapRef.current = now;
        return; // a single tap on the active dot does nothing
      }
      lastDotTapRef.current = 0;
      goToScreen(index);
      setPaused(false); // navigating away resumes rotation
    },
    [activeIndex, pauseEnabled, goToScreen],
  );

  return { paused, handleDotClick, clearPause };
}
