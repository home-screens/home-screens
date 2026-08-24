'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Never shrink past this fraction of the requested size — below it the view is
 *  unreadable anyway, and a hard floor guarantees the loop terminates. */
const MIN_FACTOR = 0.34;
const MAX_PASSES = 6;

/**
 * Shrink-to-fit factor for a fixed-height layout on a fixed canvas.
 *
 * Panorama and Almanac are vertical stacks of fixed-height cards, unlike the
 * other fullscreen modules whose grids reflow. Every dimension is a multiple of
 * one type scale, so at large `typographySize` values the stack simply grows
 * past 1920px and clips: measured overflow was 374px at 2x-large and 1389px at
 * 4x-large before this existed.
 *
 * Heights here are near-linear in the type scale, so `clientHeight /
 * scrollHeight` is a good one-shot correction; the loop re-measures after each
 * render to absorb the non-linear parts (line wrapping, icon minimums) and
 * stops as soon as it fits.
 *
 * Returns 1 whenever the content already fits, so the common sizes pay nothing.
 */
export function useFitScale(ref: RefObject<HTMLElement | null>, deps: unknown[]): number {
  const [factor, setFactor] = useState(1);
  const factorRef = useRef(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    factorRef.current = 1;
    setFactor(1);

    let cancelled = false;
    let passes = 0;
    let raf = 0;

    const measure = () => {
      if (cancelled) return;
      const node = ref.current;
      if (!node) return;

      const overflow = node.scrollHeight - node.clientHeight;
      if (overflow <= 1 || passes >= MAX_PASSES) return;
      passes += 1;

      const ratio = node.clientHeight / Math.max(1, node.scrollHeight);
      const next = Math.max(MIN_FACTOR, factorRef.current * ratio);
      if (Math.abs(next - factorRef.current) < 0.005) return;

      factorRef.current = next;
      setFactor(next);
      raf = requestAnimationFrame(measure);
    };

    raf = requestAnimationFrame(measure);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes the layout inputs
  }, deps);

  return factor;
}
