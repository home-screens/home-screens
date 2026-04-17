'use client';

import { useEffect } from 'react';

interface UseScreenRotationTimerArgs {
  /**
   * Effective rotation duration in ms for the currently-visible screen.
   * `0` means sticky — the timer will not be scheduled.
   */
  durationMs: number;
  /** Called when the duration elapses. */
  onAdvance: () => void;
  /**
   * Whether rotation should tick at all. Set to `false` when the display
   * is asleep, paused by the user, or when there is only one screen.
   */
  active: boolean;
  /**
   * Bumped whenever the caller wants to restart the timer (e.g., after a
   * manual `next`/`prev`, a profile switch, or a current-screen change
   * that should reset the dwell window).
   */
  resetKey: number;
}

/**
 * Owns the lifecycle of the auto-rotation timer for the currently visible
 * screen. One `setTimeout` per screen — it is cleaned up (and a new one
 * scheduled with the new `durationMs`) whenever `resetKey`, `durationMs`,
 * or `active` changes.
 *
 * Using `setTimeout` (not `setInterval`) means the period can change when
 * the current screen changes, matching the per-screen duration model.
 */
export function useScreenRotationTimer({
  durationMs,
  onAdvance,
  active,
  resetKey,
}: UseScreenRotationTimerArgs): void {
  useEffect(() => {
    if (!active) return;
    if (durationMs <= 0) return; // sticky — do not advance automatically
    const id = setTimeout(onAdvance, durationMs);
    return () => clearTimeout(id);
  }, [durationMs, active, resetKey, onAdvance]);
}
