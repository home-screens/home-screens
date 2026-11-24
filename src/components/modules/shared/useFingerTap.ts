'use client';

import { useRef, type PointerEvent } from 'react';
import { wallTakesTouch } from '@/lib/wall-touch-gate';

/** How far a finger may wander between landing on a button and lifting, and still be a tap (CSS pixels). */
const TAP_SLOP_PX = 30;
/** A click this soon after the finger's own tap is the same tap told twice. */
const SAME_TAP_MS = 700;

/**
 * For a button that must answer while another finger is on the screen: it
 * acts when its own finger lifts, not only on the browser's click. A browser
 * makes no click for a tap while a second finger is down, so without this a
 * child cannot change colour while a sibling draws, and two hands typing
 * lose every letter whose key went down before the last one came up. A
 * mouse, the keyboard and a screen reader still come through the click.
 *
 * Spread the answer on a `WallButton` (it keeps the pressed look). The
 * button acts before the tap's own click, so one that closes its sheet
 * needs `useSheetTapGuard()` there, or the click lands on the wall behind.
 */
export function useFingerTap(onPress: () => void) {
  // Every finger on the button, by pointer: two fingers on one key are two taps.
  const down = useRef(new Map<number, { x: number; y: number }>());
  const tappedAt = useRef(-Infinity);
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // `:disabled` also covers a sheet holding its buttons still for a moment (a fieldset).
      // A touch that only wakes the wall presses nothing (the shell holds back its click the same way).
      if (e.pointerType === 'mouse' || e.currentTarget.matches(':disabled') || !wallTakesTouch()) return;
      down.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const start = down.current.get(e.pointerId);
      down.current.delete(e.pointerId);
      if (!start || e.currentTarget.matches(':disabled')) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
      tappedAt.current = performance.now();
      onPress();
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => { down.current.delete(e.pointerId); },
    onClick: () => {
      if (performance.now() - tappedAt.current < SAME_TAP_MS) return;
      onPress();
    },
  };
}
