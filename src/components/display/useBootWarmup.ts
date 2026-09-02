'use client';

import { useEffect, useRef } from 'react';
import type { Screen } from '@/types/config';
import { prefetchScreen } from '@/lib/prefetch';
import { createTZDate } from '@/lib/timezone';

/** Gap between one screen's warm-up fetch and the next. */
export const BOOT_WARMUP_STAGGER_MS = 400;

/**
 * Boot warm-up: on the first load, ask every screen's modules to fetch, one
 * screen every BOOT_WARMUP_STAGGER_MS, so the first pass of the rotation does
 * not flash skeletons on each new screen. `usePrefetchNextScreen` keeps
 * running after that for the steady state.
 *
 * Starts with the screen after the current one and walks the rotation in
 * order (the current screen's modules are already fetching for their own
 * render). Disabled and schedule-hidden modules are skipped by
 * `prefetchScreen`, the same as the next-screen prefetch. `displayCache`
 * dedups: a URL the current screen is already loading is not fetched twice.
 *
 * Runs once per mount. "Done" is stamped only when the first fetch actually
 * fires, so a cleanup before then (Strict Mode's double mount, a live config
 * edit inside the first 400ms) simply lets the pass start over.
 */
export function useBootWarmup(
  screens: Screen[],
  screenKey: string,
  currentIndex: number,
  timezone?: string,
  /** False in an editor preview window: it shows one screen and never rotates. */
  enabled = true,
): void {
  const doneRef = useRef(false);
  const screensRef = useRef(screens);
  screensRef.current = screens;
  const indexRef = useRef(currentIndex);
  indexRef.current = currentIndex;

  useEffect(() => {
    if (!enabled || doneRef.current) return;
    const list = screensRef.current;
    if (list.length <= 1) return;

    const start = indexRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let step = 1; step < list.length; step++) {
      const screen = list[(start + step) % list.length];
      timers.push(setTimeout(() => {
        doneRef.current = true;
        void prefetchScreen(screen, createTZDate(timezone));
      }, BOOT_WARMUP_STAGGER_MS * step));
    }
    return () => { timers.forEach(clearTimeout); };
  }, [enabled, screenKey, timezone]);
}
