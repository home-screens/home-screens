'use client';

import { useEffect } from 'react';
import { guardAfterSheetClose, watchSheetTaps } from '@/lib/sheet-tap-guard';

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
