'use client';

import { useMemo } from 'react';
import type { RefCallback } from 'react';
import { useElementBox } from './useElementBox';

/** Dimensions returned by the hook. */
export interface FullscreenDims {
  w: number;
  h: number;
}

/** Portrait display, assumed until the first measurement lands. */
const DEFAULT_DIMS: FullscreenDims = { w: 1080, h: 1920 };

/**
 * Content dimensions of a fullscreen module's container.
 *
 * A callback ref, so the element may mount later than the component and the
 * observer follows it when a module swaps which element carries the ref (the
 * fullscreen news module hands it to a loading shell first, then to the real
 * view). An effect-attached RefObject saw neither: it observed whatever existed
 * when the effect ran, once, and a module that painted a "set your location"
 * branch first would keep the portrait default on a landscape panel for the
 * life of the page. That is the bug that pinned every weather view to 16px.
 *
 * Defaults to 1080x1920 until measured, so a landscape panel never shows a
 * portrait frame — the first measurement lands in the same commit, before paint.
 */
export function useFullscreenDims(): {
  containerRef: RefCallback<HTMLDivElement>;
  dims: FullscreenDims;
} {
  const [containerRef, box] = useElementBox<HTMLDivElement>();
  // Memoised so the identity is stable between measurements: `dims` feeds the
  // scale memos in every fullscreen module.
  const dims = useMemo<FullscreenDims>(
    () => (box.width > 0 && box.height > 0 ? { w: box.width, h: box.height } : DEFAULT_DIMS),
    [box.width, box.height],
  );
  return { containerRef, dims };
}
