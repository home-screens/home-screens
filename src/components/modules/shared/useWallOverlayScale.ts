'use client';

import { useEffect, useState } from 'react';

export interface WallOverlayScale {
  /** The window's size in CSS pixels. */
  w: number;
  h: number;
  /** One authored pixel in this window's pixels. */
  unit: number;
  /** Authored pixels (at 1080 across the short side) to this window's pixels. */
  P: (n: number) => number;
  landscape: boolean;
}

/**
 * The scale of an overlay portalled to the body (the recipe card, the recipe
 * book sheet): it escapes the screen's own zoom, so it is authored at 1080
 * across the short side of the window, like the full-screen views, and
 * follows the window when it changes.
 */
export function useWallOverlayScale(): WallOverlayScale {
  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { w: 1080, h: 1920 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const unit = Math.min(vp.w, vp.h) / 1080;
  return { w: vp.w, h: vp.h, unit, P: (n: number) => n * unit, landscape: vp.w > vp.h };
}
