'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { useConfirmStore } from '@/stores/confirm-store';
import { CONFIG_REVISION_HEADER } from '@/lib/config-revision';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { downloadBlob } from '@/lib/download';
import type { LayoutExport } from '@/types/layout-export';
import type { BackupReminderSettings } from '@/types/config';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import LayoutExportModal from '@/components/editor/LayoutExportModal';
import { useLayoutFileImport } from '@/hooks/useLayoutFileImport';
import LayoutImportModal from '@/components/editor/LayoutImportModal';
import TemplateFlow from '@/components/editor/TemplateFlow';
import BackupPasswordModal from '@/components/editor/settings/BackupPasswordModal';
import { useTranslate } from '@/i18n';
import { isEncryptedEnvelope } from '@/lib/backup-credentials-types';
import type { CredentialApplyResult } from '@/lib/backup-credentials-types';

interface DataSectionProps {
  onSettingsImported: () => void;
}

interface ConfigBackupFile {
  name: string;
  size: number;
  modified: string;
}

/** Recoverable credential errors from POST /api/backup — machine codes the
 *  server returns so the client can drive the unlock modal in any language. */
const CREDENTIAL_ERROR_CODES = ['passphrase_required', 'bad_passphrase', 'invalid_credentials'] as const;
type CredentialErrorCode = (typeof CREDENTIAL_ERROR_CODES)[number];

function isCredentialErrorCode(value: unknown): value is CredentialErrorCode {
  return typeof value === 'string' && (CREDENTIAL_ERROR_CODES as readonly string[]).includes(value);
}

interface RestoreResponse {
  restored?: Record<string, boolean>;
  credentials?: CredentialApplyResult;
}

// kind drives styling/role explicitly — don't sniff English prefixes from message.
type RestoreStatusKind = 'progress' | 'success' | 'error';
interface RestoreStatus {
  message: string;
  kind: RestoreStatusKind;
}

