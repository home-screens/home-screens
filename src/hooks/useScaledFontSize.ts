'use client';

import { useCallback, useEffect, useRef, type RefCallback } from 'react';
import { DEFAULT_MODULE_STYLE, type ModuleStyle } from '@/types/config';
import { useElementBox } from './useElementBox';
import { resolveTextScale } from '@/lib/module-style';

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
 * Fit to box is the default, and Text size scales it:
 *
 *   size = max(fontSize, fitted * textScale)
 *
 * - `fitted` is the card's height times the module's factor: what the module
 *   shows on its own, and what 100% means.
 * - `textScale` (absent = 100%) scales it in both directions, so a new clock
 *   can be made smaller than it fits as well as larger.
 * - `fontSize` is a floor in pixels the text never drops below. It arrives
 *   already scaled (resolveModuleStyle makes it base times percent once
 *   `textScale` is set), so the floor follows the same number. A module from
 *   before Text size existed carries only this, and renders exactly as it
 *   always did; the editor shows that value as a percent of the fitted size
 *   (published on the container as `data-fitted-px`), and the first edit
 *   writes `textScale` and resets the floor to the base.
 *
 * The multiplier comes only from `textScale`, never from the pixel value.
 * For one release it came from `fontSize / 16`: at the default that is
 * exactly 1, so every gallery shot at the default passed, and every wall that
 * had ever set a normal pixel size on one of these modules had its fitted
 * text multiplied by two or three.
 */
export const FITTED_PX_ATTR = 'data-fitted-px';

export function useScaledFontSize(
  style: Pick<ModuleStyle, 'fontSize' | 'textScale'>,
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
  const [attach, box] = useElementBox<HTMLDivElement>('padding');
  const elRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback<RefCallback<HTMLDivElement>>((el) => {
    elRef.current = el;
    attach(el);
  }, [attach]);
  const fitted = box.height * scaleFactor;
  // A hand-edited config could carry 0 or a nonsense value; the default
  // floor keeps the module readable rather than rendering it at nothing.
  const floor = Number.isFinite(style.fontSize) && style.fontSize > 0
    ? style.fontSize
    : DEFAULT_MODULE_STYLE.fontSize;
  // Published for the editor, which converts an old pixel floor to a percent
  // of this rather than of the base (see displayTextPercent).
  useEffect(() => {
    elRef.current?.setAttribute(FITTED_PX_ATTR, String(Math.round(fitted * 100) / 100));
  }, [fitted]);
  return {
    containerRef,
    // An unmeasured box needs no special case: it floors to the style size,
    // exactly what this hook has always reported until its element existed.
    scaledFontSize: Math.max(floor, fitted * resolveTextScale(style)),
    boxWidth: box.width,
    boxHeight: box.height,
  };
}
