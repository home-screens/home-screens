'use client';

import type { ReactNode } from 'react';
import SheetFrame from './SheetFrame';

/**
 * A sheet that is always on the page and slides up when `open`: Settings and
 * Send alert, the two reached from the remote's own buttons. Staying mounted
 * is what lets it slide both ways and lets Send alert hold its green "Sent"
 * for a moment before it goes.
 *
 * Closed, it is slid off the bottom, which is still "in the page" to
 * assistive tech, so it is taken out of the tree (`inert`). `covered` does
 * the same while a full-screen page opened from it is on top; that page takes
 * Back first, then Back closes this.
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
  return (
    <SheetFrame
      layer="sheet"
      label={title}
      title={title}
      closeLabel={closeLabel}
      onClose={onClose}
      open={open}
      covered={covered}
      handle
      titleRowStyle={{ padding: '6px 20px 12px', marginBottom: 0 }}
      panelStyle={{
        maxHeight,
        overflowY: 'auto',
        background: 'var(--hs-bg-panel)',
        borderRadius: '20px 20px 0 0',
        // Slid off the bottom while closed, where a shadow would still show.
        boxShadow: 'none',
      }}
    >
      {children}
    </SheetFrame>
  );
}
