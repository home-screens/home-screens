'use client';

import { useEffect, useState } from 'react';

/**
 * True once `waiting` has been continuously true for `ms`. Lets a loading
 * state stop promising ("Getting the forecast…") and admit the data is not
 * arriving, without a fetch error to go on (a hung request, a hub that never
 * answers). Resets as soon as `waiting` turns false.
 */
export function useLoadingStalled(waiting: boolean, ms: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!waiting) { setStalled(false); return; }
    const id = setTimeout(() => setStalled(true), ms);
    return () => clearTimeout(id);
  }, [waiting, ms]);
  return waiting && stalled;
}
