'use client';

import type { RefCallback } from 'react';
import { DEFAULT_MODULE_STYLE, type ModuleStyle } from '@/types/config';
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
 * `style.fontSize` is a **floor in pixels**: the module never renders below
 * it, however small its card, and in a card large enough it is the fitted
 * size that shows. That is what the field has always meant here, and it is
 * already the base times the Text size percent by the time it arrives (see
 * resolveModuleStyle), so the percent raises or lowers the floor and never
 * multiplies the fitted size. For one release it did (`fontSize / 16` as a
 * bias): at the default that is exactly 1, so every gallery shot at the
 * default passed, and every wall that had ever set a normal pixel size on one
 * of these modules had its fitted text multiplied by two or three.
 */
export function useScaledFontSize(
  style: Pick<ModuleStyle, 'fontSize'>,
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
  // A hand-edited config could carry 0 or a nonsense value; the default
  // floor keeps the module readable rather than rendering it at nothing.
  const floor = Number.isFinite(style.fontSize) && style.fontSize > 0
    ? style.fontSize
    : DEFAULT_MODULE_STYLE.fontSize;
  return {
    containerRef,
    // An unmeasured box needs no special case: it floors to the style size,
    // exactly what this hook has always reported until its element existed.
    scaledFontSize: Math.max(floor, box.height * scaleFactor),
    boxWidth: box.width,
    boxHeight: box.height,
  };
}
