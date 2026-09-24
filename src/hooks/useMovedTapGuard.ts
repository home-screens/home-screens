'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** How long a row that moved on screen ignores taps: longer than the slow "did it work?" second taps seen in testing. */
export const MOVED_TAP_GUARD_MS = 3000;

/**
 * Ignores taps on a list row for a moment after it moved on screen.
 *
 * When something above a row changes size (a row above grows or shrinks, a
 * note comes or goes, the page gets shorter at the bottom and scrolls back),
 * the row slides, and a second tap meant for what used to be there lands on
 * it: a double tap on "Let it go" ticked, and paid for, the chore that slid
 * up underneath. A time guard over the whole list was either too short for a
 * slow "did it work?" tap or swallowed taps on rows that had not moved.
 *
 * So each row measures where it sits on screen after every render and
 * remembers when that last changed. Its handlers, wrapped in `guard`, do
 * nothing for `MOVED_TAP_GUARD_MS` after a move. A row that did not move is
 * tappable at once. Scrolling moves every row but is the person's own doing:
 * it only updates where the row is, as does a change of `view` (another
 * child or day picked, which redraws the whole list).
 */
export function useMovedTapGuard<T extends HTMLElement>(view: string) {
  const ref = useRef<T>(null);
  // Where it sat on screen (catches the page shrinking at the bottom, which
  // scrolls it) and on the page (unchanged by scrolling).
  const last = useRef<{ top: number; pageTop: number; view: string } | null>(null);
  const movedAt = useRef(0);

  // Every render: a row only moves when something renders.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const before = last.current;
    last.current = { top, pageTop: top + window.scrollY, view };
    // Another child or day: a fresh list, with nothing moved under anyone's finger.
    if (before && before.view !== view) movedAt.current = 0;
    else if (before && Math.abs(before.top - top) > 2) movedAt.current = Date.now();
  });

  useEffect(() => {
    const rebase = () => {
      const el = ref.current;
      if (el && last.current) {
        const top = el.getBoundingClientRect().top;
        last.current = { ...last.current, top, pageTop: top + window.scrollY };
      }
    };
    window.addEventListener('scroll', rebase, { passive: true, capture: true });
    window.addEventListener('resize', rebase);
    return () => {
      window.removeEventListener('scroll', rebase, { capture: true });
      window.removeEventListener('resize', rebase);
    };
  }, []);

  const guard = useCallback(<A extends unknown[]>(action: ((...args: A) => void) | undefined) => {
    if (!action) return undefined;
    return (...args: A) => {
      // Measured again at the tap, on the page so a scroll never counts:
      // something that is not this row's own render (a row above whose hint
      // came and went) can move it too.
      const el = ref.current;
      if (el && last.current) {
        const top = el.getBoundingClientRect().top;
        const pageTop = top + window.scrollY;
        if (Math.abs(pageTop - last.current.pageTop) > 2) movedAt.current = Date.now();
        last.current = { ...last.current, top, pageTop };
      }
      if (Date.now() - movedAt.current < MOVED_TAP_GUARD_MS) return;
      action(...args);
    };
  }, []);

  return { ref, guard };
}
