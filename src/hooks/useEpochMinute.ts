'use client';

import { useEffect, useState } from 'react';
import { subscribeAlignedTick } from '@/lib/aligned-ticker';
import { pixelShiftMinute } from '@/lib/pixel-shift';
import { useFirstRenderInstant } from './useRenderInstant';

/**
 * The current minute of the epoch, stepping on the minute boundary through
 * the shared aligned tick, so a reading here lands in the same render as
 * every minute clock on the wall. The burn-in walks read their position off
 * it, never off a counter: a reload or a remount lands where the element
 * would have been anyway.
 *
 * The first reading is the server's render instant while hydrating, so the
 * first client render matches the HTML; the mount effect then reads the real
 * clock. With `enabled` false the value is frozen and nothing ticks.
 */
export function useEpochMinute(enabled: boolean): number {
  const firstInstant = useFirstRenderInstant();
  const [minute, setMinute] = useState(() => pixelShiftMinute(firstInstant().getTime()));

  useEffect(() => {
    if (!enabled) return;
    setMinute(pixelShiftMinute(Date.now()));
    return subscribeAlignedTick(60_000, () => setMinute(pixelShiftMinute(Date.now())));
  }, [enabled]);

  return minute;
}
