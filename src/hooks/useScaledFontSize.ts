'use client';

import type { RefCallback } from 'react';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { useElementBox } from './useElementBox';

/**
 * Scales a font size off the container's height, tracked with a callback ref.
 *
 * The callback ref is load-bearing. A module that paints a loading or empty
 * branch before its real tree — weather is always in one on its first paint,
 * news whenever its feeds are still in flight — attaches this element on a
 * later render than the one that mounts the module. An effect-attached
 * RefObject never sees that: the effect runs once, while the element does not
 * exist yet, and nothing re-runs it, so the size stayed at the raw style font
 * size for the life of the page. Every weather view rendered that way.
 *
 * `baseFontSize` (the module's Style > font size) is a **bias on the size the
 * module picks**, applied after that size is floored at the default.
 *
 * It used to be `max(base, measured)`, which made the control inert: comparing
 * the user's value against an *unbiased* measured size means the measured size
 * wins in any module big enough to read, so the setting only did anything once
 * it was raised past the size the module had already chosen — and then the fit
 * clamped it straight back.
 *
 * Those are two separate things, and only the first was broken. The floor is a
 * readability guarantee: a module never renders below the default size on a
 * wall, however small its card. Multiplying outside it keeps that guarantee and
 * still makes the setting live, because the floor only binds in a card too
 * small for the base size. At the default the bias is exactly 1, so this
 * collapses to what shipped before and no untouched module moves a pixel.
 */
export function useScaledFontSize(
  baseFontSize: number,
  scaleFactor: number,
): {
  containerRef: RefCallback<HTMLDivElement>;
  scaledFontSize: number;
  /** The measured padding box, for callers that also lay out across the width. */
  boxWidth: number;
  boxHeight: number;
} {
  // Padding box: the historical measurement is `clientHeight`, and the scale
  // factors are all tuned against it.
  //
  // A known trade, not an oversight (plan 50, item 17): raising `Style >
  // Padding` grows this box and therefore the type, in a card whose content
  // area just shrank. Measuring the content box instead would be a one-line
  // change, but every factor would then need re-tuning and every wall with a
  // non-default padding would move. Left as is, on purpose, until the
  // auto-size rework in `.claude/plans/future/module-autosize-v2.md`.
  const [containerRef, box] = useElementBox<HTMLDivElement>('padding');
  // A hand-edited config could carry 0 or a nonsense value; a bias of 1 renders
  // the module at the size it picks for itself rather than at nothing.
  const bias = Number.isFinite(baseFontSize) && baseFontSize > 0
    ? baseFontSize / DEFAULT_MODULE_STYLE.fontSize
    : 1;
  return {
    containerRef,
    // An unmeasured box needs no special case: it floors to the default, which
    // the bias turns back into the raw style size, exactly what this hook has
    // always reported until its element existed.
    scaledFontSize: Math.max(DEFAULT_MODULE_STYLE.fontSize, box.height * scaleFactor) * bias,
    boxWidth: box.width,
    boxHeight: box.height,
  };
}
