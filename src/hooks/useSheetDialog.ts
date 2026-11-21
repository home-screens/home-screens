'use client';

import type { KeyboardEvent, RefObject } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface SheetDialogOptions {
  /** What Escape does. Leave out for a sheet that Escape must not close (one busy saving). */
  onClose?: () => void;
  /** Where focus lands as it opens; see `useFocusTrap`. A phone sheet takes `container`, which keeps the keyboard down. */
  focus?: 'first' | 'container' | 'field';
  /** False while a sheet that stays mounted is closed or covered. */
  active?: boolean;
}

export interface SheetDialogProps<T extends HTMLElement> {
  ref: RefObject<T | null>;
  role: 'dialog';
  'aria-modal': true;
  tabIndex: -1;
  onKeyDown: (event: KeyboardEvent<T>) => void;
}

/**
 * What every phone sheet's panel needs to be the modal dialog it says it is:
 * focus moves into it, Tab stays inside it, and Escape closes it. Spread the
 * result onto the panel and give it an `aria-label` and `outline: none`.
 *
 * One Escape closes one sheet, the one on top: the key press stops here, and
 * a press that came from a dialog nested inside this one (a time picker in a
 * sheet) is left for that dialog.
 */
export function useSheetDialog<T extends HTMLElement>({ onClose, focus = 'container', active = true }: SheetDialogOptions): SheetDialogProps<T> {
  const ref = useFocusTrap<T>({ focus, active });
  return {
    ref,
    role: 'dialog',
    'aria-modal': true,
    tabIndex: -1,
    onKeyDown: (event) => {
      if (event.key !== 'Escape' || !active || !onClose) return;
      if ((event.target as HTMLElement).closest('[role="dialog"]') !== event.currentTarget) return;
      event.stopPropagation();
      onClose();
    },
  };
}
