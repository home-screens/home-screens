import { useEffect, useRef, useState } from 'react';

export const FOCUSABLE =
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
  /**
   * False while the element is not on show: a sheet that stays mounted and
   * slides away when closed. The trap starts each time this turns true, and
   * hands focus back when it turns false.
   */
  active?: boolean;
  /**
   * A field inside that took focus as it mounted (`autoFocus`, a form opened
   * to be written in) keeps it, instead of `focus` moving it on.
   */
  keepAutoFocus?: boolean;
}

const FIELDS = 'input:not([disabled]):not([type="hidden"]), textarea:not([disabled])';

/**
 * Traps keyboard focus inside the referenced element while mounted (and
 * `active`). Restores focus to the previously-focused element afterwards.
 */
export function useFocusTrap<T extends HTMLElement>({ focus = 'first', active = true, keepAutoFocus = false }: FocusTrapOptions = {}) {
  const ref = useRef<T>(null);
  // What had focus before anything inside could take it: `autoFocus` runs
  // before this hook's effect does, so by then focus is already inside.
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement));

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    const autoFocused = keepAutoFocus && el !== document.activeElement && el.contains(document.activeElement);
    const previouslyFocused = (autoFocused ? opener : document.activeElement) as HTMLElement | null;

    if (autoFocused) {
      // Already where it should be.
    } else if (focus === 'container') {
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
  }, [focus, active, keepAutoFocus, opener]);

  return ref;
}
