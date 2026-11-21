'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useSheetDialog } from '@/hooks/useSheetDialog';
import { useSheetTapGuard } from '@/hooks/useSheetTapGuard';

/**
 * A tall sheet that slides over most of the phone: the meal sheet, the
 * recipe picker, Meals settings. A grab handle, then whatever the caller
 * draws: a header row that stays put, a body that scrolls
 * (`flex: 1, minHeight: 0, overflowY: 'auto'`), a button pinned underneath.
 * Tapping the dimmed area closes it.
 *
 * `BottomSheet` is the short one, with its own title row and close button.
 */
export default function TallSheet({
  label,
  onClose,
  children,
  zIndex = 100,
  testId,
  size = { maxHeight: '85vh' },
  guardTaps = false,
}: {
  /** What a screen reader calls the sheet. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  testId?: string;
  /** A fixed `height` for a sheet whose list fills in as it loads, so it does not jump; else a `maxHeight`. */
  size?: Pick<CSSProperties, 'height' | 'maxHeight'>;
  /** As on `BottomSheet`: a second tap of a double tap never reaches what the sheet covered. */
  guardTaps?: boolean;
}) {
  useSheetTapGuard(guardTaps);
  const dialog = useSheetDialog<HTMLDivElement>({ onClose });
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div
        {...dialog}
        aria-label={label}
        data-testid={testId}
        style={{
          outline: 'none',
          position: 'relative',
          // Same cap as the rest of the remote, so on a tablet the sheet
          // sits over the column it belongs to.
          width: '100%',
          maxWidth: 640,
          background: 'var(--hs-bg-body)',
          borderRadius: '16px 16px 0 0',
          ...size,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', flex: 'none' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--hs-text-faint)' }} />
        </div>
        {children}
      </div>
    </div>
  );
}
