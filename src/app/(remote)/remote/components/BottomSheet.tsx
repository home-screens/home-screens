'use client';

import type { ReactNode } from 'react';

/**
 * A short sheet that slides up from the bottom of the phone: the item and
 * list sheets on the Lists tab. Tapping the dimmed area closes it. Sits
 * above the tab bar and the add bar; pass a higher `zIndex` to stack a
 * confirm sheet on top.
 */
export default function BottomSheet({
  title,
  onClose,
  children,
  zIndex = 200,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  zIndex?: number;
  testId?: string;
}) {
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        style={{
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
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text-primary)', marginBottom: 14 }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}
