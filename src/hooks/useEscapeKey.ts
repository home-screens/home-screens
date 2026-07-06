import { useEffect } from 'react';

/**
 * Calls `onEscape` when the Escape key is pressed anywhere in the window.
 * The standard close handler for modals and popovers (see useFocusTrap for
 * the matching focus behavior).
 *
 * Pass `enabled: false` to suspend the listener without unmounting the
 * component (e.g. while a save is in flight and closing must be blocked).
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onEscape, enabled]);
}
