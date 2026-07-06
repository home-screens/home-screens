'use client';

import { useState, useEffect } from 'react';
import type { RefObject } from 'react';

// Auto-fit: scale content to fill container.

export interface AutoFitResult {
  scale: number;
  measuredWidth: number;
  measuredHeight: number;
}

export function useAutoFit(
  containerRef: RefObject<HTMLDivElement | null>,
  measureRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  deps: unknown[],
): AutoFitResult {
  const [state, setState] = useState<AutoFitResult>({ scale: 1, measuredWidth: 0, measuredHeight: 0 });

  useEffect(() => {
    if (!enabled) {
      setState({ scale: 1, measuredWidth: 0, measuredHeight: 0 });
      return;
    }
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    let rafHandle: number;

    const remeasure = () => {
      cancelAnimationFrame(rafHandle);
      rafHandle = requestAnimationFrame(() => {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const sw = measure.offsetWidth;
        const sh = measure.offsetHeight;

        if (sw > 0 && sh > 0 && cw > 0 && ch > 0) {
          setState({ scale: Math.min(cw / sw, ch / sh, 5), measuredWidth: sw, measuredHeight: sh });
        } else {
          setState({ scale: 1, measuredWidth: 0, measuredHeight: 0 });
        }
      });
    };

    remeasure();

    // Re-measure when container is resized (e.g. user resizes module in editor)
    const observer = new ResizeObserver(remeasure);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafHandle);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a spread array from the caller; the linter can't statically verify its contents
  }, [enabled, ...deps]);

  return state;
}
