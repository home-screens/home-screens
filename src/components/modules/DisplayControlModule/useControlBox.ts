'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Box {
  w: number;
  h: number;
}

/**
 * Content-box size of the widget's root, for the sizing model in metrics.ts.
 *
 * A callback ref rather than a RefObject so the observer follows the node when
 * a layout swaps its tree (the pad layout replaces its grid with the slider
 * card). Zero until measured, which `controlMetrics` reads as "assume the
 * authored box" — that also covers jsdom, which ships no ResizeObserver.
 */
export function useControlBox(): [(node: HTMLElement | null) => void, Box] {
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, box];
}
