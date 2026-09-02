'use client';

import { type ReactNode } from 'react';
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
 */
export default function ModalFrame({
  label,
  labelledBy,
  onClose,
  closable = true,
  className,
  children,
}: {
  /** Fallback announcement when there is no visible heading to point at. */
  label?: string;
  /** Id of the dialog's own `<h2>`; preferred over `label`. */
  labelledBy?: string;
  onClose: () => void;
  closable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  useEscapeKey(onClose, closable);

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
          className="absolute inset-0 bg-black/60"
          onClick={closable ? onClose : undefined}
          data-testid="modal-backdrop"
        />
        <div ref={trapRef} className={`relative ${className ?? ''}`}>
          {children}
        </div>
      </div>
    </ModalPortal>
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
