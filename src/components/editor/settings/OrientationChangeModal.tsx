'use client';

import Button from '@/components/ui/Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
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
  const tCore = useTranslate('core');
  useEscapeKey(onCancel);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-3">
          {t('modals.orientation.title')}
        </h2>

        <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-4">
          <p className="text-xs text-hs-warning">
            {t('modals.orientation.warning', { offCanvasCount, totalModuleCount, newWidth, newHeight })}
          </p>
        </div>

        <p className="text-sm text-hs-text-muted mb-5">
          <strong className="text-hs-text-secondary">{t('modals.orientation.scaleToFit')}</strong>{' '}
          {t('modals.orientation.scaleToFitDescription')}{' '}
          <strong className="text-hs-text-secondary">{t('modals.orientation.switchAnyway')}</strong>{' '}
          {t('modals.orientation.switchAnywayDescription')}
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{tCore('actions.cancel')}</Button>
          <Button variant="secondary" onClick={onSwitchAnyway}>{t('modals.orientation.switchAnyway')}</Button>
          <Button variant="primary" onClick={onScaleToFit}>{t('modals.orientation.scaleToFit')}</Button>
        </div>
      </div>
    </div>
  );
}
