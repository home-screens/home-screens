'use client';

import { useEffect, useRef } from 'react';
import { classifySwipe } from '@/lib/swipe-gesture';

interface UseSwipeNavigationOptions {
  /**
   * Live gate, sampled at pointerdown: swipe setting on, display fully
   * active (not dimmed or asleep), no interaction hold. Sampling at
   * pointerdown (not pointerup) is what makes the wake-touch safe — the
   * finger that wakes a dimmed or sleeping display still sees the old state
   * here (React commits the wake after the event burst), so that same
   * gesture wakes without also navigating.
   */
  enabled: boolean;
  /** Swipe left = forward = next screen. */
  onSwipeLeft: () => void;
  /** Swipe right = back = previous screen. */
  onSwipeRight: () => void;
}

/**
 * Flick-to-navigate: a quick horizontal flick anywhere on the display changes
 * screens. Deliberately NOT drag-follow — screen transitions are
 * fire-and-forget View Transitions (compositor screenshots), so the screen
 * cannot track the finger.
 *
 * Pointer events, window-level, capture, passive:
 * - Chromium synthesizes trusted pointer events for both real touch and
 *   Playwright's CDP mouse input, so one listener set serves the kiosk,
 *   desktop dev, and E2E. No pointerType filtering.
 * - Only down/up/cancel — classification needs two points, and skipping
 *   pointermove keeps per-frame work at zero on the Pi.
 * - Capture so a module calling stopPropagation can't blind the tracker;
 *   passive because we never preventDefault — taps stay taps, the chore
 *   chart keeps scrolling vertically (a vertical scroll fires pointercancel,
 *   which aborts tracking).
 *
 * Flick-vs-tap needs no suppression code on touch: a tap stays inside
 * Chromium's ~15px touch slop (far under the 60px swipe floor), and a real
 * flick that starts on a button has its click cancelled by the browser once
 * movement exceeds the slop. Known mouse-only quirk: a long drag entirely
 * inside one large interactive element fires both navigation and that
 * element's click — touch never does, so the kiosk is unaffected.
 *
 * Gestures that start on interactive elements or inside scroll containers
 * are intentionally NOT excluded: nothing in the app scrolls horizontally,
 * so a horizontal flick is globally unambiguous.
 */
export function useSwipeNavigation({ enabled, onSwipeLeft, onSwipeRight }: UseSwipeNavigationOptions): void {
  // Refs so the window listeners bind exactly once for the component lifetime.
  const enabledRef = useRef(enabled);
  const leftRef = useRef(onSwipeLeft);
  const rightRef = useRef(onSwipeRight);
  useEffect(() => {
    enabledRef.current = enabled;
    leftRef.current = onSwipeLeft;
    rightRef.current = onSwipeRight;
  }, [enabled, onSwipeLeft, onSwipeRight]);

  const startRef = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) {
        // A second finger landed mid-gesture: this is a pinch, not a flick.
        startRef.current = null;
        return;
      }
      if (!enabledRef.current) return;
      startRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, pointerId: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || e.pointerId !== start.pointerId) return;
      const direction = classifySwipe(start, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (direction === 'left') leftRef.current();
      else if (direction === 'right') rightRef.current();
    };
    const onCancel = () => {
      // The browser claimed the gesture — e.g. a vertical scroll started
      // inside the chore chart's scroll container.
      startRef.current = null;
    };

    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onCancel, opts);
    return () => {
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onCancel, opts);
    };
  }, []);
}
