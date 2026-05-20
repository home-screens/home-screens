'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

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
  const t = useTranslate('editor');

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
          {t('settings.networkPage.managementWarning.heading')}
        </h2>

        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-4">
          <p className="text-sm text-hs-warning">{warning}</p>
        </div>

        <p className="text-sm text-hs-text-muted mb-5">
          {t('settings.networkPage.managementWarning.autoRevertHint')}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('settings.networkPage.managementWarning.cancelButton')}
          </Button>
          <Button variant="danger" onClick={onProceed}>
            {t('settings.networkPage.managementWarning.proceedButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
