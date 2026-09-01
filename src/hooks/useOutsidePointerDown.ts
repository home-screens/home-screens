'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onOutside` on any pointerdown that lands outside every element in
 * `insideRefs`. Listens in the capture phase, so a handler on the pressed
 * element that stops propagation (common on popover roots and their toggle
 * buttons) cannot keep a sibling popover from closing. The standard "click
 * away" closer for the editor's non-modal menus and popovers.
 */
export function useOutsidePointerDown(
  enabled: boolean,
  insideRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onOutside: () => void,
): void {
  const refsRef = useRef(insideRefs);
  refsRef.current = insideRefs;
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      onOutsideRef.current();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [enabled]);
}
