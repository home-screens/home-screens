'use client';
import { useRef, useState, useLayoutEffect } from 'react';

/** Never scale below this, however small the box gets. */
const MIN_FONT_PX = 6;
/** Leave a sliver of slack so sub-pixel rounding can't reintroduce an overflow. */
const SAFETY = 0.995;
/** Stop once the largest known-fitting and smallest known-too-big scales are this close. */
const TOLERANCE = 0.02;
/**
 * Hard cap on measure/correct rounds per content change. Each round is a
 * re-render; the bracket halves every round, so 8 is far more precision than
 * TOLERANCE needs and exists only to bound pathological content.
 */
const MAX_STEPS = 8;

/**
 * Scales a font size down until the measured content fits its box, landing on
 * the largest size that fits.
 *
 * `useScaledFontSize` derives a font size from the container height alone, which
 * only works when a view's footprint is a fixed multiple of its font size. That
 * assumption breaks for any layout whose size depends on configuration or width
 * — the weather `current` view is 12.4em tall with one stat and 15.1em with six,
 * because the stats row wraps; `daily` runs out of width before height once it
 * lays five day columns side by side. No single scale factor fits those, so the
 * content has to be measured.
 *
 * Attach `boxRef` to the fixed-size container and `contentRef` to a wrapper
 * around the content — either a natural-height one (measured via offsetHeight)
 * or a fill-height one whose children overflow (measured via scrollHeight).
 * Both axes are fitted.
 *
 * Pass a `resetKey` that changes whenever the content itself changes (which
 * config rows render, the day count, …) so the fit is recomputed from scratch
 * rather than staying shrunk after the content gets shorter.
 *
 * Never scales up past `desired`: when the content already fits, `fontSize` is
 * `desired` unchanged, so views that never overflow render exactly as before.
 */
export function useFitFontSize(desired: number, resetKey: string): {
  boxRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
} {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // `lo` is the largest scale measured to fit, `hi` the smallest measured not to.
  // Keyed so a change in `desired`/`resetKey` renders at full size again before
  // re-measuring; storing the key alongside avoids a reset-then-measure effect
  // ordering problem.
  const [fit, setFit] = useState({ key: '', scale: 1, lo: 0, hi: Infinity, steps: 0 });
  const matches = fit.key === `${desired}|${resetKey}`;
  const key = `${desired}|${resetKey}`;
  const scale = matches ? fit.scale : 1;
  const lo = matches ? fit.lo : 0;
  const hi = matches ? fit.hi : Infinity;
  const steps = matches ? fit.steps : 0;

  // Layout effect: measure and correct before the browser paints, so an
  // overflowing first frame never reaches the screen.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const measure = () => {
      const boxH = box.clientHeight;
      const boxW = box.clientWidth;
      // offsetHeight covers a natural-height wrapper; scrollHeight covers a
      // fill-height one whose own children overflow (the `combined` view splits
      // itself into fixed 25/25/50 bands, so its wrapper is always exactly the
      // box height while the rows inside a band spill past the bottom).
      const contentH = Math.max(content.offsetHeight, content.scrollHeight);
      // Width matters too: a forecast row of day columns overflows sideways
      // before it overflows down. `scrollWidth` only sees overflow past the END
      // edge, so any row measured this way must pack toward the start when it
      // overflows (justify-between/start, never around/center — those split the
      // overflow across both edges and would leave half of it unmeasured).
      const contentW = content.scrollWidth;
      if (!boxH || !contentH) return;

      // Fit is judged in pixels, not by how small the correction got: a
      // step-size threshold tolerates a different number of pixels at every
      // scale and box size, and left `current` one pixel over at 600x700 while
      // passing at every other size.
      const fits = contentH <= boxH && (!contentW || contentW <= boxW);
      const nextLo = fits ? Math.max(lo, scale) : lo;
      const nextHi = fits ? hi : Math.min(hi, scale);

      // Nothing bigger than `desired` is on the table, so a fit at scale 1 is done.
      if (fits && nextHi === Infinity) return;
      // Bracket tight enough, or out of rounds: settle on a size known to fit.
      if (steps >= MAX_STEPS || nextHi - nextLo <= TOLERANCE) {
        if (!fits && nextLo > 0 && nextLo < scale) {
          setFit({ key, scale: nextLo, lo: nextLo, hi: nextHi, steps: steps + 1 });
        }
        return;
      }

      // Overflowing with no known-good scale yet: jump straight to the
      // proportional estimate, which is usually within a few percent. After
      // that the bracket bisects, so a bad estimate costs rounds, not accuracy.
      const next = fits
        ? Math.min(1, (scale + nextHi) / 2)
        : nextLo > 0
          ? (nextLo + scale) / 2
          : Math.max(
            MIN_FONT_PX / desired,
            scale * Math.min(boxH / contentH, boxW && contentW ? boxW / contentW : 1) * SAFETY,
          );

      if (Math.abs(next - scale) > 0.001) {
        setFit({ key, scale: next, lo: nextLo, hi: nextHi, steps: steps + 1 });
      }
    };

    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(content);
    measure();
    return () => ro.disconnect();
  });

  return { boxRef, contentRef, fontSize: desired * scale };
}
