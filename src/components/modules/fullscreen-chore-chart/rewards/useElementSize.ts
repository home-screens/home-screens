'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Content-box size of whatever element the returned callback ref is attached
 * to. A callback ref (not a RefObject) so the observer follows the node when
 * the tree swaps between layouts, instead of staying bound to the first mount.
 */
export function useElementSize(): [(node: HTMLElement | null) => void, ElementSize] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const measure = () => {
      const cs = getComputedStyle(node);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const width = Math.max(0, node.clientWidth - padX);
      const height = Math.max(0, node.clientHeight - padY);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, size];
}
