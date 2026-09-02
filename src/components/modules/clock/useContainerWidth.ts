'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Width of the clock's container element, in layout px (`clientWidth`, so the
 * editor canvas zoom does not leak in). Reads 0 until the element exists;
 * the first measurement lands in a layout effect, before paint, so a view
 * never shows an unfitted frame. Re-attaches when `key` changes, which is how
 * the module signals that the view (and so the element) was swapped.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>, key: string): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, key]);
  return width;
}
