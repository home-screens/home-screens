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
  const { importConfig } = useEditorStore();

  const layoutInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

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

  const handleBackupExport = useCallback(async () => {
    setBackupBusy(true);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `home-screens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      useConfirmStore.getState().alert('Failed to export backup.');
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const handleBackupRestore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);

        // New bundle format — restore via API
        if (data._type === 'home-screens-backup') {
          setBackupBusy(true);
          try {
            const res = await fetch('/api/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: reader.result as string,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Reload the config into the editor store
            const configRes = await fetch('/api/config');
            if (configRes.ok) {
              const config = await configRes.json();
              importConfig(JSON.stringify(config));
            }
            onSettingsImported();
          } finally {
            setBackupBusy(false);
          }
          return;
        }

        // Legacy format: raw config object
        const res = await fetch('/api/backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: reader.result as string,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        importConfig(reader.result as string);
        onSettingsImported();
      } catch {
        useConfirmStore.getState().alert('Invalid backup file.');
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
            Export or restore the entire configuration including all settings, chore data, and completion history. For backup and device migration. Does not include API keys.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleBackupExport} disabled={backupBusy}>
              {backupBusy ? 'Working\u2026' : 'Backup All Data'}
            </Button>
            <Button variant="secondary" onClick={() => backupInputRef.current?.click()} disabled={backupBusy}>
              Restore Backup
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
