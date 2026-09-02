'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslate } from '@/i18n';
import ConfirmSheet from './ConfirmSheet';

export default function FormOverlay({
  title,
  backLabel,
  dirty = false,
  onBack,
  children,
  footer,
}: {
  title: string;
  backLabel?: string;
  /**
   * True once the form holds edits that have not been saved. While dirty the
   * back control reads "Cancel" and asks before throwing the edits away;
   * people tap Back reflexively, and a chore with a schedule takes a minute
   * to rebuild.
   */
  dirty?: boolean;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tCore = useTranslate('core');
  const t = useTranslate('remote');
  // Default the chevron-back label through `core.actions.back` so every
  // caller picks up the active locale without forwarding props.
  const resolvedBackLabel = backLabel ?? (dirty ? tCore('actions.cancel') : tCore('actions.back'));
  const [visible, setVisible] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => clearTimeout(exitTimer.current);
  }, []);

  const close = () => {
    setVisible(false);
    exitTimer.current = setTimeout(onBack, 250);
  };

  const handleBack = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 55,
        backgroundColor: 'var(--hs-bg-body)',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: '1px solid var(--hs-border)',
          gap: 12,
        }}
      >
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 44,
            minHeight: 44,
            color: 'var(--hs-text-muted)',
            fontSize: 14,
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            background: 'none',
          }}
        >
          <ChevronLeft size={20} />
          {resolvedBackLabel}
        </button>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--hs-text-primary)',
            flex: 1,
            textAlign: 'center',
            paddingRight: 44,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          padding: '20px 16px',
          paddingBottom: footer
            ? '20px'
            : 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </div>
      {footer && (
        <div style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', position: 'relative', zIndex: 1, borderTop: '1px solid var(--hs-border)' }}>
          {footer}
        </div>
      )}

      {confirmDiscard && (
        <ConfirmSheet
          title={t('formOverlay.discard.title')}
          description={t('formOverlay.discard.description')}
          confirmLabel={t('formOverlay.discard.confirmLabel')}
          cancelLabel={t('formOverlay.discard.keepEditing')}
          onConfirm={() => {
            setConfirmDiscard(false);
            close();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
