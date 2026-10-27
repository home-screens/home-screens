'use client';

import Button from '@/components/ui/Button';
import ModalFrame from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';

/* ─── Props ────────────────────────────────── */

interface ManagementWarningModalProps {
  warning: string;
  /** Whether the 60 s rollback undoes this change; a disconnect or forget has none. */
  autoRevert: boolean;
  onProceed: () => void;
  onCancel: () => void;
}

/* ─── Component ────────────────────────────── */

/**
 * Rendered through `ModalFrame` so it lands in the same portal as the connect
 * dialog it often opens on top of. As a plain fixed div inside the page tree
 * it painted underneath that dialog, and its buttons could not be clicked.
 */
export default function ManagementWarningModal({
  warning,
  autoRevert,
  onProceed,
  onCancel,
}: ManagementWarningModalProps) {
  const t = useTranslate('editor');

  return (
    <ModalFrame labelledBy="management-warning-title" onClose={onCancel} className="w-full max-w-md">
      <div className="w-full rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 id="management-warning-title" className="text-lg font-semibold text-hs-text-primary mb-3">
          {t('settings.networkPage.managementWarning.heading')}
        </h2>

        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-4">
          <p className="text-sm text-hs-warning">{warning}</p>
        </div>

        {autoRevert && (
          <p className="text-sm text-hs-text-muted mb-5">
            {t('settings.networkPage.managementWarning.autoRevertHint')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('settings.networkPage.managementWarning.cancelButton')}
          </Button>
          <Button variant="danger" onClick={onProceed}>
            {t('settings.networkPage.managementWarning.proceedButton')}
          </Button>
        </div>
      </div>
    </ModalFrame>
  );
}
