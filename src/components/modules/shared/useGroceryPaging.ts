'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePagedRotation } from '@/hooks/usePagedRotation';

/** Pages of a long grocery list turn this often. */
export const GROCERY_PAGE_MS = 15_000;
/** After a tick the page holds still this long, so the next tick is on the same page. */
export const GROCERY_TICK_PAUSE_MS = 60_000;

/**
 * Which page of a long grocery list the wall shows, for the small and the
 * full-screen Grocery views alike: pages turn on their own, and hold still
 * for a while after a tick (`noteTick`), so the next item to tick off is
 * still where it was.
 */
export function useGroceryPaging(pageCount: number): { index: number; noteTick: () => void } {
  const [lastTick, setLastTick] = useState(0);
  useEffect(() => {
    if (!lastTick) return;
    const timer = setTimeout(() => setLastTick(0), GROCERY_TICK_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastTick]);
  const { index } = usePagedRotation(pageCount, lastTick ? GROCERY_TICK_PAUSE_MS : GROCERY_PAGE_MS);
  const noteTick = useCallback(() => setLastTick(Date.now()), []);
  return { index, noteTick };
}
