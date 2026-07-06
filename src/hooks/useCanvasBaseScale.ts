'use client';

import { useEffect, useState } from 'react';

/**
 * Computes the fit-to-container base scale for the editor canvas via a
 * ResizeObserver on the scroll container. The 32px inset matches the canvas
 * padding so the display always fits with a margin.
 */
export function useCanvasBaseScale(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  displayWidth: number,
  displayHeight: number,
) {
  const [baseScale, setBaseScale] = useState(0.4);

  useEffect(() => {
    const updateScale = () => {
      if (!scrollRef.current) return;
      const { clientWidth, clientHeight } = scrollRef.current;
      const scaleX = (clientWidth - 32) / displayWidth;
      const scaleY = (clientHeight - 32) / displayHeight;
      const newBase = Math.min(scaleX, scaleY, 1);
      setBaseScale(newBase);
    };
    updateScale();
    const el = scrollRef.current;
    const ro = new ResizeObserver(updateScale);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, displayWidth, displayHeight]);

  return baseScale;
}
