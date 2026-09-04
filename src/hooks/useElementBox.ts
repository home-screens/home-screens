'use client';

import { useCallback, useRef, useState } from 'react';

export interface ElementBox {
  width: number;
  height: number;
}

/**
 * Which box the hook reports.
 *
 * `content` is the room the element's children actually get, padding excluded.
 * That is the right answer nearly everywhere.
 *
 * `padding` is `clientWidth`/`clientHeight`, padding included. It exists for
 * widgets that derive their own padding from the measurement and then set it on
 * the very element being measured (the display-control layouts get `pad` out of
 * `controlMetrics`, which already subtracts it again). Handing those the content
 * box would take the padding off twice and leave the measurement chasing its
 * own output.
 */
export type ElementBoxMode = 'content' | 'padding';

const px = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Size of an element, tracked with ResizeObserver.
 *
 * A callback ref, so the element may mount later than the component (after a
 * data load) or be swapped between views, and the observer follows it with no
 * re-attach dance at the call site. Reads zero until the element exists;
 * callers treat zero as "not measured yet" and fall back to their authored size
 * rather than painting a hairline first frame. The first measurement lands in
 * the same commit, before paint, so a layout that branches on the size never
 * flashes its fallback.
 *
 * The first read and every observer callback run the same measurement against
 * the live node, so a padded element cannot report one size on mount and a
 * different one a frame later. ResizeObserver is looked up rather than assumed,
 * so this degrades to the single first read under jsdom instead of throwing.
 */
export function useElementBox<T extends HTMLElement = HTMLDivElement>(
  mode: ElementBoxMode = 'content',
): [(el: T | null) => void, ElementBox] {
  const [box, setBox] = useState<ElementBox>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);

  const attach = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    // React calls the ref with null on unmount, which is what disconnects the
    // observer. No cleanup effect is needed on top of that.
    if (!el) return;
    const measure = () => {
      let width = el.clientWidth;
      let height = el.clientHeight;
      if (mode === 'content') {
        const cs = getComputedStyle(el);
        width = Math.max(0, width - px(cs.paddingLeft) - px(cs.paddingRight));
        height = Math.max(0, height - px(cs.paddingTop) - px(cs.paddingBottom));
      }
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      observer.current = ro;
    }
  }, [mode]);

  return [attach, box];
}

/** One-dimensional `useElementBox`, for layouts that only fit across the box. */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>(
  mode: ElementBoxMode = 'content',
): [(el: T | null) => void, number] {
  const [attach, box] = useElementBox<T>(mode);
  return [attach, box.width];
}
