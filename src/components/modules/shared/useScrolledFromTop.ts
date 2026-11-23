'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether a scrolling box has left its top. A list that shows "and N more"
 * at rest keeps the rows past that line hidden until a finger moves it, or
 * whatever room was left under the line showed the next row (cut in half, or
 * whole while the line said it was hidden).
 */
export function useScrolledFromTop(boxRef: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (!enabled || !box) return;
    const read = () => setMoved(box.scrollTop > 1);
    read();
    box.addEventListener('scroll', read, { passive: true });
    return () => box.removeEventListener('scroll', read);
  }, [boxRef, enabled]);
  return enabled && moved;
}
