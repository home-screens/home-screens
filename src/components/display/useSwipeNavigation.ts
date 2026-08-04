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
 * Two kinds of surface legitimately own a horizontal drag, so gestures that
 * START on them are excluded at pointerdown:
 * - range inputs (display-control brightness sliders): a slider drag ends in
 *   pointerup, never pointercancel, so without the exclusion every brightness
 *   adjustment would also flip screens;
 * - `[data-swipe-ignore]` containers: the opt-out for horizontal scroll
 *   surfaces (chore-board member columns, target-picker chips), where a drag
 *   that Chromium doesn't convert into a scroll (content happens to fit)
 *   would otherwise navigate away mid-use.
 * Everything else stays unexcluded — vertical scrolls abort via
 * pointercancel, and taps stay taps.
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
      // Every early return must ALSO clear any pending start (matching the
      // !isPrimary branch): a pointerdown we decline to track still
      // invalidates whatever came before it, otherwise a stale origin could
      // pair with this gesture's pointerup and navigate.
      if (!enabledRef.current) {
        startRef.current = null;
        return;
      }
      // Surfaces that own horizontal drags (sliders, sideways-scroll
      // containers) opt out of gesture tracking entirely — see docblock.
      if (e.target instanceof Element
        && e.target.closest('input[type="range"], [data-swipe-ignore]')) {
        startRef.current = null;
        return;
      }
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
