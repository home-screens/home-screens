'use client';

import { useEffect, useState } from 'react';

/**
 * The window's size, for overlays portalled to the body (the recipe card, the
 * recipe book sheet): they escape the screen's own scaling and are authored
 * at 1080 across the short side of the window instead.
 */
export function useViewportSize(): { w: number; h: number } {
  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { w: 1080, h: 1920 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}
