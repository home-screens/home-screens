'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

/* ─── Props ────────────────────────────────── */

interface ManagementWarningModalProps {
  warning: string;
  onProceed: () => void;
  onCancel: () => void;
}

/* ─── Component ────────────────────────────── */

export default function ManagementWarningModal({
  warning,
  onProceed,
  onCancel,
}: ManagementWarningModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-3">
          Management Interface Warning
        </h2>

        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-4">
          <p className="text-sm text-hs-warning">{warning}</p>
        </div>

        <p className="text-sm text-hs-text-muted mb-5">
          If this change breaks connectivity, it will be automatically reverted
          after 30 seconds.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onProceed}>
            I understand, proceed
          </Button>
        </div>
      </div>
    </div>
  );
}
