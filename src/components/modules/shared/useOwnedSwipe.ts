'use client';

import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { classifySwipe } from '@/lib/swipe-gesture';

/**
 * Marks a module that takes sideways swipes for itself: the wall's flick
 * navigation (which changes screens, `useSwipeNavigation`) leaves any gesture
 * that starts inside it alone. Unlike `data-swipe-ignore`, it leaves the touch
 * handling alone, so the swipe still reaches the module as pointer events and
 * lists still scroll.
 */
export const SWIPE_OWNER_ATTR = 'data-swipe-owner';

export interface OwnedSwipeProps {
  [SWIPE_OWNER_ATTR]?: '';
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: () => void;
}

/**
 * A module's own sideways swipe: left for `onForward` (the next week, the
 * next photo), right for `onBack`, by the same rule that tells a screen flick
 * from a tap or a scroll (`classifySwipe`). Spread the props on the module's
 * root. `onTouch` hears every finger that lands, swipe or not. Off, it hands
 * back nothing, so the screen's own swipe works as before.
 */
export function useOwnedSwipe(on: boolean, onForward: () => void, onBack: () => void, onTouch?: () => void): OwnedSwipeProps {
  const swipeRef = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null);
  return useMemo<OwnedSwipeProps>(() => (on ? {
    [SWIPE_OWNER_ATTR]: '',
    onPointerDown: (e) => {
      swipeRef.current = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp, pointerId: e.pointerId } : null;
      onTouch?.();
    },
    onPointerUp: (e) => {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start || e.pointerId !== start.pointerId) return;
      const direction = classifySwipe(start, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (direction === 'left') onForward();
      else if (direction === 'right') onBack();
    },
    onPointerCancel: () => { swipeRef.current = null; },
  } : {}), [on, onForward, onBack, onTouch]);
}
