'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import Toggle from '@/components/ui/Toggle';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFormattingLocale, useTranslate } from '@/i18n';

interface TagInfo {
  tag: string;
  version: string;
  commit: string;
  hasTarball?: boolean;
}

interface VersionInfo {
  current: string;
  currentCommit: string;
  latest: string | null;
  updateAvailable: boolean;
  installedVia: 'git' | 'tarball' | 'unknown';
  channel: string;
  tags: TagInfo[];
  upgradeRunning: boolean;
}

interface Release {
  tag: string;
  name: string;
  body: string;
  published: string | null;
}

interface BackupFile {
  name: string;
  size: number;
  modified: string;
}

type PowerState =
  | { status: 'idle' }
  | { status: 'pending'; action: string }
  | { status: 'ok'; action: string }
  | { status: 'error'; message: string };

// kind drives styling/role explicitly — don't sniff English prefixes from message.
type RestoreStatusKind = 'progress' | 'success' | 'error';
interface RestoreStatus {
  message: string;
  kind: RestoreStatusKind;
}

interface Props {
  onUpgrade: (tag: string) => void;
  onRollback: (tag: string) => void;
}

export default function SystemSection({ onUpgrade, onRollback }: Props) {
  const t = useTranslate('editor');
  const locale = useFormattingLocale();
  const { updateSettings, saveConfig } = useEditorStore();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [powerState, setPowerState] = useState<PowerState>({ status: 'idle' });
  const [updateNotifSaveError, setUpdateNotifSaveError] = useState(false);
  const [channel, setChannel] = useState<'stable' | 'dev'>(() => {
    const cfg = useEditorStore.getState().config;
    return cfg?.settings?.updateChannel === 'dev' ? 'dev' : 'stable';
  });
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);
  const updateNotificationEnabled = useEditorStore((s) => s.config?.settings?.updateNotification?.enabled ?? false);

  const fetchAll = useCallback(async (forceCheck = false) => {
    try {
      const params = new URLSearchParams();
      if (forceCheck) params.set('check', 'true');
      if (channel === 'dev') params.set('channel', 'dev');
      const query = params.toString();
      const [vRes, bRes] = await Promise.all([
        editorFetch(`/api/system/version${query ? `?${query}` : ''}`),
        editorFetch('/api/system/backups'),
      ]);

      if (vRes.ok) {
        const data = await vRes.json();
        setVersionInfo(data);
      }
      if (bRes.ok) {
        const data = await bRes.json();
        setBackups(data.backups ?? []);
      }
    } catch (err) {
      console.debug('Failed to fetch system info:', err);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [channel]);

  const fetchChangelog = useCallback(async () => {
    try {
      const params = channel === 'dev' ? '?channel=dev' : '';
      const res = await editorFetch(`/api/system/changelog${params}`);
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases ?? []);
      }
    } catch (err) {
      console.debug('Failed to fetch changelog:', err);
    }
  }, [channel]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Re-fetch changelog when channel changes while the panel is open
  useEffect(() => {
    if (showChangelog) fetchChangelog();
  }, [fetchChangelog, showChangelog]);

  function handleCheckUpdates() {
    setChecking(true);
    fetchAll(true);
  }

  async function handleToggleChannel() {
    const next = channel === 'stable' ? 'dev' : 'stable';
    setChannel(next);
    updateSettings({ updateChannel: next });
    try {
      await saveConfig();
    } catch {
      // Store is updated in-memory; config will be saved on next successful write
    }
  }

  async function handleToggleAdvanced() {
    updateSettings({ advancedMode: !advancedMode });
    try {
      await saveConfig();
    } catch {
      // Store is updated in-memory; config will be saved on next successful write
    }
  }

  async function handleToggleUpdateNotification(enabled: boolean) {
    updateSettings({ updateNotification: { ...useEditorStore.getState().config?.settings?.updateNotification, enabled } });
    setUpdateNotifSaveError(false);
    try {
      await saveConfig();
    } catch {
      setUpdateNotifSaveError(true);
    }
  }

  /** Prompt a confirmation dialog and, if confirmed, execute an async action */
  async function confirmAndRun(
    dialogOptions: Parameters<ReturnType<typeof useConfirmStore.getState>['confirm']>[0],
    action: () => Promise<void>,
  ) {
    if (!(await useConfirmStore.getState().confirm(dialogOptions))) return;
    await action();
  }

  async function handleRestoreBackup(name: string) {
    await confirmAndRun(
      {
        title: t('settings.systemPage.restoreDialog.title'),
        message: t('settings.systemPage.restoreDialog.message', { name }),
        confirmLabel: t('settings.systemPage.restoreDialog.confirm'),
      },
      async () => {
        setRestoreStatus({
          message: t('settings.systemPage.restoreStatus.restoring'),
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
              message: t('settings.systemPage.restoreStatus.restored'),
              kind: 'success',
            });
          } else {
            const data = await res.json();
            setRestoreStatus({
              message: t('settings.systemPage.restoreStatus.error', { error: data.error }),
              kind: 'error',
            });
          }
        } catch {
          setRestoreStatus({
            message: t('settings.systemPage.restoreStatus.failed'),
            kind: 'error',
          });
        }
      },
    );
  }

  async function handleUpgrade(tag: string) {
    await confirmAndRun(
      {
        title: t('settings.systemPage.upgradeDialog.title'),
        message: t('settings.systemPage.upgradeDialog.message', { tag }),
        confirmLabel: t('settings.systemPage.upgradeDialog.confirm'),
        variant: 'primary',
      },
      async () => { onUpgrade(tag); },
    );
  }

  async function handleRollback(tag: string) {
    await confirmAndRun(
      {
        title: t('settings.systemPage.rollbackDialog.title'),
        message: t('settings.systemPage.rollbackDialog.message', { tag }),
        confirmLabel: t('settings.systemPage.rollbackDialog.confirm'),
      },
      async () => { onRollback(tag); },
    );
  }

  async function handlePowerAction(action: 'reboot' | 'restart-service') {
    await confirmAndRun(
      {
        title: action === 'reboot'
          ? t('settings.systemPage.powerDialog.rebootTitle')
          : t('settings.systemPage.powerDialog.restartTitle'),
        message: action === 'reboot'
          ? t('settings.systemPage.powerDialog.rebootMessage')
          : t('settings.systemPage.powerDialog.restartMessage'),
        confirmLabel: action === 'reboot'
          ? t('settings.systemPage.powerDialog.rebootConfirm')
          : t('settings.systemPage.powerDialog.restartConfirm'),
      },
      async () => {
        setPowerState({ status: 'pending', action });
        try {
          const res = await editorFetch('/api/system/power', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          if (res.ok) {
            setPowerState({ status: 'ok', action });
          } else {
            const data = await res.json();
            setPowerState({
              status: 'error',
              message: data.error || t('settings.systemPage.powerStatus.unknownError'),
            });
          }
        } catch {
          setPowerState({
            status: 'error',
            message: t('common.serverUnreachable'),
          });
        }
      },
    );
  }

  async function handleCancelUpgrade() {
    await confirmAndRun(
      {
        title: t('settings.systemPage.cancelUpgradeDialog.title'),
        message: t('settings.systemPage.cancelUpgradeDialog.message'),
        confirmLabel: t('settings.systemPage.cancelUpgradeDialog.confirm'),
      },
      async () => {
        try {
          const res = await editorFetch('/api/system/upgrade', { method: 'DELETE' });
          if (res.ok) {
            fetchAll();
          }
        } catch (err) {
          console.debug('Failed to cancel upgrade:', err);
        }
      },
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-hs-text-faint py-8 text-center">
        {t('settings.systemPage.loading')}
      </div>
    );
  }

  if (!versionInfo) {
    return (
      <div className="text-sm text-hs-danger py-8 text-center">
        {t('settings.systemPage.loadFailed')}
      </div>
    );
  }

  const latestIsPrerelease = versionInfo.latest?.includes('-') ?? false;

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* Advanced mode */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.advanced.heading')}
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-hs-text-primary">{t('settings.systemPage.advanced.toggleLabel')}</p>
            <p className="text-xs text-hs-text-faint mt-0.5">
              {t('settings.systemPage.advanced.help')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={advancedMode}
            onClick={handleToggleAdvanced}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              advancedMode ? 'bg-hs-accent' : 'bg-hs-card border border-hs-border-strong'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                advancedMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Current Version */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.version.heading')}
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-hs-text-primary font-mono text-sm">
              v{versionInfo.current}
              {versionInfo.currentCommit !== 'unknown' && (
                <span className="text-hs-text-faint ml-2">({versionInfo.currentCommit})</span>
              )}
            </p>
            <p className="text-xs text-hs-text-faint mt-0.5">
              {versionInfo.installedVia === 'git'
                ? t('settings.systemPage.version.branchLabel', { channel: versionInfo.channel })
                : t('settings.systemPage.version.installedFromRelease')}
              {advancedMode && (
                <>
                  {' · '}
                  <button
                    onClick={handleToggleChannel}
                    className="text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    {channel === 'stable'
                      ? t('settings.systemPage.version.stableChannel')
                      : t('settings.systemPage.version.prereleaseChannel')}
                  </button>
                </>
              )}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={checking}
          >
            {checking
              ? t('settings.systemPage.version.checking')
              : t('settings.systemPage.version.checkButton')}
          </Button>
        </div>

        {versionInfo.upgradeRunning && (
          <div className="mt-3 rounded-lg bg-hs-warning/20 border border-hs-warning/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-hs-warning font-medium">
                  {t('settings.systemPage.upgradeInProgress.title')}
                </p>
                <p className="text-xs text-hs-warning/70 mt-0.5">
                  {t('settings.systemPage.upgradeInProgress.help')}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelUpgrade}
              >
                {t('settings.systemPage.upgradeInProgress.cancelButton')}
              </Button>
            </div>
          </div>
        )}

        {versionInfo.updateAvailable && versionInfo.latest && (
          <div className={`mt-3 rounded-lg border p-3 ${
            latestIsPrerelease
              ? 'bg-hs-warning/20 border-hs-warning/30'
              : 'bg-hs-accent-soft border-hs-accent/30'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${
                  latestIsPrerelease ? 'text-hs-warning' : 'text-hs-accent-hover'
                }`}>
                  {latestIsPrerelease
                    ? t('settings.systemPage.updateAvailable.prereleaseTitle', { version: versionInfo.latest })
                    : t('settings.systemPage.updateAvailable.updateTitle', { version: versionInfo.latest })}
                </p>
                <p className={`text-xs mt-0.5 ${
                  latestIsPrerelease ? 'text-hs-warning/70' : 'text-hs-accent-hover/70'
                }`}>
                  {t('settings.systemPage.updateAvailable.currentLine', { version: versionInfo.current })}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade(`v${versionInfo.latest}`)}
              >
                {latestIsPrerelease
                  ? t('settings.systemPage.updateAvailable.installButton')
                  : t('settings.systemPage.updateAvailable.updateButton')}
              </Button>
            </div>
          </div>
        )}

        {!versionInfo.updateAvailable && (
          <p className="text-xs text-hs-success/80 mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
            {t('settings.systemPage.upToDate')}
          </p>
        )}
      </section>

      {/* Update Notification */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.updateNotification.heading')}
        </h3>
        <p className="text-xs text-hs-text-faint mb-3">
          {t('settings.systemPage.updateNotification.description')}
        </p>
        <Toggle
          label={t('settings.systemPage.updateNotification.enableLabel')}
          checked={updateNotificationEnabled}
          onChange={handleToggleUpdateNotification}
        />
        {updateNotifSaveError && (
          <p className="text-xs text-hs-danger mt-2" role="alert">
            {t('common.saveFailed')}
          </p>
        )}
      </section>

      {/* Changelog */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            {t('settings.systemPage.changelog.heading')}
          </h3>
          {!showChangelog && (
            <button
              onClick={() => { setShowChangelog(true); fetchChangelog(); }}
              className="text-xs text-hs-accent hover:text-hs-accent-hover"
            >
              {t('settings.systemPage.changelog.viewButton')}
            </button>
          )}
        </div>

        {showChangelog && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {releases.length === 0 ? (
              <p className="text-xs text-hs-text-faint">
                {t('settings.systemPage.changelog.empty')}
              </p>
            ) : (
              releases.map((r) => (
                <div key={r.tag} className="rounded-md bg-hs-card border border-hs-border-strong p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-hs-text-body font-mono">{r.tag}</span>
                    {r.published && (
                      <span className="text-xs text-hs-text-faint">
                        {new Date(r.published).toLocaleDateString(locale)}
                      </span>
                    )}
                  </div>
                  {r.body && (
                    <p className="text-xs text-hs-text-muted mt-1 whitespace-pre-line line-clamp-3">
                      {r.body}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Version History / Rollback */}
      {versionInfo.tags.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
            {t('settings.systemPage.history.heading')}
          </h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {versionInfo.tags.map((tagInfo) => {
              const isCurrent = tagInfo.version === versionInfo.current;
              return (
                <div
                  key={tagInfo.tag}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-hs-input border border-hs-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-hs-text-primary font-mono">{tagInfo.tag}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-accent/30 text-hs-accent-hover px-1.5 py-0.5 rounded">
                        {t('settings.systemPage.history.currentBadge')}
                      </span>
                    )}
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => handleRollback(tagInfo.tag)}
                      className="text-xs text-hs-text-muted hover:text-hs-warning transition-colors"
                    >
                      {t('settings.systemPage.history.rollback')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Config Backups */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.backups.heading')}
        </h3>
        {backups.length === 0 ? (
          <p className="text-xs text-hs-text-faint">
            {t('settings.systemPage.backups.empty')}
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {backups.map((b) => (
              <div
                key={b.name}
                className="flex items-center justify-between rounded-md px-3 py-2 bg-hs-input border border-hs-border"
              >
                <div>
                  <span className="text-xs text-hs-text-body font-mono">{b.name}</span>
                  <span className="text-xs text-hs-text-faint ml-2">
                    {t('settings.systemPage.backups.sizeKb', { size: (b.size / 1024).toFixed(1) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/system/backups?download=${encodeURIComponent(b.name)}`}
                    download={b.name}
                    className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    {t('settings.systemPage.backups.download')}
                  </a>
                  <button
                    onClick={() => handleRestoreBackup(b.name)}
                    className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    {t('settings.systemPage.backups.restore')}
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

      {/* System Actions */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          {t('settings.systemPage.actions.heading')}
        </h3>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePowerAction('restart-service')}
            disabled={powerState.status !== 'idle'}
          >
            {t('settings.systemPage.actions.restartService')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handlePowerAction('reboot')}
            disabled={powerState.status !== 'idle'}
          >
            {t('settings.systemPage.actions.rebootSystem')}
          </Button>
        </div>
        {powerState.status === 'ok' && powerState.action === 'restart-service' && (
          <p className="text-xs text-hs-success mt-2">
            {t('settings.systemPage.powerStatus.restartScheduled')}
          </p>
        )}
        {powerState.status === 'ok' && powerState.action === 'reboot' && (
          <p className="text-xs text-hs-success mt-2">
            {t('settings.systemPage.powerStatus.rebootScheduled')}
          </p>
        )}
        {powerState.status === 'error' && (
          <p className="text-xs text-hs-danger mt-2">
            {powerState.message}
          </p>
        )}
        {powerState.status === 'pending' && (
          <p className="text-xs text-hs-text-faint mt-2">
            {t('settings.systemPage.powerStatus.processing')}
          </p>
        )}
        <p className="text-xs text-hs-text-faint mt-2">
          {t('settings.systemPage.actions.help')}
        </p>
      </section>
    </div>
  );
}
