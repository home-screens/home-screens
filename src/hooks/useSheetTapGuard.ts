'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { DOUBLE_TAP_MS, guardAfterSheetClose, isTooSoonAfterOpen, watchSheetTaps } from '@/lib/sheet-tap-guard';

/**
 * For a sheet or menu: when it closes because of a tap, a second tap near
 * that spot is ignored for a moment, so a double tap on a choice never
 * reaches what the sheet was covering (`src/lib/sheet-tap-guard.ts`).
 */
export function useSheetTapGuard(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    watchSheetTaps();
    return () => guardAfterSheetClose();
  }, [enabled]);
}

/**
 * For a sheet opened by a tap: wraps an action (closing it from the backdrop,
 * say) so a tap that comes within `windowMs` of the sheet opening does
 * nothing. The second tap of a double tap on what opened the sheet lands on
 * the sheet itself (`isTooSoonAfterOpen`). The clock starts when the sheet
 * mounts.
 */
export function useSettledTap(windowMs = DOUBLE_TAP_MS): (action: () => void) => () => void {
  const [openedAt] = useState(() => Date.now());
  return useCallback(
    (action: () => void) => () => {
      if (isTooSoonAfterOpen(openedAt, Date.now(), windowMs)) return;
      action();
    },
    [openedAt, windowMs],
  );
}

/**
 * For a sheet whose buttons change in place (a form's next step, a question
 * that replaces its buttons): true for a double tap's length after `key`
 * changes, and after it mounts. Disable the buttons while it is true, and the
 * second tap of a double tap on what changed it lands on nothing, rather than
 * on whatever now sits under the finger (Cancel, Save, "Just this day").
 * Disabled is also what a test runner waits out before it clicks.
 *
 * `fromMount: false` is for buttons that come up on a tap and only move
 * later (a row that loses one of its buttons while it is up): they take taps
 * at once, and hold only after `key` changes.
 */
export function useSettling(
  key: unknown,
  windowMs = DOUBLE_TAP_MS,
  { fromMount = true }: { fromMount?: boolean } = {},
): boolean {
  // Each change of key is numbered, so coming back to a key seen before
  // settles again from then. Counted here rather than reset in the effect's
  // cleanup, which a development build runs once on mount as well.
  const seen = useRef({ key, change: 0 });
  if (!Object.is(seen.current.key, key)) seen.current = { key, change: seen.current.change + 1 };
  const change = seen.current.change;
  const [settledChange, setSettledChange] = useState(fromMount ? -1 : 0);
  useEffect(() => {
    const timer = setTimeout(() => setSettledChange(change), windowMs);
    return () => clearTimeout(timer);
  }, [change, windowMs]);
  return settledChange !== change;
}

/**
 * For a sheet that can open under a finger already on the screen: the
 * grown-up code pad opens while a long press on a chore is still held. A tap
 * then counts only once a finger has gone down inside the sheet, so the lift
 * of the press that opened it never types a key or closes the pad. A click
 * from the keyboard (no pointer at all) always counts.
 *
 * Spread the answer on the sheet's outermost element, so the dimmed area is
 * covered too.
 */
export function useFreshPressesOnly(): {
  onPointerDownCapture: () => void;
  onClickCapture: (event: MouseEvent) => void;
} {
  const armed = useRef(false);
  return useMemo(() => ({
    onPointerDownCapture: () => { armed.current = true; },
    onClickCapture: (event: MouseEvent) => {
      if (armed.current || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    },
  }), []);
}
