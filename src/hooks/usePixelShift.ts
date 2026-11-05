'use client';

import { useEffect, useState } from 'react';
import { subscribeAlignedTick } from '@/lib/aligned-ticker';
import { pixelShiftMinute, pixelShiftOffset, type PixelShiftOffset } from '@/lib/pixel-shift';
import { useFirstRenderInstant } from './useRenderInstant';

/**
 * Where a wall with burn-in protection on sits right now, or null while it
 * is off. The offset changes on the minute boundary (the shared aligned
 * tick, so it lands in the same render as every minute clock) and is read
 * off the clock, never counted; see `pixel-shift.ts`.
 *
 * The first reading is the current minute's spot, not centre: a wall that
 * reloads lands where it would have been, so a reload loop cannot park it.
 * It is taken from the server's render instant while hydrating so the
 * first client render matches the HTML; the mount effect then reads the
 * real clock.
 */
export function usePixelShift(enabled: boolean): PixelShiftOffset | null {
  const firstInstant = useFirstRenderInstant();
  const [minute, setMinute] = useState(() => pixelShiftMinute(firstInstant().getTime()));

  useEffect(() => {
    if (!enabled) return;
    setMinute(pixelShiftMinute(Date.now()));
    return subscribeAlignedTick(60_000, () => setMinute(pixelShiftMinute(Date.now())));
  }, [enabled]);

  return enabled ? pixelShiftOffset(minute) : null;
}
