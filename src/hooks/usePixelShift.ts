'use client';

import { pixelShiftOffset, wanderOffset, type PixelShiftOffset, type WanderAnchor } from '@/lib/pixel-shift';
import { useEpochMinute } from './useEpochMinute';

/**
 * Where a wall with burn-in protection on sits right now, or null while it
 * is off: the lattice spot for the current minute (see `pixel-shift.ts`).
 */
export function usePixelShift(enabled: boolean): PixelShiftOffset | null {
  const minute = useEpochMinute(enabled);
  return enabled ? pixelShiftOffset(minute) : null;
}

/**
 * Where an element with room inside its own box sits right now, or null
 * while burn-in protection is off: the wander for the current minute,
 * bounded by the reach the caller measured and placed by `anchor` (see
 * `wanderOffset`).
 */
export function useWander(
  enabled: boolean,
  reachX: number,
  reachY: number,
  anchor: WanderAnchor = 'start',
): PixelShiftOffset | null {
  const minute = useEpochMinute(enabled);
  return enabled ? wanderOffset(minute, reachX, reachY, anchor) : null;
}
