'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DOUBLE_TAP_MS } from '@/lib/sheet-tap-guard';

/** Fallback auto-resume when `pauseTimeoutSeconds` is unset. */
const DEFAULT_PAUSE_TIMEOUT_S = 300;

interface UsePauseRotationOptions {
  /** Whether the pause gesture exists: `settings.pauseEnabled`, and false while the dots are hidden. Undefined means enabled. */
  pauseEnabled: boolean | undefined;
  /** `settings.pauseTimeoutSeconds`; 0 means stay paused indefinitely. */
  pauseTimeoutSeconds: number | undefined;
  activeIndex: number;
  /** Identity of the resolved screen set; a change is a hard reset. */
  screenKey: string;
  /** Navigate to a screen. Called for a tap on a non-active dot. */
  goToScreen: (index: number) => void;
  /** True while the pause clock should stand still (a screen that shows only when opened is up). */
  frozen?: boolean;
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
  frozen = false,
}: UsePauseRotationOptions): {
  paused: boolean;
  /**
   * Epoch ms at which the auto-resume fires, or null: not paused, or
   * `pauseTimeoutSeconds` is 0 (stays paused until someone resumes it). The
   * paused pill counts down to this.
   */
  pausedUntil: number | null;
  /** Tap handler for pagination dot `index`. */
  handleDotClick: (index: number) => void;
  /** Force-resume. Used by remote/plugin navigation, which bypasses the dots. */
  clearPause: () => void;
} {
  const [paused, setPaused] = useState(false);
  const [pausedUntil, setPausedUntil] = useState<number | null>(null);
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

  // Auto-resume, so a forgotten pause self-heals. While `frozen` the clock
  // stops where it is and the remaining time is kept for when it thaws.
  const remainingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!paused) {
      setPausedUntil(null);
      remainingRef.current = null;
      return;
    }
    const timeout = pauseTimeoutSeconds ?? DEFAULT_PAUSE_TIMEOUT_S;
    if (timeout === 0) {
      setPausedUntil(null); // 0 means stay paused indefinitely
      return;
    }
    if (frozen) {
      setPausedUntil(null);
      return;
    }
    const remaining = remainingRef.current ?? timeout * 1000;
    const until = Date.now() + remaining;
    setPausedUntil(until);
    const timer = setTimeout(() => setPaused(false), remaining);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, until - Date.now());
    };
  }, [paused, pauseTimeoutSeconds, frozen]);

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

  return { paused, pausedUntil, handleDotClick, clearPause };
}
