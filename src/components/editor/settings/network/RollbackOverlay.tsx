'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { useTranslate } from '@/i18n';
import ModalFrame, { ModalBody, ModalPanel } from '@/components/ui/ModalFrame';
import Spinner from '@/components/ui/Spinner';

/* ─── Constants ────────────────────────────── */

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;
const TITLE_ID = 'network-rollback-title';

/* ─── Props ────────────────────────────────── */

interface RollbackOverlayProps {
  rollbackId: string;
  onConfirmed: () => void;
  onReverted: () => void;
  onDismiss: () => void;
}

/* ─── Component ────────────────────────────── */

export default function RollbackOverlay({
  rollbackId,
  onConfirmed,
  onReverted,
  onDismiss,
}: RollbackOverlayProps) {
  const t = useTranslate('editor');
  const [remainingMs, setRemainingMs] = useState(DEFAULT_TIMEOUT_MS);
  const [status, setStatus] = useState<'polling' | 'confirmed' | 'reverted'>('polling');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confirmedRef = useRef(false);

  /* ── Poll for rollback status and auto-confirm ── */

  const pollAndConfirm = useCallback(async () => {
    if (confirmedRef.current) return;

    try {
      // Step 1: Check if there's still a pending rollback
      const statusRes = await editorFetch('/api/system/network/confirm');
      const statusData = await statusRes.json();

      if (!statusData.pending) {
        // Rollback already fired (we lost connectivity and it was reverted)
        confirmedRef.current = true;
        setStatus('reverted');
        onReverted();
        return;
      }

      // Update remaining time from server
      if (statusData.remainingMs !== undefined) {
        setRemainingMs(statusData.remainingMs);
      }

      // Step 2: We can reach the server, so confirm the change
      const confirmRes = await editorFetch('/api/system/network/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollbackId }),
      });
      if (confirmRes.ok) {
        confirmedRef.current = true;
        setStatus('confirmed');
        onConfirmed();
      }
    } catch {
      // Can't reach the server — connectivity may be broken.
      // Keep polling — either we'll reconnect or rollback will fire.
    }
  }, [rollbackId, onConfirmed, onReverted]);

  /* ── Start polling on mount ────────────────── */

  useEffect(() => {
    // Initial poll immediately
    pollAndConfirm();

    pollRef.current = setInterval(pollAndConfirm, POLL_INTERVAL_MS);

    // Countdown timer for display
    countdownRef.current = setInterval(() => {
      setRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [pollAndConfirm]);

  const remainingSec = Math.ceil(remainingMs / 1000);

  const done = status !== 'polling';
  const dismissButton = (
    <button
      onClick={onDismiss}
      className="text-sm text-hs-accent hover:text-hs-accent-hover"
    >
      {t('settings.networkPage.rollback.dismissButton')}
    </button>
  );

  return (
    // Nothing closes it while the hub decides whether the change stays: the
    // page behind may be on its way out with the old connection.
    <ModalFrame labelledBy={TITLE_ID} onClose={onDismiss} closable={done} className="w-full max-w-sm">
      <ModalPanel>
        <ModalBody className="py-6 text-center">
          {status === 'polling' && (
            <>
              <Spinner size="lg" className="mx-auto mb-4 text-hs-accent" />
              <h2 id={TITLE_ID} className="text-lg font-semibold text-hs-text-primary mb-2">
                {t('settings.networkPage.rollback.polling.heading')}
              </h2>
              <p className="text-sm text-hs-text-muted mb-1" role="status">
                {t('settings.networkPage.rollback.polling.remaining', { seconds: remainingSec })}
              </p>
              <p className="text-xs text-hs-text-faint">
                {t('settings.networkPage.rollback.polling.warning')}
              </p>
            </>
          )}

          {status === 'confirmed' && (
            <>
              <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-hs-success/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-hs-success" aria-hidden />
              </div>
              <h2 id={TITLE_ID} className="text-lg font-semibold text-hs-success mb-2">
                {t('settings.networkPage.rollback.confirmed.heading')}
              </h2>
              <p className="text-sm text-hs-text-muted mb-4">
                {t('settings.networkPage.rollback.confirmed.message')}
              </p>
              {dismissButton}
            </>
          )}

          {status === 'reverted' && (
            <>
              <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-hs-warning/20 flex items-center justify-center">
                <Undo2 className="w-6 h-6 text-hs-warning-ink" aria-hidden />
              </div>
              <h2 id={TITLE_ID} className="text-lg font-semibold text-hs-warning-ink mb-2">
                {t('settings.networkPage.rollback.reverted.heading')}
              </h2>
              <p className="text-sm text-hs-text-muted mb-4">
                {t('settings.networkPage.rollback.reverted.message')}
              </p>
              {dismissButton}
            </>
          )}
        </ModalBody>
      </ModalPanel>
    </ModalFrame>
  );
}
