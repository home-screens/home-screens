'use client';

import { useEffect, useReducer, useRef } from 'react';

/**
 * Closes a sheet or card nobody is using: `onClose` runs `ms` after it opened,
 * or after the last restart. `onClose` lives in a ref so a parent re-render
 * (the minute clock, an inline arrow function) never resets the countdown;
 * only a change of `ms` or `restartKey`, or a call of the returned restart
 * (every touch on the sheet, say), does. While `paused` (a detail is open
 * over the sheet, a recipe card is open from the book) the clock stops and
 * starts again in full when the pause ends.
 */
export function useAutoClose(
  onClose: () => void,
  ms: number,
  { restartKey, paused = false }: { restartKey?: string | number | boolean | null; paused?: boolean } = {},
): () => void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [restarts, restart] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onCloseRef.current(), ms);
    return () => clearTimeout(timer);
  }, [ms, restartKey, paused, restarts]);
  return restart;
}
