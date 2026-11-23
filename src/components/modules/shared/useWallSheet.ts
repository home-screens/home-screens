'use client';

import { useInteractionHold } from '@/lib/interaction-hold';
import { useSettledTap } from '@/hooks/useSheetTapGuard';
import { useAutoClose } from './useAutoClose';

export interface WallSheetOptions {
  /** Closes the sheet: a settled scrim tap, or nobody touching it for `autoCloseMs`. */
  onClose: () => void;
  /** How long it stays with nobody touching it; every touch starts the wait over. */
  autoCloseMs: number;
  /** Something is open on top (an event's detail, the grown-up pad): the wait stops until it closes. */
  paused?: boolean;
  /** Starts the wait over when it changes (a new recipe on the same card). */
  restartKey?: string | number | boolean | null;
}

/**
 * What every sheet over the wall does while it is open, whether it portals
 * over the screen (`WallOverlay`) or sits inside a module's own box (a store's
 * confirm, a bonus chore's sheet): it holds rotation and flick navigation, it
 * closes itself after `autoCloseMs` with nobody touching it, so a kiosk nobody
 * stands at never shows a sheet forever, and a scrim tap within a double tap
 * of opening is ignored, since that is the second tap on what opened it.
 *
 * `touched` goes on the sheet's `onPointerDown`, so every touch starts the
 * wait over; `settled(action)` wraps the scrim's close.
 */
export function useWallSheet({ onClose, autoCloseMs, paused = false, restartKey }: WallSheetOptions): {
  touched: () => void;
  settled: (action: () => void) => () => void;
} {
  useInteractionHold();
  const touched = useAutoClose(onClose, autoCloseMs, { restartKey, paused });
  const settled = useSettledTap();
  return { touched, settled };
}
