'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions } from '@/lib/editor-multi-display';
import type { LayoutExport } from '@/types/layout-export';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import Notice from '@/components/ui/Notice';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatDateInTZ } from '@/lib/timezone';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { CHECKBOX_CLASS } from '@/components/ui/input-classes';

interface LayoutImportModalProps {
  layout: LayoutExport;
  onClose: () => void;
  /** Empty screen this import replaces (the "start from a template" flow). */
  replaceEmptyScreenId?: string;
  /**
   * Where the layout came from. A built-in template's `exportedAt` is a build
   * artefact, so it is not shown; a file someone exported carries a date that
   * means something to them.
   */
  source?: 'template' | 'file';
}

export default function LayoutImportModal({
  layout,
  onClose,
  replaceEmptyScreenId,
  source = 'file',
}: LayoutImportModalProps) {
  const t = useTranslate('editor');
  const formattingLocale = useFormattingLocale();
  const timezone = useEditorHouseholdTimezone();
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
      importLayoutAction(layout, {
        mode: 'add',
        applyVisual,
        replaceEmptyScreenId,
        importedName: (name, number) => (number
          ? t('layoutImportModal.importedNameNumbered', { name, number })
          : t('layoutImportModal.importedName', { name })),
      });
      await saveConfig();
      onClose();
    } catch {
      setError(t('layoutImportModal.saveError'));
    }
  };

  const exportedAtLabel =
    source === 'template'
      ? null
      : t('layoutImportModal.savedAt', {
          // The household's day, not the laptop's.
          date: formatDateInTZ(new Date(metadata.exportedAt), timezone, { dateStyle: 'medium' }, formattingLocale),
        });

  const screenCountLabel =
    metadata.screenCount === 1
      ? t('layoutImportModal.screenCountSingular', { count: metadata.screenCount })
      : t('layoutImportModal.screenCountPlural', { count: metadata.screenCount });
  const moduleCountLabel =
    metadata.moduleCount === 1
      ? t('layoutImportModal.moduleCountSingular', { count: metadata.moduleCount })
      : t('layoutImportModal.moduleCountPlural', { count: metadata.moduleCount });

  return (
    <ModalFrame labelledBy="layout-import-title" onClose={onClose} className="w-full max-w-md">
      <ModalPanel>
        <ModalHeader titleId="layout-import-title" title={t('layoutImportModal.title')} onClose={onClose} />
        <ModalBody>
          {metadata.description && (
            <p className="text-xs text-hs-text-faint mb-3">{metadata.description}</p>
          )}

          {/* Preview */}
          <div className="rounded-lg bg-hs-card/60 border border-hs-border-strong p-3 mb-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-hs-text-body">{metadata.name}</span>
              {exportedAtLabel && (
                <span className="text-xs text-hs-text-faint">{exportedAtLabel}</span>
              )}
            </div>
            <div className="text-xs text-hs-text-muted space-y-0.5">
              <p>
                {t('layoutImportModal.countsLine', {
                  screens: screenCountLabel,
                  modules: moduleCountLabel,
                })}
              </p>
              {/* The resolution only matters when it isn't yours; the warning
                  below says what will happen to the modules. */}
              {dimensionMismatch && (
                <p>
                  {t('layoutImportModal.sourceLine', {
                    width: metadata.sourceDisplay.width,
                    height: metadata.sourceDisplay.height,
                  })}
                </p>
              )}
            </div>
            {/* Screen list */}
            <div className="flex flex-wrap gap-1 mt-1">
              {screens.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full bg-hs-card/60 px-2 py-0.5 text-xs text-hs-text-secondary"
                >
                  {s.modules.length === 1
                    ? t('layoutImportModal.screenPillSingular', { name: s.name, count: s.modules.length })
                    : t('layoutImportModal.screenPillPlural', { name: s.name, count: s.modules.length })}
                </span>
              ))}
            </div>
          </div>

          {/* Dimension warning */}
          {dimensionMismatch && (
            <Notice tone="warning" className="mb-4">
              {t('layoutImportModal.dimensionWarning', {
                sourceWidth: metadata.sourceDisplay.width,
                sourceHeight: metadata.sourceDisplay.height,
                currentWidth,
                currentHeight,
              })}
            </Notice>
          )}

          {/* Visual settings */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={applyVisual}
              onChange={(e) => setApplyVisual(e.target.checked)}
              className={CHECKBOX_CLASS}
            />
            <div>
              <span className="text-sm text-hs-text-body">{t('layoutImportModal.applyVisualLabel')}</span>
              <p className="text-xs text-hs-text-faint">
                {visual.transitionEffect
                  ? t('layoutImportModal.visualSummaryWithTransition', {
                      seconds: visual.rotationIntervalMs / 1000,
                      transition: t(`settings.defaultDisplayPage.transitionOptions.${visual.transitionEffect}`),
                    })
                  : t('layoutImportModal.visualSummary', {
                      seconds: visual.rotationIntervalMs / 1000,
                    })}
              </p>
            </div>
          </label>

          {/* Error */}
          {error && <Notice tone="danger" role="alert" className="mt-4">{error}</Notice>}
        </ModalBody>
        <ModalFooter onCancel={onClose} primary={{ label: t('layoutImportModal.importButton'), onClick: handleImport }} />
      </ModalPanel>
    </ModalFrame>
  );
}
