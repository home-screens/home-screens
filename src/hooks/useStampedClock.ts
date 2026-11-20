'use client';

import { useEffect, useState } from 'react';
import { useRealClock } from './useTZClock';

/**
 * A ticking `now` that is also read afresh whenever `stamp` changes.
 *
 * For a list whose rows carry times compared against the clock: a note taken
 * down a moment ago has an expiry of "now", and a clock last read before the
 * change would still count it as live until the next tick. Pass the list as
 * `stamp` and the clock is never older than the data beside it.
 */
export function useStampedClock(intervalMs: number, stamp: unknown): Date {
  const tick = useRealClock(intervalMs);
  const [stamped, setStamped] = useState(tick);
  useEffect(() => {
    setStamped(new Date());
  }, [stamp]);
  return stamped.getTime() >= tick.getTime() ? stamped : tick;
}
