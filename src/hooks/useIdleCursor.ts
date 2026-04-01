'use client';

import { useEffect, useRef } from 'react';

/**
 * Hides the cursor after a period of inactivity.
 * Moving the mouse immediately restores it.
 */
export function useIdleCursor(idleSeconds = 3) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const idleMs = idleSeconds * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const hide = () => el.classList.add('cursor-idle');

    const show = () => {
      el.classList.remove('cursor-idle');
      clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    };

    // Start hidden
    hide();

    el.addEventListener('mousemove', show);
    el.addEventListener('touchstart', show, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('mousemove', show);
      el.removeEventListener('touchstart', show);
      el.classList.remove('cursor-idle');
    };
  }, [idleSeconds]);

  return ref;
}
