'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Never shrink past this fraction of the requested size — below it the view is
 *  unreadable anyway, and a hard floor bounds the search. */
const MIN_FACTOR = 0.34;
/** Bisection steps. 7 gives ~0.5% precision over the [MIN_FACTOR, 1] range. */
const STEPS = 7;

/**
 * Attribute the caller must stamp on the measured element, carrying the factor
 * that element is currently rendered at.
 *
 * This is the hook's half of a two-way contract, and it is load-bearing — see
 * the staleness note on `useFitScale`. Without it the hook cannot tell whether
 * the layout it is about to measure belongs to the probe it is testing.
 */
export const FIT_FACTOR_ATTR = 'data-fit-factor';

/** How many frames to wait for React to commit a probe before giving up and
 *  measuring anyway. Bounded so a caller that forgets to stamp the attribute
 *  degrades to the old behaviour instead of spinning at 60fps forever. */
const MAX_COMMIT_WAIT_FRAMES = 20;

/**
 * The largest scale factor at which a fixed-height layout still fits its canvas.
 *
 * Panorama and Almanac are vertical stacks of fixed-height cards, unlike the
 * other fullscreen modules whose grids reflow, so a large `typographySize` can
 * push them past the canvas and clip.
 *
 * This bisects rather than shrinking one-directionally. A shrink-only loop
 * converges on *a* factor that fits, not the *largest* one, and the landing
 * point depends on how many passes it took — which made the rendered hero
 * non-monotonic across typography sizes (2x-large came out larger than
 * 4x-large). Bisection always returns the best factor for a given content set,
 * so bigger settings reliably render bigger.
 *
 * Returns 1 whenever the content already fits, so the common sizes pay nothing.
 *
 * ## Why the caller must stamp `FIT_FACTOR_ATTR`
 *
 * Each step dispatches `setFactor(probe)` and schedules the next measurement
 * for the following animation frame. That silently assumes React has committed
 * the probe by then, and it has not: React's scheduler commits on a
 * MessageChannel task, so under load — rapid config edits are exactly that —
 * the commit slips past the next frame.
 *
 * When it slips, the loop judges the new probe against the *previous* layout.
 * A "does not fit" verdict for a probe that would have fit drags `hi` down and
 * the bisection converges inside the wrong interval: measured live, a probe of
 * 0.67 was judged against the 1.0 layout (`scrollHeight` 2153 vs a 1920 box)
 * and the view settled around 0.66 instead of 0.88. Type came out tiny, the
 * `flex: 1` sections absorbed the slack, and the 7-day rows spread apart — and
 * it stuck, because nothing re-runs the effect until the deps change again.
 * Reloading the page was the only cure.
 *
 * So the loop no longer trusts the clock. It reads the factor off the very
 * element it is about to measure: React writes the attribute and the styles in
 * the same commit, so an attribute that matches the probe proves the layout
 * does too. If it does not match yet, the frame is skipped, not counted.
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
    let waited = 0;

    /**
     * Whether the element is rendered at `probe` right now. An absent
     * attribute means the caller opted out of the contract; treat the layout
     * as current rather than blocking on a promise nobody made.
     */
    const isCommitted = (node: HTMLElement, probe: number) => {
      const stamped = node.getAttribute(FIT_FACTOR_ATTR);
      if (stamped === null) return true;
      return Math.abs(Number(stamped) - probe) < 1e-9;
    };

    const fits = (node: HTMLElement) =>
      node.scrollHeight - node.clientHeight <= 1 && node.scrollWidth - node.clientWidth <= 1;

    const measure = () => {
      if (cancelled) return;
      const node = ref.current;
      if (!node) return;
      const st = stateRef.current;

      // Measuring a layout that belongs to the previous probe corrupts the
      // bisection permanently, so wait for the commit instead of guessing.
      if (!isCommitted(node, st.probe) && waited < MAX_COMMIT_WAIT_FRAMES) {
        waited += 1;
        raf = requestAnimationFrame(measure);
        return;
      }
      waited = 0;

      if (fits(node)) {
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
