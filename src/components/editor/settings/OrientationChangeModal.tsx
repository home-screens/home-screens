'use client';

import { useId } from 'react';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';
import { useTranslate } from '@/i18n';

interface OrientationChangeModalProps {
  offCanvasCount: number;
  totalModuleCount: number;
  newWidth: number;
  newHeight: number;
  onScaleToFit: () => void;
  onSwitchAnyway: () => void;
  onCancel: () => void;
}

export default function OrientationChangeModal({
  offCanvasCount,
  totalModuleCount,
  newWidth,
  newHeight,
  onScaleToFit,
  onSwitchAnyway,
  onCancel,
}: OrientationChangeModalProps) {
  const t = useTranslate('editor');
  const titleId = useId();

  return (
    <ModalFrame
      labelledBy={titleId}
      onClose={onCancel}
      className="w-full max-w-md"
    >
      <ModalPanel>
        <ModalHeader titleId={titleId} title={t('modals.orientation.title')} onClose={onCancel} />

        <ModalBody>
          <Notice tone="warning" className="mb-4">
            {t('modals.orientation.warning', { offCanvasCount, totalModuleCount, newWidth, newHeight })}
          </Notice>

          <p className="text-sm text-hs-text-muted">
            <strong className="text-hs-text-secondary">{t('modals.orientation.scaleToFit')}</strong>{' '}
            {t('modals.orientation.scaleToFitDescription')}{' '}
            <strong className="text-hs-text-secondary">{t('modals.orientation.switchAnyway')}</strong>{' '}
            {t('modals.orientation.switchAnywayDescription')}
          </p>
        </ModalBody>

        <ModalFooter
          onCancel={onCancel}
          alternate={{ label: t('modals.orientation.switchAnyway'), onClick: onSwitchAnyway }}
          primary={{ label: t('modals.orientation.scaleToFit'), onClick: onScaleToFit }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
