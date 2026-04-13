'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';

/* ─── Constants ────────────────────────────── */

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;

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
      const confirmData = await confirmRes.json();

      if (confirmData.ok) {
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

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl text-center">
        {status === 'polling' && (
          <>
            {/* Spinner */}
            <div className="mx-auto mb-4 w-10 h-10 border-2 border-hs-accent border-t-transparent rounded-full animate-spin" />
            <h2 className="text-lg font-semibold text-hs-text-primary mb-2">
              Verifying connectivity...
            </h2>
            <p className="text-sm text-hs-text-muted mb-1">
              {remainingSec}s remaining before automatic rollback
            </p>
            <p className="text-xs text-hs-text-faint">
              If this page becomes unreachable, the previous settings will be restored automatically.
            </p>
          </>
        )}

        {status === 'confirmed' && (
          <>
            <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-hs-success/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-hs-success" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-hs-success mb-2">
              Connection confirmed!
            </h2>
            <p className="text-sm text-hs-text-muted mb-4">
              The network change has been verified and saved.
            </p>
            <button
              onClick={onDismiss}
              className="text-sm text-hs-accent hover:text-hs-accent-hover"
            >
              Dismiss
            </button>
          </>
        )}

        {status === 'reverted' && (
          <>
            <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-hs-warning/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-hs-warning" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-hs-warning mb-2">
              Change reverted
            </h2>
            <p className="text-sm text-hs-text-muted mb-4">
              Previous network settings have been restored.
            </p>
            <button
              onClick={onDismiss}
              className="text-sm text-hs-accent hover:text-hs-accent-hover"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
