'use client';

import { useState, type ReactNode } from 'react';
import { useSheetTapGuard } from '@/hooks/useSheetTapGuard';
import { useTranslate } from '@/i18n';

export default function ConfirmSheet({
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmColor,
  icon,
  onConfirm,
  onCancel,
  zIndex = 60,
  settleMs = 0,
  guardTaps = false,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /** Raise above a bottom sheet (z 101) when confirming from inside one. */
  zIndex?: number;
  /**
   * Taps in the first few milliseconds are ignored. For a sheet opened from a
   * button in the same spot with the same words, where a double tap would
   * otherwise confirm (or dismiss) it before anyone read it.
   */
  settleMs?: number;
  /** As on `BottomSheet`: over a list where a stray second tap would tick or pay for something. */
  guardTaps?: boolean;
}) {
  // Defaults route through `core.actions` so callers don't need to translate
  // them locally. Callers that want a custom label (e.g. "Delete Member",
  // "Redeem — 3 tickets") still pass `confirmLabel` explicitly.
  const tCore = useTranslate('core');
  const resolvedConfirmLabel = confirmLabel ?? tCore('actions.confirm');
  const resolvedCancelLabel = cancelLabel ?? tCore('actions.cancel');
  const [openedAt] = useState(() => Date.now());
  useSheetTapGuard(guardTaps);
  const settled = (action: () => void) => () => {
    if (Date.now() - openedAt < settleMs) return;
    action();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={settled(onCancel)}
    >
      {/* A real dialog role, so the confirm button can be addressed as "the
          button inside the sheet" rather than "the last button with this
          label". The trigger and the confirm deliberately share their
          wording, and the label-only form silently resolves to the trigger
          during the render that opens the sheet. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="confirm-sheet"
        style={{
          width: '100%',
          background: 'var(--hs-bg-panel)',
          borderRadius: '20px 20px 0 0',
          padding: '24px 16px',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          textAlign: icon ? 'center' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && (
          <div style={{ marginBottom: 12 }}>{icon}</div>
        )}
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--hs-text-primary)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--hs-text-faint)', lineHeight: 1.5, marginBottom: 24 }}>
          {description}
        </div>
        <button
          className="press-btn"
          onClick={settled(onConfirm)}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            background: confirmColor ?? 'var(--hs-danger)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          {resolvedConfirmLabel}
        </button>
        <button
          className="press-scale"
          onClick={onCancel}
          style={{
            width: '100%',
            minHeight: 48,
            padding: 14,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-body)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {resolvedCancelLabel}
        </button>
      </div>
    </div>
  );
}
