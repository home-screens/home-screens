'use client';

import { useState } from 'react';
import { useEditorStore, getActiveDimensions } from '@/stores/editor-store';
import type { LayoutExport } from '@/types/layout-export';
import Button from '@/components/ui/Button';
import ModalPortal from '@/components/ui/ModalPortal';
import { useTranslate, useFormattingLocale } from '@/i18n';

interface LayoutImportModalProps {
  layout: LayoutExport;
  onClose: () => void;
  /** Empty screen this import replaces (the "start from a template" flow). */
  replaceEmptyScreenId?: string;
}

export default function LayoutImportModal({
  layout,
  onClose,
  replaceEmptyScreenId,
}: LayoutImportModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const formattingLocale = useFormattingLocale();
  const { config, selectedDisplayId, importLayoutAction, saveConfig } = useEditorStore();
  const [applyVisual, setApplyVisual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { metadata, screens, visual } = layout;

  // Dimension mismatch check — compare against the currently-selected
  // display's dimensions so a landscape layout imported into a portrait
  // display correctly warns about the aspect ratio mismatch.
  const activeDims = config
    ? getActiveDimensions(config, selectedDisplayId)
    : { width: 1080, height: 1920 };
  const currentWidth = activeDims.width;
  const currentHeight = activeDims.height;
  const dimensionMismatch =
    metadata.sourceDisplay.width !== currentWidth ||
    metadata.sourceDisplay.height !== currentHeight;

  const handleImport = async () => {
    setError(null);
    try {
      importLayoutAction(layout, { mode: 'add', applyVisual, replaceEmptyScreenId });
      await saveConfig();
      onClose();
    } catch {
      setError(t('layoutImportModal.saveError'));
    }
  };

  const exportedAtLabel = new Date(metadata.exportedAt).toLocaleDateString(formattingLocale);

  const screenCountLabel =
    metadata.screenCount === 1
      ? t('layoutImportModal.screenCountSingular', { count: metadata.screenCount })
      : t('layoutImportModal.screenCountPlural', { count: metadata.screenCount });
  const moduleCountLabel =
    metadata.moduleCount === 1
      ? t('layoutImportModal.moduleCountSingular', { count: metadata.moduleCount })
      : t('layoutImportModal.moduleCountPlural', { count: metadata.moduleCount });

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={t('layoutImportModal.title')}>
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-1">{t('layoutImportModal.title')}</h2>
        {metadata.description && (
          <p className="text-xs text-hs-text-faint mb-3">{metadata.description}</p>
        )}

        {/* Preview */}
        <div className="rounded-lg bg-hs-card/60 border border-hs-border-strong p-3 mb-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-hs-text-body">{metadata.name}</span>
            <span className="text-xs text-hs-text-faint">
              {exportedAtLabel}
            </span>
          </div>
          <div className="text-xs text-hs-text-muted space-y-0.5">
            <p>
              {t('layoutImportModal.countsLine', {
                screens: screenCountLabel,
                modules: moduleCountLabel,
              })}
            </p>
            <p>
              {t('layoutImportModal.sourceLine', {
                width: metadata.sourceDisplay.width,
                height: metadata.sourceDisplay.height,
              })}
            </p>
          </div>
          {/* Screen list */}
          <div className="flex flex-wrap gap-1 mt-1">
            {screens.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-hs-card/60 px-2 py-0.5 text-xs text-hs-text-secondary"
              >
                {s.name}
                <span className="text-hs-text-faint">{s.modules.length}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Dimension warning */}
        {dimensionMismatch && (
          <div className="rounded-md bg-hs-warning/20 border border-hs-warning/30 px-3 py-2 mb-4">
            <p className="text-xs text-hs-warning">
              {t('layoutImportModal.dimensionWarning', {
                sourceWidth: metadata.sourceDisplay.width,
                sourceHeight: metadata.sourceDisplay.height,
                currentWidth,
                currentHeight,
              })}
            </p>
          </div>
        )}

        {/* Visual settings */}
        <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={applyVisual}
            onChange={(e) => setApplyVisual(e.target.checked)}
            className="accent-hs-accent"
          />
          <div>
            <span className="text-sm text-hs-text-body">{t('layoutImportModal.applyVisualLabel')}</span>
            <p className="text-xs text-hs-text-faint">
              {visual.transitionEffect
                ? t('layoutImportModal.visualSummaryWithTransition', {
                    seconds: visual.rotationIntervalMs / 1000,
                    transition: visual.transitionEffect,
                  })
                : t('layoutImportModal.visualSummary', {
                    seconds: visual.rotationIntervalMs / 1000,
                  })}
            </p>
          </div>
        </label>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-hs-danger/10 border border-hs-danger/30 px-3 py-2 mb-4">
            <p className="text-xs text-hs-danger">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{tCore('actions.cancel')}</Button>
          <Button variant="primary" onClick={handleImport}>
            {t('layoutImportModal.importButton')}
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
