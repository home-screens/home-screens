'use client';

import { useCallback, useLayoutEffect, useState } from 'react';

export interface HiddenRows {
  /** Attach to the scrolling element. */
  scrollerRef: (el: HTMLDivElement | null) => void;
  /**
   * Attach to a wrapper around the rows. Observing the scroller alone is not
   * enough: it is sized by its flex parent, so its box never changes when the
   * content grows or the type is refitted, and the count silently goes stale.
   */
  contentRef: (el: HTMLDivElement | null) => void;
  /** The content is taller than the box. */
  overflows: boolean;
  /** Rows past the fold: less than half of each is on screen. */
  hidden: number;
}

/**
 * Counts the rows a list is hiding below its fold, remeasuring on resize and
 * on scroll.
 *
 * A wall chart must never hide a chore in silence, and predicting the
 * overflow from row counts and font sizes is exactly the guess that keeps
 * being wrong. This measures what actually happened instead. Measuring cannot
 * feed back into the row size, which comes from the outer box, not the rows.
 *
 * `rowSelector` picks the rows to count; anything else inside the scroller
 * (section headers, spacers) is ignored.
 *
 * Both refs are callback refs whose element goes into state, so the observer
 * and the scroll listener follow whatever node is actually mounted. They used
 * to be RefObjects attached inside a mount effect keyed on a stable callback,
 * which meant the observer was wired up only if both elements existed on the
 * very first commit: an element appearing on a later render was never observed,
 * and a node swapped between layouts left the observer on a detached one. The
 * every-render `useLayoutEffect(measure)` below hid it, because render-driven
 * measurement kept working — only resize- and scroll-driven updates were lost.
 * That is the same shape as the bug that pinned every weather view to 16px
 * (c8a8ad6f), and it is worth not leaving a second copy of it around.
 */
export function useHiddenRowCount(rowSelector: string): HiddenRows {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(0);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    if (!scroller) return;
    const over = scroller.scrollHeight > scroller.clientHeight + 1;
    let below = 0;
    if (over) {
      const bottom = scroller.getBoundingClientRect().bottom;
      for (const row of scroller.querySelectorAll(rowSelector)) {
        const r = row.getBoundingClientRect();
        // A row counts as hidden when less than half of it is on screen.
        if (r.top + r.height / 2 > bottom) below += 1;
      }
    }
    setOverflows((prev) => (prev === over ? prev : over));
    setHidden((prev) => (prev === below ? prev : below));
  }, [scroller, rowSelector]);

  useLayoutEffect(measure);
  useLayoutEffect(() => {
    if (!scroller) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(scroller);
    if (content) ro?.observe(content);
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro?.disconnect();
      scroller.removeEventListener('scroll', measure);
    };
  }, [scroller, content, measure]);

  return {
    scrollerRef: useCallback((el: HTMLDivElement | null) => setScroller(el), []),
    contentRef: useCallback((el: HTMLDivElement | null) => setContent(el), []),
    overflows,
    hidden,
  };
}
