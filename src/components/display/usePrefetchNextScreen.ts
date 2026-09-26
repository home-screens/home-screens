'use client';

import { useEffect, useRef } from 'react';
import type { Screen } from '@/types/config';
import { prefetchScreen } from '@/lib/prefetch';
import { wallClockParts } from '@/lib/timezone';
import { preloadAuthImage } from './useAuthImage';

/**
 * Prefetches the next screen's module data ~5s before rotation fires, and
 * its background picture when `backgroundOf` names one, so the screen
 * paints with its own picture instead of fading in over the previous one.
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
   * the renderer uses (`useWallClock` / `wallClockParts`), otherwise on a Pi
   * whose OS timezone differs we prefetch for modules that won't render and
   * skip ones that will.
   */
  timezone?: string,
  /**
   * True while a rule takeover is pinning the render. Rotation is suspended,
   * so an armed prefetch would fire for an advance that will not happen — and
   * because this is an effect dependency, the release re-arms a fresh prefetch
   * aligned with the full dwell the rotation timer restarts with.
   */
  suspended?: boolean,
  /** The picture a screen will paint behind its modules, as the renderer asks for it. */
  backgroundOf?: (screen: Screen) => string | undefined,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const screensRef = useRef(screens);
  // Read when the timer fires: the rotation's answers change on their own
  // schedule and must not restart the countdown.
  const backgroundOfRef = useRef(backgroundOf);
  backgroundOfRef.current = backgroundOf;

  useEffect(() => {
    screensRef.current = screens;
  }, [screens]);

  useEffect(() => {
    if (suspended) return;
    if (displayState === 'asleep' || screensRef.current.length <= 1) return;
    if (currentDurationMs <= 0) return; // sticky — no upcoming advance

    const nextIndex = (currentIndex + 1) % screensRef.current.length;
    const delay = Math.max(currentDurationMs - 5000, 0);

    timerRef.current = setTimeout(() => {
      const next = screensRef.current[nextIndex];
      prefetchScreen(next, wallClockParts(new Date(), timezone));
      preloadAuthImage(backgroundOfRef.current?.(next));
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screenKey, currentIndex, currentDurationMs, displayState, timezone, suspended]);
}
