'use client';

import { useState } from 'react';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface LayoutExportModalProps {
  onClose: () => void;
  /** Pre-select a single screen (e.g., from right-click "Export This Screen") */
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-hs-border-strong bg-hs-panel p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-hs-text-primary mb-4">{t('layoutExportModal.title')}</h2>

        {/* Name */}
        <label className="block text-sm text-hs-text-muted mb-1">{t('layoutExportModal.nameLabel')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md bg-hs-card border border-hs-border-strong px-3 py-2 text-sm text-hs-text-body focus:outline-none focus:border-hs-accent mb-4"
          placeholder={defaultName}
        />

        {/* Description */}
        <label className="block text-sm text-hs-text-muted mb-1">{t('layoutExportModal.descriptionLabel')}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md bg-hs-card border border-hs-border-strong px-3 py-2 text-sm text-hs-text-body focus:outline-none focus:border-hs-accent mb-4 resize-none"
          placeholder={t('layoutExportModal.descriptionPlaceholder')}
        />

        {/* Screen selection */}
        <div className="mb-5">
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
                  className="accent-hs-accent"
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

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleExport} disabled={selectedScreenIds.size === 0}>
            {t('layoutExportModal.exportButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}
