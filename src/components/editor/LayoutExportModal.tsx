'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens } from '@/lib/editor-multi-display';
import ModalFrame, { ModalBody, ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';
import { CHECKBOX_CLASS, MODAL_INPUT_CLASS } from '@/components/ui/input-classes';

interface LayoutExportModalProps {
  onClose: () => void;
  /** Pre-select a single screen (e.g., from right-click "Export this screen") */
  preSelectedScreenId?: string;
}

export default function LayoutExportModal({ onClose, preSelectedScreenId }: LayoutExportModalProps) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, exportLayout } = useEditorStore();
  const screens = config ? getActiveScreens(config, selectedDisplayId) : [];

  const preSelectedScreen = preSelectedScreenId
    ? screens.find((s) => s.id === preSelectedScreenId)
    : undefined;

  const defaultName = t('layoutExportModal.defaultName');
  const [name, setName] = useState(preSelectedScreen ? preSelectedScreen.name : defaultName);
  const [description, setDescription] = useState('');
  const [selectedScreenIds, setSelectedScreenIds] = useState<Set<string>>(
    () => preSelectedScreenId
      ? new Set([preSelectedScreenId])
      : new Set(screens.map((s) => s.id)),
  );

  const toggleScreen = (id: string) => {
    setSelectedScreenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't allow deselecting all screens
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedScreenIds.size === screens.length) {
      // Select only first screen (can't have zero)
      setSelectedScreenIds(new Set([screens[0].id]));
    } else {
      setSelectedScreenIds(new Set(screens.map((s) => s.id)));
    }
  };

  const handleExport = () => {
    exportLayout({
      name: name.trim() || defaultName,
      description: description.trim() || undefined,
      screenIds: selectedScreenIds.size === screens.length
        ? undefined // all screens — no need to filter
        : Array.from(selectedScreenIds),
    });
    onClose();
  };

  return (
    <ModalFrame labelledBy="layout-export-title" onClose={onClose} className="w-full max-w-md">
      <ModalPanel>
        <ModalHeader titleId="layout-export-title" title={t('layoutExportModal.title')} onClose={onClose} />
        <ModalBody>
          {/* Name */}
          <label className="block text-sm text-hs-text-muted mb-1">{t('layoutExportModal.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mb-4 ${MODAL_INPUT_CLASS}`}
            placeholder={defaultName}
          />

          {/* Description */}
          <label className="block text-sm text-hs-text-muted mb-1">{t('layoutExportModal.descriptionLabel')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`mb-4 resize-none ${MODAL_INPUT_CLASS}`}
            placeholder={t('layoutExportModal.descriptionPlaceholder')}
          />

          {/* Screen selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-hs-text-muted">{t('layoutExportModal.screensHeading')}</span>
              {screens.length > 1 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-hs-accent hover:text-hs-accent-hover"
                >
                  {selectedScreenIds.size === screens.length
                    ? t('layoutExportModal.deselectAll')
                    : t('layoutExportModal.selectAll')}
                </button>
              )}
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {screens.map((screen) => (
                <label
                  key={screen.id}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-hs-card cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedScreenIds.has(screen.id)}
                    onChange={() => toggleScreen(screen.id)}
                    className={CHECKBOX_CLASS}
                  />
                  <span className="text-sm text-hs-text-body">{screen.name}</span>
                  <span className="text-xs text-hs-text-faint ml-auto">
                    {screen.modules.length === 1
                      ? t('layoutExportModal.moduleCountSingular', { count: screen.modules.length })
                      : t('layoutExportModal.moduleCountPlural', { count: screen.modules.length })}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </ModalBody>
        <ModalFooter
          onCancel={onClose}
          primary={{ label: t('layoutExportModal.exportButton'), onClick: handleExport, disabled: selectedScreenIds.size === 0 }}
        />
      </ModalPanel>
    </ModalFrame>
  );
}
