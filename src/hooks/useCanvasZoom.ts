'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

// Fixed zoom ladder shared by every zoom path — buttons, keyboard, and the
// stepped wheel all land exactly on these stops. Round percentages users can
// predict, not a 1.2x geometric run (100 → 120 → 144 → 173 …).
export const ZOOM_STOPS = [0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0] as const;

export const MIN_ZOOM = ZOOM_STOPS[0];
export const MAX_ZOOM = ZOOM_STOPS[ZOOM_STOPS.length - 1];

// Wheel events step the zoom by SIGN alone. Delta magnitudes are unusable as
// a gate: notched mice report ~100 pixels per click on Windows, ±3 LINES on
// Firefox, and some setups (Linux/WSL wheels) send ±3 in pixel mode — a
// magnitude threshold that suits one wheel goes dead or hair-trigger on
// another. Instead, events are split by their arrival cadence: continuous
// streams (trackpad pinches fire every ~16ms) are throttled to one stop per
// interval so a full gesture advances at a bounded rate, while discrete
// notch clicks (which arrive tens of ms apart) each step immediately so a
// fast flick is never dropped.
const WHEEL_STEP_INTERVAL_MS = 100;

// Wheel events closer together than this are one continuous stream; a longer
// gap means a discrete notch click or a new gesture.
const STREAM_GAP_MS = 25;

// macOS momentum keeps streaming wheel events with steadily decaying
// magnitude for up to ~1s after the fingers lift. A deliberate gesture
// wobbles; a sustained decay this many events long marks the momentum tail,
// which must not keep stepping the zoom after the user let go.
const MOMENTUM_DECAY_EVENTS = 4;

// Next ladder index in the given direction. Every writer of userZoom lands
// exactly on a stop (initial 1.0, reset, buttons, keyboard, wheel), so this
// is an index walk with an epsilon for float drift. Off-ladder values are
// not produced today; if a future caller introduces one (persisted zoom, a
// computed fit value), it snaps to the adjacent stop in the direction of
// travel, clamped into the ladder at the ends.
// Exported for unit tests.
export function stepStopIndex(z: number, dir: 1 | -1): number {
  const eps = 1e-6;
  const i = ZOOM_STOPS.findIndex((s) => Math.abs(s - z) <= eps);
  if (i !== -1) return Math.min(Math.max(i + dir, 0), ZOOM_STOPS.length - 1);
  const above = ZOOM_STOPS.findIndex((s) => s > z);
  if (above === -1) return ZOOM_STOPS.length - 1; // above the top stop
  if (above === 0) return 0; // below the bottom stop
  return dir === 1 ? above : above - 1;
}

// Mutable per-gesture wheel state. Kept in a plain object (not refs) so the
// cadence rules above can be exercised by unit tests with a fake clock —
// stream-vs-notch splits and momentum decay are wall-clock behavior that
// real-timer e2e cannot pin down deterministically.
export interface WheelGestureState {
  lastStepAt: number;
  lastWheelAt: number;
  lastMag: number;
  decayStreak: number;
  momentum: boolean;
}

export function createWheelGestureState(): WheelGestureState {
  return { lastStepAt: 0, lastWheelAt: 0, lastMag: 0, decayStreak: 0, momentum: false };
}

// Decides whether a wheel event with this deltaY arriving at `now` may step
// the zoom, updating the gesture state. The caller stamps state.lastStepAt
// only when a step actually lands — a step suppressed by the ladder end must
// not arm the stream throttle, or the first event after reversing direction
// would be swallowed.
export function wheelStepAllowed(state: WheelGestureState, deltaY: number, now: number): boolean {
  if (deltaY === 0) return false;
  const gap = now - state.lastWheelAt;
  state.lastWheelAt = now;
  const mag = Math.abs(deltaY);
  const streaming = gap <= STREAM_GAP_MS;

  if (!streaming) {
    // Discrete notch click or a new gesture: any momentum lockout ends here.
    state.momentum = false;
    state.decayStreak = 0;
  } else {
    state.decayStreak = mag < state.lastMag ? state.decayStreak + 1 : 0;
    if (state.decayStreak >= MOMENTUM_DECAY_EVENTS) state.momentum = true;
  }
  state.lastMag = mag;
  if (state.momentum) return false;

  // Streams are rate-limited; discrete notch clicks step immediately.
  return !streaming || now - state.lastStepAt >= WHEEL_STEP_INTERVAL_MS;
}

interface PendingScroll {
  newCanvasX: number;
  newCanvasY: number;
  viewportX: number;
  viewportY: number;
}

