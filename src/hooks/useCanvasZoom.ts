'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 1.2;

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
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

  const zoomIn = useCallback(() => {
    setUserZoom((z) => clampZoom(z * ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setUserZoom((z) => clampZoom(z / ZOOM_STEP));
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

      const oldZoom = zoomRef.current;
      const oldEffective = baseScaleRef.current * oldZoom;

      // deltaY < 0 = zoom in, > 0 = zoom out
      const factor = Math.exp(-e.deltaY * 0.01);
      const newZoom = clampZoom(oldZoom * factor);
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
