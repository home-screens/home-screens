'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

// Fixed zoom ladder for the buttons / keyboard (the wheel stays continuous
// between these bounds). Round percentages users can predict, not a 1.2x
// geometric run (100 → 120 → 144 → 173 …).
export const ZOOM_STOPS = [0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0] as const;

export const MIN_ZOOM = ZOOM_STOPS[0];
export const MAX_ZOOM = ZOOM_STOPS[ZOOM_STOPS.length - 1];

// Wheel events step the zoom by SIGN alone, rate-limited to one stop per
// interval. Delta magnitudes are unusable as a gate: notched mice report
// ~100 pixels per click on Windows, ±3 LINES on Firefox, and some setups
// (Linux/WSL wheels) send ±3 in pixel mode — a magnitude threshold that
// suits one wheel goes dead or hair-trigger on another. The time throttle
// is what keeps trackpad pinches sane: they stream events every ~16ms, so a
// full gesture advances several stops at a bounded rate instead of one per
// event.
const WHEEL_STEP_INTERVAL_MS = 100;

// Index of the next stop in the given direction. Zoom set by the wheel can
// sit between stops: "in" rounds up to the stop above, "out" down to the
// stop below; sitting exactly on a stop moves off it in that direction.
function stepStopIndex(z: number, dir: 1 | -1): number {
  const eps = 1e-6;
  const i = ZOOM_STOPS.findIndex((s) => s >= z - eps);
  if (i === -1) return ZOOM_STOPS.length - 1;
  const onStop = Math.abs(ZOOM_STOPS[i] - z) <= eps;
  if (dir === 1) return Math.min(i + (onStop ? 1 : 0), ZOOM_STOPS.length - 1);
  return Math.max(i - 1, 0);
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

  // Timestamp of the last wheel-initiated step, for the rate limit.
  const lastStepAtRef = useRef(0);

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

      // Stepped zoom: one ladder stop per wheel event, throttled to
      // WHEEL_STEP_INTERVAL_MS (see constant for why magnitude is ignored).
      if (e.deltaY === 0) return;
      const now = performance.now();
      if (now - lastStepAtRef.current < WHEEL_STEP_INTERVAL_MS) return;
      lastStepAtRef.current = now;
      const dir = e.deltaY < 0 ? 1 : -1;

      const oldZoom = zoomRef.current;
      const oldEffective = baseScaleRef.current * oldZoom;

      // deltaY < 0 = zoom in, > 0 = zoom out
      const newZoom = ZOOM_STOPS[stepStopIndex(oldZoom, dir)];
      if (newZoom === oldZoom) return;

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
