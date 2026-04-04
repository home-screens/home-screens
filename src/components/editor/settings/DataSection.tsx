'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { editorFetch } from '@/lib/editor-fetch';
import { validateLayoutExport } from '@/lib/layout-export';
import type { LayoutExport } from '@/types/layout-export';
import type { BackupReminderSettings } from '@/types/config';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import LayoutExportModal from '@/components/editor/LayoutExportModal';
import LayoutImportModal from '@/components/editor/LayoutImportModal';
import TemplatePicker from '@/components/editor/TemplatePicker';

interface DataSectionProps {
  onSettingsImported: () => void;
}

const INTERVAL_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

export default function DataSection({ onSettingsImported }: DataSectionProps) {
  const { importConfig, config, updateSettings, saveConfig } = useEditorStore();

  const layoutInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  // Backup reminder state
  const reminder = config?.settings?.backupReminder;
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  useEffect(() => {
    editorFetch('/api/backup/reminder')
      .then(async (res) => {
        if (res.ok) {
          const state = await res.json();
          setLastBackupDate(state.lastBackupDate);
        }
      })
      .catch(() => {});
  }, []);

  const handleReminderChange = useCallback((updates: Partial<BackupReminderSettings>) => {
    const current: BackupReminderSettings = {
      enabled: reminder?.enabled ?? false,
      intervalDays: reminder?.intervalDays ?? 7,
      ...updates,
    };
    updateSettings({ backupReminder: current });
    saveConfig();
  }, [reminder, updateSettings, saveConfig]);

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
      const res = await editorFetch('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `home-screens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackupDate(new Date().toISOString());
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
            const res = await editorFetch('/api/backup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: reader.result as string,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // Reload the config into the editor store
            const configRes = await editorFetch('/api/config');
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
        const res = await editorFetch('/api/backup', {
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

        {/* Backup Reminder */}
        <section>
          <h3 className="text-sm font-medium text-neutral-300 mb-3 uppercase tracking-wider">
            Backup Reminder
          </h3>
          <p className="text-xs text-neutral-500 mb-3">
            Get a notification in the editor when you haven&apos;t backed up for a while.
          </p>
          <div className="space-y-3">
            <Toggle
              label="Enable backup reminders"
              checked={reminder?.enabled ?? false}
              onChange={(enabled) => handleReminderChange({ enabled })}
            />
            {reminder?.enabled && (
              <label className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-400">Remind after</span>
                <select
                  value={reminder.intervalDays ?? 7}
                  onChange={(e) => handleReminderChange({ intervalDays: Number(e.target.value) })}
                  className="bg-neutral-800 border border-neutral-700 rounded-md text-xs text-neutral-200 px-2 py-1"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-neutral-600">
              {lastBackupDate
                ? `Last backup: ${new Date(lastBackupDate).toLocaleDateString()}`
                : 'No backups recorded yet'}
            </p>
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
