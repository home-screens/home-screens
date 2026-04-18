'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import Button from '@/components/ui/Button';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';

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

interface Props {
  onUpgrade: (tag: string) => void;
  onRollback: (tag: string) => void;
}

export default function SystemSection({ onUpgrade, onRollback }: Props) {
  const { updateSettings, saveConfig } = useEditorStore();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [powerState, setPowerState] = useState<PowerState>({ status: 'idle' });
  const [channel, setChannel] = useState<'stable' | 'dev'>(() => {
    const cfg = useEditorStore.getState().config;
    return cfg?.settings?.updateChannel === 'dev' ? 'dev' : 'stable';
  });
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);

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
      { title: 'Restore Backup', message: `Restore configuration from ${name}? Current config will be overwritten.`, confirmLabel: 'Restore' },
      async () => {
        setRestoreStatus('Restoring...');
        try {
          const res = await editorFetch('/api/system/backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          if (res.ok) {
            setRestoreStatus('Restored! Reload the editor to see changes.');
          } else {
            const data = await res.json();
            setRestoreStatus(`Error: ${data.error}`);
          }
        } catch {
          setRestoreStatus('Failed to restore backup');
        }
      },
    );
  }

  async function handleUpgrade(tag: string) {
    await confirmAndRun(
      { title: 'Upgrade', message: `Upgrade to ${tag}? The server will restart and you may briefly lose connection.`, confirmLabel: 'Upgrade', variant: 'primary' },
      async () => { onUpgrade(tag); },
    );
  }

  async function handleRollback(tag: string) {
    await confirmAndRun(
      { title: 'Rollback', message: `Roll back to ${tag}? The server will restart.`, confirmLabel: 'Roll Back' },
      async () => { onRollback(tag); },
    );
  }

  async function handlePowerAction(action: 'reboot' | 'restart-service') {
    const label = action === 'reboot' ? 'reboot the system' : 'restart the service';
    await confirmAndRun(
      { title: action === 'reboot' ? 'Reboot System' : 'Restart Service', message: `Are you sure you want to ${label}? You may briefly lose connection.`, confirmLabel: action === 'reboot' ? 'Reboot' : 'Restart' },
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
            setPowerState({ status: 'error', message: data.error || 'Unknown error' });
          }
        } catch {
          setPowerState({ status: 'error', message: 'Failed to reach server' });
        }
      },
    );
  }

  async function handleCancelUpgrade() {
    await confirmAndRun(
      { title: 'Cancel Upgrade', message: 'Are you sure? The running upgrade will be killed. You may need to retry afterwards.', confirmLabel: 'Cancel Upgrade' },
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
        Loading system info...
      </div>
    );
  }

  if (!versionInfo) {
    return (
      <div className="text-sm text-hs-danger py-8 text-center">
        Failed to load system information
      </div>
    );
  }

  const latestIsPrerelease = versionInfo.latest?.includes('-') ?? false;

  return (
    <div className="space-y-0 divide-y divide-hs-border-strong [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      {/* Advanced mode */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          Advanced
        </h3>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-hs-text-primary">Show advanced options</p>
            <p className="text-xs text-hs-text-faint mt-0.5">
              Reveals developer-facing controls: pre-release channel, GitHub token, and plugin developer mode.
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
          Version
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
                ? `Branch: ${versionInfo.channel}`
                : 'Installed from release'}
              {advancedMode && (
                <>
                  {' · '}
                  <button
                    onClick={handleToggleChannel}
                    className="text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    {channel === 'stable' ? 'Stable' : 'Pre-release'} channel
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
            {checking ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>

        {versionInfo.upgradeRunning && (
          <div className="mt-3 rounded-lg bg-hs-warning/20 border border-hs-warning/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-hs-warning font-medium">
                  Upgrade in progress
                </p>
                <p className="text-xs text-hs-warning/70 mt-0.5">
                  An upgrade is currently running. If it appears stuck, you can cancel it.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={handleCancelUpgrade}
              >
                Cancel Upgrade
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
                  {latestIsPrerelease ? 'Pre-release' : 'Update'} available: v{versionInfo.latest}
                </p>
                <p className={`text-xs mt-0.5 ${
                  latestIsPrerelease ? 'text-hs-warning/70' : 'text-hs-accent-hover/70'
                }`}>
                  You are on v{versionInfo.current}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpgrade(`v${versionInfo.latest}`)}
              >
                {latestIsPrerelease ? 'Install' : 'Update Now'}
              </Button>
            </div>
          </div>
        )}

        {!versionInfo.updateAvailable && (
          <p className="text-xs text-hs-success/80 mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-hs-success inline-block" />
            You&apos;re on the latest version
          </p>
        )}
      </section>

      {/* Changelog */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-hs-text-secondary uppercase tracking-wider">
            Changelog
          </h3>
          {!showChangelog && (
            <button
              onClick={() => { setShowChangelog(true); fetchChangelog(); }}
              className="text-xs text-hs-accent hover:text-hs-accent-hover"
            >
              View Changelog
            </button>
          )}
        </div>

        {showChangelog && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {releases.length === 0 ? (
              <p className="text-xs text-hs-text-faint">No releases found on GitHub.</p>
            ) : (
              releases.map((r) => (
                <div key={r.tag} className="rounded-md bg-hs-card border border-hs-border-strong p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-hs-text-body font-mono">{r.tag}</span>
                    {r.published && (
                      <span className="text-xs text-hs-text-faint">
                        {new Date(r.published).toLocaleDateString()}
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
            Version History
          </h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {versionInfo.tags.map((t) => {
              const isCurrent = t.version === versionInfo.current;
              return (
                <div
                  key={t.tag}
                  className="flex items-center justify-between rounded-md px-3 py-2 bg-hs-input border border-hs-border"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-hs-text-primary font-mono">{t.tag}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider bg-hs-accent/30 text-hs-accent-hover px-1.5 py-0.5 rounded">
                        current
                      </span>
                    )}
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => handleRollback(t.tag)}
                      className="text-xs text-hs-text-muted hover:text-hs-warning transition-colors"
                    >
                      Rollback
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
          Config Backups
        </h3>
        {backups.length === 0 ? (
          <p className="text-xs text-hs-text-faint">
            No backups yet. Backups are created automatically before each upgrade.
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
                    {(b.size / 1024).toFixed(1)}KB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/system/backups?download=${encodeURIComponent(b.name)}`}
                    download={b.name}
                    className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => handleRestoreBackup(b.name)}
                    className="text-xs text-hs-text-muted hover:text-hs-accent-hover transition-colors"
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {restoreStatus && (
          <p className={`text-xs mt-2 ${restoreStatus.startsWith('Error') ? 'text-hs-danger' : 'text-hs-success'}`}>
            {restoreStatus}
          </p>
        )}
      </section>

      {/* System Actions */}
      <section>
        <h3 className="text-sm font-medium text-hs-text-secondary mb-3 uppercase tracking-wider">
          System Actions
        </h3>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handlePowerAction('restart-service')}
            disabled={powerState.status !== 'idle'}
          >
            Restart Service
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handlePowerAction('reboot')}
            disabled={powerState.status !== 'idle'}
          >
            Reboot System
          </Button>
        </div>
        {powerState.status === 'ok' && powerState.action === 'restart-service' && (
          <p className="text-xs text-hs-success mt-2">
            Service restart scheduled. The page will reload momentarily...
          </p>
        )}
        {powerState.status === 'ok' && powerState.action === 'reboot' && (
          <p className="text-xs text-hs-success mt-2">
            System reboot scheduled. The display will come back online shortly...
          </p>
        )}
        {powerState.status === 'error' && (
          <p className="text-xs text-hs-danger mt-2">
            {powerState.message}
          </p>
        )}
        {powerState.status === 'pending' && (
          <p className="text-xs text-hs-text-faint mt-2">Processing...</p>
        )}
        <p className="text-xs text-hs-text-faint mt-2">
          Restart Service reloads the app. Reboot System restarts the entire Raspberry Pi.
        </p>
      </section>
    </div>
  );
}
