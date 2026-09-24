'use client';

import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** How long a press has to last to count as a hold rather than a tap. */
export const LONG_PRESS_MS = 500;

export interface LongPressHandlers {
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
}

/**
 * A tap does one thing, a hold another: the grown-up's chore menu on the
 * phone. `base` holds the row's own handlers (a tap, or the kid view's
 * hold-to-uncheck); they run as before unless the hold fires, and the click
 * that follows a hold is swallowed so it cannot tick the chore as well. A
 * right-click opens the same menu on a computer.
 */
export function useLongPress(): (
  onLongPress: (() => void) | undefined,
  base: Partial<LongPressHandlers>,
) => Partial<LongPressHandlers> {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (onLongPress, base) => {
    if (!onLongPress) return base;
    const stop = () => clearTimeout(timer.current);
    return {
      ...base,
      onPointerDown: (e) => {
        fired.current = false;
        stop();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
        base.onPointerDown?.(e);
      },
      onPointerUp: (e) => { stop(); base.onPointerUp?.(e); },
      onPointerCancel: (e) => { stop(); base.onPointerCancel?.(e); },
      onPointerLeave: (e) => { stop(); base.onPointerLeave?.(e); },
      onClick: (e) => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        base.onClick?.(e);
      },
      // A phone raises its own context menu on a long touch, often right as
      // the timer fires: whichever comes first opens the menu, once.
      onContextMenu: (e) => {
        e.preventDefault();
        stop();
        if (fired.current) return;
        fired.current = true;
        onLongPress();
      },
    };
  };
}
