'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetTapGuard } from '@/hooks/useSheetTapGuard';

/**
 * A short sheet that slides up from the bottom of the phone: the item and
 * list sheets on the Lists tab. Tapping the dimmed area closes it. Sits
 * above the tab bar and the add bar; pass a higher `zIndex` to stack a
 * confirm sheet on top.
 */
export default function BottomSheet({
  title,
  titleAside,
  onClose,
  children,
  zIndex = 200,
  testId,
  guardTaps = false,
  initialFocus = 'container',
}: {
  title: string;
  /** Small text on the right of the title row: a character count, a time left. */
  titleAside?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  testId?: string;
  /**
   * When it closes from a tap, a second tap near there is ignored for a
   * moment: for a sheet over a list where that tap would tick or pay for
   * something (the chore menu).
   */
  guardTaps?: boolean;
  /**
   * Where focus lands as it opens. `container` (the default) keeps a phone's
   * keyboard down over a sheet nobody has read yet; `field` focuses the first
   * text box, for a sheet opened by a tap that already meant "write".
   */
  initialFocus?: 'container' | 'field';
}) {
  const tCore = useTranslate('core');
  useSheetTapGuard(guardTaps);
  // A sheet says it is a modal dialog, so the keyboard has to treat it as
  // one: focus moves into it, Tab stays inside it, Escape closes it.
  const dialogRef = useFocusTrap<HTMLDivElement>({ focus: initialFocus });
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // One Escape closes one sheet: the one on top, where focus is.
          e.stopPropagation();
          onClose();
        }}
        data-testid={testId}
        style={{
          outline: 'none',
          width: '100%',
          maxWidth: 640,
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: 'var(--hs-bg-panel)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 16px',
          paddingBottom: 'max(36px, env(safe-area-inset-bottom))',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--hs-text-primary)',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
          {titleAside !== undefined && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--hs-text-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {titleAside}
            </span>
          )}
          {/* Tapping the dimmed area closes too, but kids and grandparents look for a way out. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={tCore('actions.close')}
            data-testid="sheet-close"
            style={{
              flex: 'none', width: 40, height: 40, margin: '-8px -8px -8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--hs-text-faint)', cursor: 'pointer',
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
