'use client';

import { useEffect, useState } from 'react';

interface UseScreenRotationTimerArgs {
  /**
   * Effective rotation duration in ms for the currently-visible screen.
   * `0` means sticky — the timer will not be scheduled.
   */
  durationMs: number;
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
 *
 * Returns the epoch ms at which the current dwell was armed, or null while
 * no dwell is scheduled (sticky screen, or nothing armed yet). The
 * pagination progress line fills from this instant over `durationMs`. When
 * `active` drops (pause, sleep, overlay) the last value is kept on purpose so
 * the line freezes where it is; the next arm replaces it and the line
 * restarts, which is exactly what the timer does.
 *
 * Callers MUST pass a stable `onAdvance` (via `useCallback` or a top-level
 * function). An inline lambda would change identity every render and re-arm
 * the effect, preventing the dwell window from ever completing.
 */
export function useScreenRotationTimer({
  durationMs,
  onAdvance,
  active,
  resetKey,
}: UseScreenRotationTimerArgs): number | null {
  const [dwellStartedAt, setDwellStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (durationMs <= 0) {
      setDwellStartedAt(null); // sticky — do not advance automatically
      return;
    }
    setDwellStartedAt(Date.now());
    const id = setTimeout(onAdvance, durationMs);
    return () => clearTimeout(id);
  }, [durationMs, active, resetKey, onAdvance]);

  return dwellStartedAt;
}
