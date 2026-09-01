'use client';

import { useEffect, useState } from 'react';

/**
 * Height the floating canvas toolbar (undo / snap / zoom) occupies at the
 * bottom of the workspace. Reserved when fitting the frame so the display's
 * bottom edge — where the pagination dots and any bottom-aligned module live
 * — is never hidden under it.
 */
export const CANVAS_TOOLBAR_RESERVE_PX = 40;

/**
 * Computes the fit-to-container base scale for the editor canvas via a
 * ResizeObserver on the scroll container. The 32px inset matches the canvas
 * padding so the display always fits with a margin; the toolbar strip is
 * reserved on top of that.
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
      const scaleY = (clientHeight - 32 - CANVAS_TOOLBAR_RESERVE_PX) / displayHeight;
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
