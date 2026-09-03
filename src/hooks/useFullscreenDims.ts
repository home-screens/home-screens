'use client';

import { useRef, useState, useLayoutEffect } from 'react';

/** Dimensions returned by the hook. */
export interface FullscreenDims {
  w: number;
  h: number;
}

/**
 * Tracks the content dimensions of a container element via ResizeObserver.
 * Defaults to 1080×1920 (portrait display) until the first measurement,
 * which happens before the first paint so a landscape panel never shows a
 * portrait frame.
 */
export function useFullscreenDims() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<FullscreenDims>({ w: 1080, h: 1920 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDims({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  return { containerRef, dims };
}
