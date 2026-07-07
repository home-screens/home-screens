'use client';

import { useEffect, useRef } from 'react';
import type { Screen } from '@/types/config';
import { prefetchScreen } from '@/lib/prefetch';
import { createTZDate } from '@/lib/timezone';

/**
 * Prefetches the next screen's module data ~5s before rotation fires.
 *
 * When `currentDurationMs === 0` the current screen is sticky and will
 * never auto-advance, so there is nothing to prefetch for — the hook
 * returns early to avoid needless API hits.
 *
 * Uses `screenKey` (stable string) instead of the screens array to avoid
 * restarting the timer every time `useMemo` returns a new array reference.
 */
export function usePrefetchNextScreen(
  screens: Screen[],
  screenKey: string,
  currentIndex: number,
  currentDurationMs: number,
  displayState: string,
  /**
   * Display timezone: module schedules must be evaluated with the same clock
   * the renderer uses (`useTZClock` / `createTZDate`), otherwise on a Pi
   * whose OS timezone differs we prefetch for modules that won't render and
   * skip ones that will.
   */
  timezone?: string,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const screensRef = useRef(screens);

  useEffect(() => {
    screensRef.current = screens;
  }, [screens]);

  useEffect(() => {
    if (displayState === 'asleep' || screensRef.current.length <= 1) return;
    if (currentDurationMs <= 0) return; // sticky — no upcoming advance

    const nextIndex = (currentIndex + 1) % screensRef.current.length;
    const delay = Math.max(currentDurationMs - 5000, 0);

    timerRef.current = setTimeout(() => {
      prefetchScreen(screensRef.current[nextIndex], createTZDate(timezone));
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screenKey, currentIndex, currentDurationMs, displayState, timezone]);
}
