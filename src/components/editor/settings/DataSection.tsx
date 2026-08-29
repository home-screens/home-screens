'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { editorFetch } from '@/lib/editor-fetch';
import { downloadBlob } from '@/lib/download';
import type { LayoutExport } from '@/types/layout-export';
import type { BackupReminderSettings } from '@/types/config';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import LayoutExportModal from '@/components/editor/LayoutExportModal';
import { useLayoutFileImport } from '@/hooks/useLayoutFileImport';
import LayoutImportModal from '@/components/editor/LayoutImportModal';
import TemplatePicker from '@/components/editor/TemplatePicker';
import { useTranslate } from '@/i18n';

interface DataSectionProps {
  onSettingsImported: () => void;
}

interface ConfigBackupFile {
  name: string;
  size: number;
  modified: string;
}

// kind drives styling/role explicitly — don't sniff English prefixes from message.
type RestoreStatusKind = 'progress' | 'success' | 'error';
interface RestoreStatus {
  message: string;
  kind: RestoreStatusKind;
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

  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importLayout, setImportLayout] = useState<LayoutExport | null>(null);
  const { inputRef: layoutInputRef, openFilePicker, handleFileChange } =
    useLayoutFileImport(setImportLayout);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  // Backup reminder state
  const reminder = config?.settings?.backupReminder;
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  // Automatic config snapshots (taken by the upgrade pipeline before each
  // update). Moved here from the System page so every backup surface lives
  // on one page — System keeps version rollback, which changes the app
  // version rather than the settings.
  const [configBackups, setConfigBackups] = useState<ConfigBackupFile[]>([]);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus | null>(null);

  useEffect(() => {
    editorFetch('/api/backup/reminder')
      .then(async (res) => {
        if (res.ok) {
          const state = await res.json();
          setLastBackupDate(state.lastBackupDate);
        }
      })
      .catch(() => {});
    editorFetch('/api/system/backups')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setConfigBackups(data.backups ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const handleRestoreConfigBackup = useCallback(async (name: string) => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('settings.dataPage.configBackups.restoreDialog.title'),
      message: t('settings.dataPage.configBackups.restoreDialog.message', { name }),
      confirmLabel: t('settings.dataPage.configBackups.restoreDialog.confirm'),
    });
    if (!ok) return;
    setRestoreStatus({
      message: t('settings.dataPage.configBackups.restoreStatus.restoring'),
      kind: 'progress',
    });
    try {
      const res = await editorFetch('/api/system/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setRestoreStatus({
          message: t('settings.dataPage.configBackups.restoreStatus.restored'),
          kind: 'success',
        });
      } else {
        const data = await res.json();
        setRestoreStatus({
          message: t('settings.dataPage.configBackups.restoreStatus.error', { error: data.error }),
          kind: 'error',
        });
      }
    } catch {
      setRestoreStatus({
        message: t('settings.dataPage.configBackups.restoreStatus.failed'),
        kind: 'error',
      });
    }
  }, [t]);

  const handleReminderChange = useCallback((updates: Partial<BackupReminderSettings>) => {
    const current: BackupReminderSettings = {
      enabled: reminder?.enabled ?? false,
      intervalDays: reminder?.intervalDays ?? 7,
      ...updates,
    };
    updateSettings({ backupReminder: current });
    saveConfig();
  }, [reminder, updateSettings, saveConfig]);

  const handleBackupExport = useCallback(async () => {
    setBackupBusy(true);
    try {
      const res = await editorFetch('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `home-screens-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
              onClick={openFilePicker}
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

        {/* Config Backups — automatic snapshots from the upgrade pipeline */}
        <section data-field-id="data.configBackups">
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.configBackups.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.configBackups.description')}
          </p>
          {configBackups.length === 0 ? (
            <p className="text-xs text-hs-text-faint">
              {t('settings.dataPage.configBackups.empty')}
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {configBackups.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-hs-input border border-hs-border"
                >
                  <div>
                    <span className="text-xs text-hs-text-body font-mono">{b.name}</span>
                    <span className="text-xs text-hs-text-faint ml-2">
                      {t('settings.dataPage.configBackups.sizeKb', { size: (b.size / 1024).toFixed(1) })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/system/backups?download=${encodeURIComponent(b.name)}`}
                      download={b.name}
                      className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                    >
                      {t('settings.dataPage.configBackups.download')}
                    </a>
                    <button
                      onClick={() => handleRestoreConfigBackup(b.name)}
                      className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                    >
                      {t('settings.dataPage.configBackups.restore')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {restoreStatus && (
            <p
              className={`text-xs mt-2 ${
                restoreStatus.kind === 'error'
                  ? 'text-hs-danger'
                  : restoreStatus.kind === 'progress'
                    ? 'text-hs-text-faint'
                    : 'text-hs-success'
              }`}
              aria-live="polite"
              role={restoreStatus.kind === 'error' ? 'alert' : undefined}
            >
              {restoreStatus.message}
            </p>
          )}
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
        onChange={handleFileChange}
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
