'use client';

import { useCallback, useRef, useState } from 'react';

export interface ElementBox {
  width: number;
  height: number;
}

/**
 * Content box of an element, tracked with ResizeObserver. The two-dimensional
 * sibling of `useElementWidth`, for layouts that have to fit their content
 * down the box as well as across it.
 *
 * A callback ref, so the element may mount later than the component (after a
 * data load) or be swapped between layouts and the observer follows it. Reads
 * zero until the element exists; callers treat zero as "not measured yet" and
 * fall back to their authored size rather than painting a hairline first frame.
 */
export function useElementBox<T extends HTMLElement = HTMLDivElement>(): [(el: T | null) => void, ElementBox] {
  const [box, setBox] = useState<ElementBox>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const attach = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const measure = (width: number, height: number) => {
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) measure(entry.contentRect.width, entry.contentRect.height);
      });
      ro.observe(el);
      observer.current = ro;
    }
    measure(el.clientWidth, el.clientHeight);
  }, []);

  return [attach, box];
}
