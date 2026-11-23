'use client';

import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';
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
      <ModalPanel>
        <ModalHeader titleId="management-warning-title" title={t('settings.networkPage.managementWarning.heading')} onClose={onCancel} />

        <ModalBody>
          <Notice tone="warning">{warning}</Notice>

          {autoRevert && (
            <p className="mt-4 text-sm text-hs-text-muted">
              {t('settings.networkPage.managementWarning.autoRevertHint')}
            </p>
          )}
        </ModalBody>

        <ModalFooter
          onCancel={onCancel}
          cancelLabel={t('settings.networkPage.managementWarning.cancelButton')}
          primary={{ label: t('settings.networkPage.managementWarning.proceedButton'), onClick: onProceed, variant: 'danger' }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
