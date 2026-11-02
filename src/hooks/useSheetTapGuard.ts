'use client';

import { useCallback, useEffect, useState } from 'react';
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