export function useCanvasZoom(
  baseScale: number,
  scrollRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLDivElement | null>,
) {
  const [userZoom, setUserZoom] = useState(1.0);
  const effectiveScale = baseScale * userZoom;

  // Refs so the wheel handler closure always reads the latest values
  const zoomRef = useRef(userZoom);
  const baseScaleRef = useRef(baseScale);

  // Sync zoomRef for non-wheel zoom paths (buttons, keyboard, screen-switch reset)
  useEffect(() => { zoomRef.current = userZoom; }, [userZoom]);
  useEffect(() => { baseScaleRef.current = baseScale; }, [baseScale]);

  // Pending scroll correction — applied after React commits the new canvas size
  const pendingScrollRef = useRef<PendingScroll | null>(null);

  // Wheel gesture state — cadence tracking for the stream/notch split,
  // stream throttle, and momentum lockout (see wheelStepAllowed).
  const gestureRef = useRef<WheelGestureState>(createWheelGestureState());

  const zoomIn = useCallback(() => {
    setUserZoom((z) => ZOOM_STOPS[stepStopIndex(z, 1)]);
  }, []);

  const zoomOut = useCallback(() => {
    setUserZoom((z) => ZOOM_STOPS[stepStopIndex(z, -1)]);
  }, []);

  const resetZoom = useCallback(() => {
    setUserZoom(1.0);
  }, []);

  // Apply scroll correction after React commits the zoom state change.
  // This guarantees getBoundingClientRect reflects the new canvas size.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending) return;
    pendingScrollRef.current = null;

    const canvasEl = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvasEl || !scrollEl) return;

    // The spacer centers the canvas with flexbox. Account for that offset.
    const canvasRect = canvasEl.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - scrollRect.left + scrollEl.scrollLeft;
    const canvasOffsetY = canvasRect.top - scrollRect.top + scrollEl.scrollTop;

    scrollEl.scrollLeft = canvasOffsetX + pending.newCanvasX - pending.viewportX;
    scrollEl.scrollTop = canvasOffsetY + pending.newCanvasY - pending.viewportY;
  }, [userZoom, canvasRef, scrollRef]);

  // Wheel / trackpad-pinch handler — zoom-to-cursor
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handler = (e: WheelEvent) => {
      // Only intercept zoom gestures (Ctrl+wheel or trackpad pinch which sets ctrlKey)
      if (!e.ctrlKey) return;

      e.preventDefault();

      const canvasEl = canvasRef.current;
      if (!canvasEl) return;

      // Stepped zoom: one ladder stop per allowed step (see the constants
      // above for why magnitude is ignored and how streams, notches, and
      // momentum are told apart).
      const now = performance.now();
      if (!wheelStepAllowed(gestureRef.current, e.deltaY, now)) return;

      const dir = e.deltaY < 0 ? 1 : -1; // wheel/pinch away from you = in

      const oldZoom = zoomRef.current;
      const oldEffective = baseScaleRef.current * oldZoom;

      const newZoom = ZOOM_STOPS[stepStopIndex(oldZoom, dir)];
      if (newZoom === oldZoom) return; // ladder end: no step, so don't arm the throttle
      gestureRef.current.lastStepAt = now;

      const newEffective = baseScaleRef.current * newZoom;

      // Point under cursor in display coordinates (before zoom)
      const canvasRect = canvasEl.getBoundingClientRect();
      const cursorDisplayX = (e.clientX - canvasRect.left) / oldEffective;
      const cursorDisplayY = (e.clientY - canvasRect.top) / oldEffective;

      // Where that display point will be after zoom (relative to new canvas top-left)
      const newCanvasX = cursorDisplayX * newEffective;
      const newCanvasY = cursorDisplayY * newEffective;

      // Where the cursor is relative to the scroll viewport
      const scrollRect = scrollEl.getBoundingClientRect();
      const viewportX = e.clientX - scrollRect.left;
      const viewportY = e.clientY - scrollRect.top;

      // Sync ref immediately so back-to-back events read the latest zoom
      zoomRef.current = newZoom;
      pendingScrollRef.current = { newCanvasX, newCanvasY, viewportX, viewportY };
      setUserZoom(newZoom);
    };

    scrollEl.addEventListener('wheel', handler, { passive: false });
    return () => scrollEl.removeEventListener('wheel', handler);
  }, [scrollRef, canvasRef]);

  // Keyboard shortcuts: Cmd+= zoom in, Cmd+- zoom out, Cmd+0 reset
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomIn, zoomOut, resetZoom]);

  return { userZoom, effectiveScale, zoomIn, zoomOut, resetZoom };
}
