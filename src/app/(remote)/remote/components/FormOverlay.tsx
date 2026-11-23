'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useTranslate } from '@/i18n';
import { useSheetDialog } from '@/hooks/useSheetDialog';
import ConfirmSheet from './ConfirmSheet';
import { useBackGesture } from '../hooks/useBackGesture';
import { REMOTE_LAYERS, type RemoteLayer } from './remote-layers';

export default function FormOverlay({
  title,
  backLabel,
  dirty = false,
  backDisabled = false,
  onBack,
  children,
  footer,
  layer = 'form',
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
  backDisabled?: boolean;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** `sheetOverSheet` for a page opened from a sheet (Your icons, from Settings). */
  layer?: RemoteLayer;
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

  // Read from the popstate listener, which is registered once.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const backDisabledRef = useRef(backDisabled);
  backDisabledRef.current = backDisabled;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  /**
   * The Back gesture and Escape are this form's Back control (see
   * `useBackGesture`). Without them, the gesture unloaded the whole remote
   * and threw away a typed draft that the Cancel button would have asked
   * about.
   */
  const closing = useRef(false);
  const releaseRef = useRef<() => void>(() => {});
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    releaseRef.current();
    setVisible(false);
    exitTimer.current = setTimeout(() => onBackRef.current(), 250);
  }, []);

  const handleBack = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }, [close]);

  const { release } = useBackGesture(() => {
    // A save in flight: the sheet's own Back control is disabled here too.
    if (backDisabledRef.current) return true;
    // Exactly the Back control: a clean form closes, a dirty one asks first
    // and stays open meanwhile. A sheet opened over the form (the discard
    // prompt among them) holds its own entry, so Back closes that first:
    // out of the discard prompt, Back means "keep editing".
    handleBack();
    return dirtyRef.current;
  });
  releaseRef.current = release;

  const dialog = useSheetDialog<HTMLDivElement>({ onClose: backDisabled ? undefined : handleBack, keepAutoFocus: true });

  return (
    // A real dialog role: the overlay's submit button and the trigger that
    // opened it share their wording ("Add person", "Add chore"), so anything
    // addressing the submit by label alone resolves to the trigger during the
    // render that opens the overlay.
    <div
      {...dialog}
      aria-label={title}
      data-testid="form-overlay"
      style={{
        outline: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: REMOTE_LAYERS[layer],
        backgroundColor: 'var(--hs-bg-body)',
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        // Same cap as the rest of the remote: a full-bleed form on a laptop
        // puts the label and its field a screen-width apart.
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          borderBottom: '1px solid var(--hs-border)',
          gap: 12,
        }}
      >
        <button
          className="press-btn"
          onClick={handleBack}
          disabled={backDisabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 48,
            minHeight: 48,
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
          width: '100%',
          maxWidth: 640,
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
      {/* The footer slot owns its padding, so no form's buttons can run into
          the screen edges, and the body above owns the one inset: callers
          add neither. */}
      {footer && (
        <div style={{ width: '100%', maxWidth: 640, flexShrink: 0, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', position: 'relative', zIndex: 1, borderTop: '1px solid var(--hs-border)' }}>
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
