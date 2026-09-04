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
 * `baseFontSize` (the module's Style > font size) is a **bias on the measured
 * size, not a floor under it**. It used to be `max(base, measured)`, which made
 * the control inert: the measured size is larger than the 16px default in any
 * module big enough to read, so the setting only did anything once it was raised
 * past the size the module had already chosen — and then the fit clamped it
 * straight back. As a bias, the default renders exactly as before (16/16 = 1)
 * and every other value scales the whole view by the ratio the user asked for.
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
  const [containerRef, box] = useElementBox<HTMLDivElement>('padding');
  // A hand-edited config could carry 0 or a nonsense value; a bias of 1 renders
  // the module at the size it picks for itself rather than at nothing.
  const bias = Number.isFinite(baseFontSize) && baseFontSize > 0
    ? baseFontSize / DEFAULT_MODULE_STYLE.fontSize
    : 1;
  return {
    containerRef,
    // Zero height = not measured yet (the element mounts this same commit, so
    // this is at most one render). Fall back to the raw size rather than to
    // nothing, exactly as this hook has always done.
    scaledFontSize: box.height > 0 ? box.height * scaleFactor * bias : baseFontSize,
    boxWidth: box.width,
    boxHeight: box.height,
  };
}
