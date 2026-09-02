'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Content width of an element, tracked with ResizeObserver. Returns a callback
 * ref, so the element may mount later than the component (after a data load,
 * say) or be swapped, and the observer follows it. Reads 0 until the element
 * exists; the first measurement lands in the same commit, before paint, so a
 * layout that branches on the width never flashes its fallback.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    observer.current = ro;
    setWidth(el.clientWidth);
  }, []);
  return [attach, width];
}
