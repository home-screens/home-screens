'use client';

import { useState, useEffect } from 'react';
import { createTZDate } from '@/lib/timezone';

/**
 * `enabled: false` freezes the returned value and skips the recurring
 * interval entirely — for a caller that only needs `now` when something
 * time-dependent is actually in view, so the rest of its tree doesn't
 * re-render every tick for no reason.
 */
export function useTZClock(timezone: string | undefined, intervalMs = 60_000, enabled = true): Date {
  const [now, setNow] = useState(() => createTZDate(timezone));
  useEffect(() => {
    if (!enabled) return;
    setNow(createTZDate(timezone));
    const interval = setInterval(() => setNow(createTZDate(timezone)), intervalMs);
    return () => clearInterval(interval);
  }, [timezone, intervalMs, enabled]);
  return now;
}

/**
 * Ticking clock that returns the REAL current instant (true UTC epoch).
 *
 * Use this instead of `useTZClock` whenever the value is compared against or
 * fed into real Date instants — SunCalc times, epoch math, progress
 * fractions. `useTZClock` returns a *shifted* Date whose epoch is offset by
 * (configured timezone − OS timezone); mixing it with real instants makes
 * comparisons wrong by that offset on a Pi whose OS timezone differs from
 * the display timezone. Wall-clock rendering (getHours etc.) is the only
 * thing the shifted clock is for.
 */
export function useRealClock(intervalMs = 60_000): Date {
  return useTZClock(undefined, intervalMs);
}