export default function DataSection({ onSettingsImported }: DataSectionProps) {
  const t = useTranslate('editor');
  const { importConfig, config, updateSettings, saveConfig, selectedScreenId } = useEditorStore();

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
  /** Filename of the backup that just downloaded, for the confirmation line. */
  const [backupSaved, setBackupSaved] = useState<string | null>(null);

  // Credential opt-in. Deliberately NOT persisted to config: it resets on
  // every mount, so an accidental tick never becomes the standing default for
  // future exports.
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [protectCredentials, setProtectCredentials] = useState(false);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);

  // Restore-side password prompt for an encrypted bundle. `pendingRestore`
  // holds the parsed bundle between the file read and a successful unlock.
  const [pendingRestore, setPendingRestore] = useState<Record<string, unknown> | null>(null);
  const [restorePasswordError, setRestorePasswordError] = useState<string | null>(null);

  // The credential export refuses to run without an editor password: a
  // password-less install has no way to tell the owner from anyone else on the
  // network, and this is the one thing that hands out raw keys. Disable the
  // opt-in rather than letting the export fail at the last step.
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);

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
    editorFetch('/api/auth/status')
      .then(async (res) => {
        if (res.ok) setAuthEnabled((await res.json()).authEnabled === true);
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

  // Two calls, not one: `GET /api/backup` never carries credentials, so the
  // opt-in section comes from a separate POST whose body can hold the
  // password (a URL would leak it into history and proxy logs).
  const runBackupExport = useCallback(async (password?: string) => {
    setBackupBusy(true);
    try {
      const res = await editorFetch('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();

      let withCredentials = false;
      if (includeCredentials) {
        const credRes = await editorFetch('/api/backup/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passphrase: password ?? '' }),
        });
        if (credRes.ok) {
          bundle.credentials = await credRes.json();
          withCredentials = true;
        } else {
          // Don't throw away a good bundle because the extra call failed.
          const proceed = await useConfirmStore.getState().confirm({
            title: t('settings.dataPage.alerts.credentialsExportFailedTitle'),
            message: t('settings.dataPage.alerts.credentialsExportFailed'),
            confirmLabel: t('settings.dataPage.alerts.credentialsExportFailedConfirm'),
          });
          if (!proceed) return;
        }
      }

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const date = new Date().toISOString().slice(0, 10);
      // A distinct filename so a file holding keys is identifiable at a
      // glance in a downloads folder.
      const filename = withCredentials
        ? `home-screens-backup-with-keys-${date}.json`
        : `home-screens-backup-${date}.json`;
      downloadBlob(blob, filename);
      setLastBackupDate(new Date().toISOString());
      // Pressing the button used to change nothing on screen: the file
      // appeared in the browser's downloads and the only in-app trace was a
      // "Last backup" date below the fold. Say what happened, where the
      // button is.
      setBackupSaved(filename);
    } catch {
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.exportBackupFailed'));
    } finally {
      setBackupBusy(false);
    }
  }, [includeCredentials, t]);

  // Say what a restore replaces before the OS file picker takes over the
  // screen. Opening the picker first put the destructive explanation after
  // the point of no return.
  const handleRestoreClick = useCallback(async () => {
    const ok = await useConfirmStore.getState().confirm({
      title: t('settings.dataPage.restoreConfirm.title'),
      message: t('settings.dataPage.restoreConfirm.message'),
      confirmLabel: t('settings.dataPage.restoreConfirm.confirm'),
      variant: 'danger',
    });
    if (ok) backupInputRef.current?.click();
  }, [t]);

  const handleBackupExport = useCallback(async () => {
    setBackupSaved(null);
    if (includeCredentials && protectCredentials) {
      setShowExportPasswordModal(true);
      return;
    }
    if (includeCredentials) {
      const ok = await useConfirmStore.getState().confirm({
        title: t('settings.dataPage.alerts.plaintextExportTitle'),
        message: t('settings.dataPage.alerts.plaintextExportMessage'),
        confirmLabel: t('settings.dataPage.alerts.plaintextExportConfirm'),
        variant: 'danger',
      });
      if (!ok) return;
    }
    await runBackupExport();
  }, [includeCredentials, protectCredentials, runBackupExport, t]);

  // Finish a successful restore. Reloading the server-authoritative config
  // (rather than hydrating from the upload) is what runs migrate-on-boot;
  // hydrating directly would leave the editor on a pre-migration shape until
  // the next save.
  const finishRestore = useCallback(async (result: RestoreResponse) => {
    const credentials = result.credentials;
    const notices: string[] = [];
    if (credentials?.skipped.includes('auth.ipRestrictAccess')) {
      notices.push(t('settings.dataPage.restore.ipRulesNotRestored'));
    }
    if (credentials?.skipped.includes('auth')) {
      notices.push(t('settings.dataPage.restore.loginNotRestored'));
    }

    // Restoring auth.json swapped the cookie secret, which just invalidated
    // the session cookie this tab is holding. Any follow-up fetch would 401
    // into a confusing half-loaded editor, so send the user to /login instead
    // of reloading the config.
    if (credentials?.applied.includes('auth')) {
      await useConfirmStore.getState().alert(
        [t('settings.dataPage.restore.signInAgain'), ...notices].join('\n\n'),
        t('settings.dataPage.restore.completeTitle'),
      );
      window.location.assign('/login');
      return;
    }

    if (notices.length > 0) {
      await useConfirmStore.getState().alert(
        notices.join('\n\n'),
        t('settings.dataPage.restore.completeTitle'),
      );
    }

    // Throw rather than skip on a bad response. `editorFetch` only throws on
    // 401, so an `if (configRes.ok)` guard would swallow a 500 and leave the
    // editor quietly showing pre-restore config with no sign anything was
    // wrong. The caller turns this into "restored, but couldn't reload".
    const configRes = await editorFetch('/api/config');
    if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
    // The revision comes along so the follow-up save is not refused as a
    // conflict with the restore itself.
    importConfig(JSON.stringify(await configRes.json()), configRes.headers.get(CONFIG_REVISION_HEADER));
    onSettingsImported();
  }, [importConfig, onSettingsImported, t]);

  /**
   * Shared restore path for legacy raw-config uploads and bundles alike.
   * Resolves to a credential error code when the server needs a password (or
   * got the wrong one) — those are recoverable and drive the unlock modal
   * rather than failing the whole restore.
   */
  const postBackupAndReload = useCallback(async (
    bundle: Record<string, unknown>,
    password?: string,
  ): Promise<CredentialErrorCode | null> => {
    let result: RestoreResponse;
    setBackupBusy(true);
    try {
      const body = password ? { ...bundle, _passphrase: password } : bundle;
      const res = await editorFetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 400) {
          const data = await res.json().catch(() => ({}));
          if (isCredentialErrorCode(data?.error)) return data.error;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      result = await res.json();
    } finally {
      setBackupBusy(false);
    }

    // Deliberately outside the block above. Everything past this point has
    // already been committed on the server, so a failure here is a reload
    // problem, not a failed restore — reporting it as one would tell the user
    // nothing happened to a device that has just been rewritten.
    try {
      await finishRestore(result);
    } catch (err) {
      if (isSessionExpired(err)) throw err;
      useConfirmStore.getState().alert(t('settings.dataPage.restore.reloadFailed'));
    }
    return null;
  }, [finishRestore, t]);

  const handleBackupRestore = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    let bundle: Record<string, unknown>;
    try {
      // Validate JSON parses (the API enforces shape — we only need to see
      // whether this bundle carries a credential section, and whether it is
      // locked, before deciding what to prompt for).
      bundle = JSON.parse(await file.text());
      if (!bundle || typeof bundle !== 'object') throw new Error('not an object');
    } catch {
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.invalidBackupFile'));
      return;
    }

    if (bundle.credentials !== undefined) {
      if (isEncryptedEnvelope(bundle.credentials)) {
        setRestorePasswordError(null);
        setPendingRestore(bundle);
        return;
      }
      const ok = await useConfirmStore.getState().confirm({
        title: t('settings.dataPage.restore.plaintextTitle'),
        message: t('settings.dataPage.restore.plaintextMessage'),
        confirmLabel: t('settings.dataPage.restore.plaintextConfirm'),
        variant: 'danger',
      });
      if (!ok) return;
    }

    try {
      const code = await postBackupAndReload(bundle);
      // The server rejects a credential section the client's cheaper
      // `isEncryptedEnvelope` check let through — a hand-edited file, a
      // truncated download. Without this the restore would just stop, with no
      // message and nothing changed.
      if (code === 'passphrase_required') {
        setRestorePasswordError(null);
        setPendingRestore(bundle);
        return;
      }
      if (code) {
        useConfirmStore.getState().alert(t('settings.dataPage.restore.damagedKeys'));
      }
    } catch (err) {
      if (isSessionExpired(err)) return;
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.restoreBackupFailed'));
    }
  }, [postBackupAndReload, t]);

  const handleRestorePassword = useCallback(async (password: string) => {
    if (!pendingRestore) return;
    try {
      const code = await postBackupAndReload(pendingRestore, password);
      if (code === 'bad_passphrase' || code === 'passphrase_required') {
        setRestorePasswordError(t('settings.dataPage.restore.wrongPassword'));
        return;
      }
      if (code === 'invalid_credentials') {
        setRestorePasswordError(t('settings.dataPage.restore.damagedKeys'));
        return;
      }
      setPendingRestore(null);
    } catch (err) {
      setPendingRestore(null);
      if (isSessionExpired(err)) return;
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.restoreBackupFailed'));
    }
  }, [pendingRestore, postBackupAndReload, t]);

  // The escape hatch that keeps a forgotten password from costing the whole
  // restore: drop the credential section and restore everything else.
  const handleRestoreWithoutKeys = useCallback(async () => {
    if (!pendingRestore) return;
    const { credentials: _dropped, ...withoutCredentials } = pendingRestore;
    setPendingRestore(null);
    try {
      await postBackupAndReload(withoutCredentials);
    } catch (err) {
      if (isSessionExpired(err)) return;
      useConfirmStore.getState().alert(t('settings.dataPage.alerts.restoreBackupFailed'));
    }
  }, [pendingRestore, postBackupAndReload, t]);

  return (
    <>
      <div className="space-y-6">
        {/* Full Backup */}
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.dataPage.fullBackup.heading')}
          </h3>
          <p className="text-xs text-hs-text-faint mb-3">
            {t('settings.dataPage.fullBackup.description')}
          </p>

          <div className="space-y-2 mb-3">
            <label
              className={`flex items-start gap-2.5 ${
                authEnabled === false ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
              data-field-id="data.fullBackupIncludeCredentials"
            >
              <input
                type="checkbox"
                checked={includeCredentials}
                disabled={authEnabled === false}
                onChange={(e) => {
                  setIncludeCredentials(e.target.checked);
                  if (!e.target.checked) setProtectCredentials(false);
                }}
                className="accent-hs-accent mt-0.5"
              />
              <span>
                <span className="block text-xs text-hs-text-body">
                  {t('settings.dataPage.fullBackup.includeCredentialsLabel')}
                </span>
                <span className="block text-xs text-hs-text-faint">
                  {authEnabled === false
                    ? t('settings.dataPage.fullBackup.needsEditorPassword')
                    : t('settings.dataPage.fullBackup.includeCredentialsHelp')}
                </span>
              </span>
            </label>

            {includeCredentials && (
              <div className="ml-6 space-y-2">
                <label
                  className="flex items-start gap-2.5 cursor-pointer"
                  data-field-id="data.fullBackupProtectCredentials"
                >
                  <input
                    type="checkbox"
                    checked={protectCredentials}
                    onChange={(e) => setProtectCredentials(e.target.checked)}
                    className="accent-hs-accent mt-0.5"
                  />
                  <span className="text-xs text-hs-text-body">
                    {t('settings.dataPage.fullBackup.protectLabel')}
                  </span>
                </label>
                {!protectCredentials && (
                  <p
                    className="text-xs text-hs-warning border border-hs-warning/40 bg-hs-warning/10 rounded-md px-2.5 py-2"
                    role="status"
                  >
                    {t('settings.dataPage.fullBackup.plaintextWarning')}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleBackupExport}
              disabled={backupBusy}
              data-field-id="data.fullBackupExport"
            >
              {backupBusy ? t('settings.dataPage.fullBackup.working') : t('settings.dataPage.fullBackup.backupButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRestoreClick}
              disabled={backupBusy}
              data-field-id="data.fullBackupRestore"
            >
              {t('settings.dataPage.fullBackup.restoreButton')}
            </Button>
          </div>

          {backupSaved && (
            <p className="mt-2 text-xs text-hs-success" aria-live="polite">
              {t('settings.dataPage.fullBackup.savedTo', { filename: backupSaved })}
            </p>
          )}
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
              variant="secondary"
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
      <TemplateFlow
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        replaceEmptyScreenId={selectedScreenId ?? undefined}
      />
      {showExportPasswordModal && (
        <BackupPasswordModal
          mode="set"
          busy={backupBusy}
          onSubmit={async (password) => {
            setShowExportPasswordModal(false);
            await runBackupExport(password);
          }}
          onClose={() => setShowExportPasswordModal(false)}
        />
      )}
      {pendingRestore && (
        <BackupPasswordModal
          mode="enter"
          busy={backupBusy}
          error={restorePasswordError}
          onSubmit={handleRestorePassword}
          onSkip={handleRestoreWithoutKeys}
          onClose={() => setPendingRestore(null)}
        />
      )}
    </>
  );
}
