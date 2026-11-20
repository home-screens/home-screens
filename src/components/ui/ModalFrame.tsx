'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import ModalPortal from './ModalPortal';

/**
 * Dismissal behaviour every dialog is expected to have: Escape closes, a click
 * on the backdrop closes, Tab stays inside, and the dialog is announced with
 * its own visible heading. The panel itself stays with the caller — the four
 * editor dialogs that use this look nothing like each other.
 *
 * Pass `closable={false}` while a save or install is in flight so a stray
 * Escape can't orphan half-finished work.
 *
 * A frame opened from inside another one (the plugin store's install window,
 * a picture picker over a settings window) is the only one that answers
 * Escape while it is up: one Escape closes one window, and a window that is
 * busy keeps the one underneath open too.
 */

/**
 * How a frame learns that another frame is open inside it. Counted through
 * the tree, not by which opened last: a window that is redrawn while its
 * inner window stays up (the plugin store after an install) must still
 * count as the one underneath.
 */
const OuterFrame = createContext<{ opened: () => void; closed: () => void } | null>(null);

export default function ModalFrame({
  label,
  labelledBy,
  onClose,
  closable = true,
  className,
  backdropClassName = 'bg-black/60',
  children,
}: {
  /** Fallback announcement when there is no visible heading to point at. */
  label?: string;
  /** Id of the dialog's own `<h2>`; preferred over `label`. */
  labelledBy?: string;
  onClose: () => void;
  closable?: boolean;
  className?: string;
  /** How dark the page behind goes. A window over another window dims a little less. */
  backdropClassName?: string;
  children: ReactNode;
}) {
  const outer = useContext(OuterFrame);
  const innerOpen = useRef(0);
  const self = useMemo(
    () => ({
      opened: () => { innerOpen.current += 1; },
      closed: () => { innerOpen.current -= 1; },
    }),
    [],
  );
  useEffect(() => {
    if (!outer) return;
    outer.opened();
    return outer.closed;
  }, [outer]);
  const closeIfOnTop = useCallback((event: KeyboardEvent) => {
    if (innerOpen.current !== 0) return;
    // Marked as handled: closing can finish between two listeners of one key
    // press, and the window underneath would then find nothing inside it
    // and close as well.
    event.preventDefault();
    onClose();
  }, [onClose]);
  // Every open frame hears the key; only the innermost one acts on it.
  useEscapeKey(closeIfOnTop, closable);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
      >
        <div
          className={`absolute inset-0 ${backdropClassName}`}
          onClick={closable ? onClose : undefined}
          data-testid="modal-backdrop"
        />
        <OuterFrame.Provider value={self}>
          <TrapLayer className={className}>{children}</TrapLayer>
        </OuterFrame.Provider>
      </div>
    </ModalPortal>
  );
}

/**
 * The trapped panel, as its own component so the trap lives *inside* the
 * portal. `ModalPortal` renders nothing until its own mount effect has a DOM
 * target, so a `useFocusTrap` called from `ModalFrame` itself would run its
 * effect one commit too early, find a null ref and never attach again.
 */
function TrapLayer({ className, children }: { className?: string; children: ReactNode }) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div ref={trapRef} className={`relative ${className ?? ''}`}>
      {children}
    </div>
  );
}

/** The "Esc closes this" hint every ModalFrame header carries. */
export function EscHint() {
  return (
    <kbd className="rounded border border-hs-border-strong px-1.5 py-0.5 font-mono text-[10px] text-hs-text-faint">
      Esc
    </kbd>
  );
}
