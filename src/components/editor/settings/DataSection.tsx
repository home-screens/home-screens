'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import { useTranslate } from '@/i18n';

interface DataSectionProps {
  onSettingsImported: () => void;
}

export default function DataSection({ onSettingsImported }: DataSectionProps) {
  const t = useTranslate('editor');
  const { importConfig, config, updateSettings, saveConfig } = useEditorStore();

  const intervalOptions = useMemo(
    () => [
      { value: 3, label: t('settings.dataPage.intervalOptions.threeDays') },
      { value: 7, label: t('settings.dataPage.intervalOptions.sevenDays') },
      { value: 14, label: t('settings.dataPage.intervalOptions.fourteenDays') },
      { value: 30, label: t('settings.dataPage.intervalOptions.thirtyDays') },
    ],
    [t],
  );

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
            t('settings.dataPage.alerts.invalidLayoutFile', {
              errors: validation.errors.join('\n'),
            }),
          );
          return;
        }
        setImportLayout(data as LayoutExport);
      } catch {
        useConfirmStore.getState().alert(t('settings.dataPage.alerts.invalidJsonFile'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [t]);

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
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.exportBackupFailed'));
    } finally {
      setBackupBusy(false);
    }
  }, [t]);

  // Shared restore path for both legacy raw-config uploads and new bundle
  // uploads. POST the body, then reload the server-authoritative config and
  // hydrate the editor store from it. Hydrating directly from the upload
  // would skip migrate-on-boot and leave the editor showing a pre-migration
  // shape until the next save.
  const postBackupAndReload = useCallback(async (rawJson: string) => {
    setBackupBusy(true);
    try {
      const res = await editorFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawJson,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const configRes = await editorFetch('/api/config');
      if (configRes.ok) {
        const config = await configRes.json();
        importConfig(JSON.stringify(config));
      }
      onSettingsImported();
    } finally {
      setBackupBusy(false);
    }
  }, [importConfig, onSettingsImported]);

  const handleBackupRestore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        // Validate JSON parses (the API enforces shape — we just need to
        // know whether to take the bundle vs legacy branch from the wrapper).
        JSON.parse(reader.result as string);
        await postBackupAndReload(reader.result as string);
      } catch {
        useConfirmStore.getState().alert(t('settings.dataPage.alerts.invalidBackupFile'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [postBackupAndReload, t]);

  const handleTemplateSelect = (layout: LayoutExport) => {
    setShowTemplatePicker(false);
    setImportLayout(layout);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Share Layout */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.shareLayout.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.shareLayout.description')}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => setShowExportModal(true)}
              data-field-id="data.shareLayoutExport"
            >
              {t('settings.dataPage.shareLayout.exportButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => layoutInputRef.current?.click()}
              data-field-id="data.shareLayoutImport"
            >
              {t('settings.dataPage.shareLayout.importButton')}
            </Button>
          </div>
        </section>

        {/* Templates */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.templates.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.templates.description')}
          </p>
          <Button
            variant="secondary"
            onClick={() => setShowTemplatePicker(true)}
            data-field-id="data.templatesBrowse"
          >
            {t('settings.dataPage.templates.browseButton')}
          </Button>
        </section>

        {/* Full Backup */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.fullBackup.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.fullBackup.description')}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBackupExport}
              disabled={backupBusy}
              data-field-id="data.fullBackupExport"
            >
              {backupBusy ? t('settings.dataPage.fullBackup.working') : t('settings.dataPage.fullBackup.backupButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => backupInputRef.current?.click()}
              disabled={backupBusy}
              data-field-id="data.fullBackupRestore"
            >
              {t('settings.dataPage.fullBackup.restoreButton')}
            </Button>
          </div>
        </section>

        {/* Backup Reminder */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.backupReminder.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.backupReminder.description')}
          </p>
          <div className="space-y-3" data-field-id="data.backupReminderEnabled">
            <Toggle
              label={t('settings.dataPage.backupReminder.enableLabel')}
              checked={reminder?.enabled ?? false}
              onChange={(enabled) => handleReminderChange({ enabled })}
            />
            {reminder?.enabled && (
              <label className="flex items-center justify-between gap-2" data-field-id="data.backupReminderInterval">
                <span className="text-xs text-hs-text-muted">{t('settings.dataPage.backupReminder.remindAfterLabel')}</span>
                <select
                  value={reminder.intervalDays ?? 7}
                  onChange={(e) => handleReminderChange({ intervalDays: Number(e.target.value) })}
                  className="bg-hs-card border border-hs-border-strong rounded-md text-xs text-hs-text-body px-2 py-1"
                >
                  {intervalOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-hs-text-faint">
              {lastBackupDate
                ? t('settings.dataPage.backupReminder.lastBackup', {
                    date: new Date(lastBackupDate).toLocaleDateString(),
                  })
                : t('settings.dataPage.backupReminder.noBackups')}
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
