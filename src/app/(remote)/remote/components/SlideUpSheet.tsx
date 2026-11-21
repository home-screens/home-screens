'use client';

import type { ReactNode } from 'react';
import { useSheetDialog } from '@/hooks/useSheetDialog';

/**
 * A sheet that is always on the page and slides up when `open`: Settings and
 * Send alert, the two reached from the remote's own buttons. Staying mounted
 * is what lets it slide both ways and lets Send alert hold its green "Sent"
 * for a moment before it goes.
 *
 * Closed, it is slid off the bottom, which is still "in the page" to
 * assistive tech, so it is taken out of the tree (`inert`). `covered` does
 * the same while a full-screen page opened from it is on top.
 */
export default function SlideUpSheet({
  open,
  onClose,
  title,
  closeLabel,
  maxHeight,
  covered = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  /** How much of the screen it may take: `70dvh` for a list of rows, `85dvh` for a form. */
  maxHeight: '70dvh' | '85dvh';
  covered?: boolean;
  children: ReactNode;
}) {
  const shown = open && !covered;
  const dialog = useSheetDialog<HTMLDivElement>({ onClose, active: shown });
  return (
    <>
      <div
        className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        {...dialog}
        aria-label={title}
        className={`fixed bottom-0 left-0 right-0 z-[101] bg-hs-panel rounded-t-[20px] overflow-y-auto outline-none transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight, transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
        aria-hidden={!shown}
        inert={!shown}
      >
        <div className="flex justify-center pt-2.5">
          <div className="w-9 h-[5px] rounded-full bg-hs-border-strong" />
        </div>

        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-lg font-bold text-hs-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-hs-card flex items-center justify-center text-hs-text-muted"
            aria-label={closeLabel}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {children}
      </div>
    </>
  );
}
