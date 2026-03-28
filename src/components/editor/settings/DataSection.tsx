'use client';

import { useState, useRef, useCallback } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { validateLayoutExport } from '@/lib/layout-export';
import type { LayoutExport } from '@/types/layout-export';
import Button from '@/components/ui/Button';
import LayoutExportModal from '@/components/editor/LayoutExportModal';
import LayoutImportModal from '@/components/editor/LayoutImportModal';
import TemplatePicker from '@/components/editor/TemplatePicker';

interface DataSectionProps {
  onSettingsImported: () => void;
}

export default function DataSection({ onSettingsImported }: DataSectionProps) {
  const { exportConfig, importConfig } = useEditorStore();

  const layoutInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const handleLayoutImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        const validation = validateLayoutExport(data);
        if (!validation.valid) {
          useConfirmStore.getState().alert(
            `Invalid layout file:\n${validation.errors.join('\n')}`,
          );
          return;
        }
        setImportLayout(data as LayoutExport);
      } catch {
        useConfirmStore.getState().alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleBackupRestore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        JSON.parse(reader.result as string);
        importConfig(reader.result as string);
        onSettingsImported();
      } catch {
        useConfirmStore.getState().alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [importConfig, onSettingsImported]);

  const handleTemplateSelect = (layout: LayoutExport) => {
    setShowTemplatePicker(false);
    setImportLayout(layout);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Share Layout */}
        <section>
          <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
            Share Layout
          </h3>
          <p className="text-xs text-neutral-500 mb-3">
            Export your screen layout (screens, modules, visual settings) without personal data like location, calendar IDs, or device settings. Safe to share with others.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => setShowExportModal(true)}>
              Export Layout
            </Button>
            <Button variant="secondary" onClick={() => layoutInputRef.current?.click()}>
              Import Layout
            </Button>
          </div>
        </section>

        {/* Templates */}
        <section>
          <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
            Templates
          </h3>
          <p className="text-xs text-neutral-500 mb-3">
            Start from a pre-built template. Your existing settings (location, calendars, etc.) are preserved.
          </p>
          <Button variant="secondary" onClick={() => setShowTemplatePicker(true)}>
            Browse Templates
          </Button>
        </section>

        {/* Full Backup */}
        <section>
          <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
            Full Backup
          </h3>
          <p className="text-xs text-neutral-500 mb-3">
            Export or restore the entire configuration including all settings, location, calendars, and device preferences. For backup and device migration.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={exportConfig}>
              Backup Config
            </Button>
            <Button variant="secondary" onClick={() => backupInputRef.current?.click()}>
              Restore Config
            </Button>
          </div>
        </section>
      </div>

      {/* Hidden file inputs — separate for layout import and full restore */}
      <input
        ref={layoutInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleLayoutImport}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleBackupRestore}
      />

      {/* Modals */}
      {showExportModal && (
        <LayoutExportModal onClose={() => setShowExportModal(false)} />
      )}
      {importLayout && (
        <LayoutImportModal
          layout={importLayout}
          onClose={() => setImportLayout(null)}
        />
      )}
      {showTemplatePicker && (
        <TemplatePicker
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplatePicker(false)}
        />
      )}
    </>
  );
}
