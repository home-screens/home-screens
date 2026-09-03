'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface HiddenRows {
  /** Attach to the scrolling element. */
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Attach to a wrapper around the rows. Observing the scroller alone is not
   * enough: it is sized by its flex parent, so its box never changes when the
   * content grows or the type is refitted, and the count silently goes stale.
   */
  contentRef: React.RefObject<HTMLDivElement | null>;
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
 */
export function useHiddenRowCount(rowSelector: string): HiddenRows {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(0);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    let below = 0;
    if (over) {
      const bottom = el.getBoundingClientRect().bottom;
      for (const row of el.querySelectorAll(rowSelector)) {
        const r = row.getBoundingClientRect();
        // A row counts as hidden when less than half of it is on screen.
        if (r.top + r.height / 2 > bottom) below += 1;
      }
    }
    setOverflows((prev) => (prev === over ? prev : over));
    setHidden((prev) => (prev === below ? prev : below));
  }, [rowSelector]);

  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (contentRef.current) ro.observe(contentRef.current);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure]);

  return { scrollerRef, contentRef, overflows, hidden };
}
