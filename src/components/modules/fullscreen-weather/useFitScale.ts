'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Never shrink past this fraction of the requested size — below it the view is
 *  unreadable anyway, and a hard floor bounds the search. */
const MIN_FACTOR = 0.34;
/** Bisection steps. 7 gives ~0.5% precision over the [MIN_FACTOR, 1] range. */
const STEPS = 7;

/**
 * The largest scale factor at which a fixed-height layout still fits its canvas.
 *
 * Panorama and Almanac are vertical stacks of fixed-height cards, unlike the
 * other fullscreen modules whose grids reflow, so a large `typographySize` can
 * push them past 1080x1920 and clip.
 *
 * This bisects rather than shrinking one-directionally. A shrink-only loop
 * converges on *a* factor that fits, not the *largest* one, and the landing
 * point depends on how many passes it took — which made the rendered hero
 * non-monotonic across typography sizes (2x-large came out larger than
 * 4x-large). Bisection always returns the best factor for a given content set,
 * so bigger settings reliably render bigger.
 *
 * Returns 1 whenever the content already fits, so the common sizes pay nothing.
 */
export function useFitScale(ref: RefObject<HTMLElement | null>, deps: unknown[]): number {
  const [factor, setFactor] = useState(1);
  const stateRef = useRef({ lo: MIN_FACTOR, hi: 1, step: 0, probe: 1 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    stateRef.current = { lo: MIN_FACTOR, hi: 1, step: 0, probe: 1 };
    setFactor(1);

    let cancelled = false;
    let raf = 0;

    const fits = () => {
      const node = ref.current;
      if (!node) return true;
      return node.scrollHeight - node.clientHeight <= 1 && node.scrollWidth - node.clientWidth <= 1;
    };

    const measure = () => {
      if (cancelled) return;
      const st = stateRef.current;

      if (fits()) {
        // The current probe fits. It is the best known lower bound; if we are
        // still searching, try larger, otherwise settle here.
        st.lo = st.probe;
      } else {
        st.hi = st.probe;
      }

      if (st.step === 0 && st.lo === 1) return; // fitted at full size, nothing to do
      if (st.step >= STEPS) {
        if (st.probe !== st.lo) { st.probe = st.lo; setFactor(st.lo); }
        return;
      }

      st.step += 1;
      st.probe = (st.lo + st.hi) / 2;
      setFactor(st.probe);
      raf = requestAnimationFrame(measure);
    };

    raf = requestAnimationFrame(measure);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes the layout inputs
  }, deps);

  return factor;
}
