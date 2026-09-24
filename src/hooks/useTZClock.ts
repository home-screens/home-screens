'use client';

import { useState, useEffect } from 'react';
import { createTZDate, toTZWallTime, wallClockParts, type WallClock } from '@/lib/timezone';
import { useFirstRenderInstant } from './useRenderInstant';

/**
 * `enabled: false` freezes the returned value and skips the recurring
 * interval entirely — for a caller that only needs `now` when something
 * time-dependent is actually in view, so the rest of its tree doesn't
 * re-render every tick for no reason.
 *
 * The first reading is the server's render instant while hydrating (see
 * `useFirstRenderInstant`), and the mount effect replaces it with the real
 * one, so a page hydrated across the hour or midnight never keeps the
 * server's stale text.
 */
export function useTZClock(timezone: string | undefined, intervalMs = 60_000, enabled = true): Date {
  const firstInstant = useFirstRenderInstant();
  const [now, setNow] = useState(() => toTZWallTime(firstInstant(), timezone));
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
export function useRealClock(intervalMs = 60_000, enabled = true): Date {
  return useTZClock(undefined, intervalMs, enabled);
}

/** Same reading, same object: a tick inside one minute changes nothing downstream. */
function nextWallClock(prev: WallClock, timezone: string | undefined): WallClock {
  const next = wallClockParts(new Date(), timezone);
  return next.minuteOfDay === prev.minuteOfDay && next.isoDate === prev.isoDate ? prev : next;
}

/**
 * Ticking wall-clock reading in `timezone`, for schedule, profile and `time`
 * condition checks. Prefer it to `useTZClock` for those: it is read straight
 * from Intl, so it has no hour that the machine's own daylight-saving change
 * can skip (see `WallClock`). The object only changes when the minute does, so
 * it is safe as a memo dependency. `enabled: false` freezes it, and it
 * hydrates from the server's instant, both as in `useTZClock`.
 */
export function useWallClock(timezone: string | undefined, intervalMs = 60_000, enabled = true): WallClock {
  const firstInstant = useFirstRenderInstant();
  const [clock, setClock] = useState(() => wallClockParts(firstInstant(), timezone));
  useEffect(() => {
    if (!enabled) return;
    setClock((prev) => nextWallClock(prev, timezone));
    const interval = setInterval(() => setClock((prev) => nextWallClock(prev, timezone)), intervalMs);
    return () => clearInterval(interval);
  }, [timezone, intervalMs, enabled]);
  return clock;
}
