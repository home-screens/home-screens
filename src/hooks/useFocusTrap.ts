import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
  /**
   * Where focus lands when the trap mounts. `first` (the default) is the
   * first control inside. `container` is the element itself, which must carry
   * `tabIndex={-1}`: for a sheet on a phone, where focusing a text field
   * would open the keyboard over a sheet nobody has read yet. `field` is the
   * first text box inside (the container when there is none): for a sheet
   * opened by a tap that already meant "write", where the keyboard is wanted.
   */
  focus?: 'first' | 'container' | 'field';
}

const FIELDS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled])';

/**
 * Traps keyboard focus inside the referenced element while mounted.
 * Restores focus to the previously-focused element on unmount.
 */
export function useFocusTrap<T extends HTMLElement>({ focus = 'first' }: FocusTrapOptions = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (focus === 'container') {
      el.focus({ preventScroll: true });
    } else if (focus === 'field') {
      const field = el.querySelector<HTMLElement>(FIELDS);
      (field ?? el).focus({ preventScroll: true });
    } else {
      // Auto-focus the first focusable child
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) {
        // Nothing to move to: focus stays on the container, not the page behind.
        e.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl || document.activeElement === el) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [focus]);

  return ref;
}
