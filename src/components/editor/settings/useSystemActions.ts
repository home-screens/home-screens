'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useConfirmStore } from '@/stores/confirm-store';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import { logger } from '@/lib/logger';
import type { ChangelogRelease, VersionResponse } from '@/lib/version';
import { parseUpdateChannel, type UpdateChannel } from '@/lib/semver';
import { resolveAutoUpdateSettings } from '@/lib/auto-update-policy';
import {
  versionChangeDialogKeys,
  versionChangeDirection,
  type VersionChangeDirection,
} from '@/lib/version-change-dialog';

const log = logger('system-settings');

export type PowerState =
  | { status: 'idle' }
  | { status: 'pending'; action: string }
  | { status: 'ok'; action: string }
  | { status: 'error'; message: string };

interface Options {
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
}

export interface SystemActions {
  /** Null until the first `/api/system/version` response lands, or on failure. */
  versionInfo: VersionResponse | null;
  releases: ChangelogRelease[];
  loading: boolean;
  checking: boolean;
  showChangelog: boolean;
  /** Release whose full notes are open in the changelog dialog, if any. */
  openRelease: ChangelogRelease | null;
  powerState: PowerState;
  channel: UpdateChannel;
  advancedMode: boolean;
  updateNotificationEnabled: boolean;
  updateNotifSaveError: boolean;
  /** The saved automatic update setting, with the default time filled in. */
  autoUpdate: { enabled: boolean; time: string };
  autoUpdateSaveError: boolean;
  handleCheckUpdates: () => void;
  handleOpenChangelog: () => void;
  handleOpenRelease: (release: ChangelogRelease | null) => void;
  handleSetChannel: (next: UpdateChannel) => Promise<void>;
  handleToggleAdvanced: () => Promise<void>;
  handleToggleUpdateNotification: (enabled: boolean) => Promise<void>;
  handleToggleAutoUpdate: (enabled: boolean) => Promise<void>;
  handleSetAutoUpdateTime: (time: string) => Promise<void>;
  handleUpgrade: (tag: string) => Promise<void>;
  handleRollback: (tag: string) => Promise<void>;
  /** Clears the "an update was undone" line. Optimistic; the marker is removed in the background. */
  handleDismissFailedUpdate: () => void;
  handlePowerAction: (action: 'reboot' | 'restart-service') => Promise<void>;
  handleCancelUpgrade: () => Promise<void>;
}

/**
 * Every imperative concern behind the System settings page: version and
 * changelog fetching, the update-channel / advanced-mode / update-notification
 * writes, and the confirm-gated upgrade, rollback, cancel and power calls.
 * `SystemSection` consumes this and stays presentational.
 *
 * Upgrade and rollback only confirm and hand the tag back to the caller — the
 * SSE run itself belongs to `UpgradeModal` / `useUpgradeStream`.
 */
export function useSystemActions({ onUpgrade, onRollback }: Options): SystemActions {
  const t = useTranslate('editor');
  const { updateSettings, saveConfig } = useEditorStore();
  const [versionInfo, setVersionInfo] = useState<VersionResponse | null>(null);
  const [releases, setReleases] = useState<ChangelogRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [openRelease, setOpenRelease] = useState<ChangelogRelease | null>(null);
  const [powerState, setPowerState] = useState<PowerState>({ status: 'idle' });
  const [updateNotifSaveError, setUpdateNotifSaveError] = useState(false);
  const [autoUpdateSaveError, setAutoUpdateSaveError] = useState(false);
  const [channel, setChannel] = useState<UpdateChannel>(() =>
    parseUpdateChannel(useEditorStore.getState().config?.settings?.updateChannel),
  );
  const advancedMode = useEditorStore((s) => s.config?.settings?.advancedMode ?? false);
  const updateNotificationEnabled = useEditorStore((s) => s.config?.settings?.updateNotification?.enabled ?? false);
  const savedAutoUpdate = useEditorStore((s) => s.config?.settings?.autoUpdate);
  const resolvedAutoUpdate = resolveAutoUpdateSettings(savedAutoUpdate);
  const autoUpdate = { enabled: resolvedAutoUpdate.enabled, time: resolvedAutoUpdate.time };

  const fetchAll = useCallback(async (forceCheck = false) => {
    try {
      const params = new URLSearchParams();
      if (forceCheck) params.set('check', 'true');
      params.set('channel', channel);
      const query = params.toString();
      const vRes = await editorFetch(`/api/system/version${query ? `?${query}` : ''}`);

      if (vRes.ok) {
        const data = await vRes.json();
        setVersionInfo(data);
      }
    } catch (err) {
      log.debug('Failed to fetch system info:', err);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [channel]);

  const fetchChangelog = useCallback(async () => {
    try {
      const res = await editorFetch(`/api/system/changelog?channel=${channel}`);
      if (res.ok) {
        const data = await res.json();
        setReleases(data.releases ?? []);
      }
    } catch (err) {
      log.debug('Failed to fetch changelog:', err);
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

  function handleOpenChangelog() {
    // The effect above owns the fetch — opening the panel is enough.
    setShowChangelog(true);
  }

  function handleOpenRelease(release: ChangelogRelease | null) {
    setOpenRelease(release);
  }

  async function handleSetChannel(next: UpdateChannel) {
    if (next === channel) return;
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

  /**
   * Save a change to the automatic update setting, then re-read the version
   * route so the "Next check" line follows it.
   */
  async function saveAutoUpdate(next: { enabled?: boolean; time?: string }) {
    const current = useEditorStore.getState().config?.settings?.autoUpdate;
    updateSettings({ autoUpdate: { enabled: current?.enabled ?? false, ...current, ...next } });
    setAutoUpdateSaveError(false);
    try {
      await saveConfig();
      await fetchAll();
    } catch {
      setAutoUpdateSaveError(true);
    }
  }

  async function handleToggleAutoUpdate(enabled: boolean) {
    await saveAutoUpdate({ enabled });
  }

  async function handleSetAutoUpdateTime(time: string) {
    await saveAutoUpdate({ time });
  }

  /** Prompt a confirmation dialog and, if confirmed, execute an async action */
  async function confirmAndRun(
    dialogOptions: Parameters<ReturnType<typeof useConfirmStore.getState>['confirm']>[0],
    action: () => Promise<void>,
  ) {
    if (!(await useConfirmStore.getState().confirm(dialogOptions))) return;
    await action();
  }

  function handleDismissFailedUpdate() {
    setVersionInfo((prev) => (prev ? { ...prev, lastFailedUpdate: null } : prev));
    editorFetch('/api/system/update-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearFailedUpdate' }),
    }).catch((err) => log.debug('Failed to clear the failed-update marker:', err));
  }

  /**
   * Confirm a version change with the dialog that matches its direction. The
   * banner installs whatever the chosen channel offers, which is sometimes an
   * older release, and a step backwards has to be asked for in those terms.
   */
  async function confirmVersionChange(
    tag: string,
    direction: VersionChangeDirection,
    install: () => void,
  ) {
    const keys = versionChangeDialogKeys(direction);
    await confirmAndRun(
      {
        title: t(keys.titleKey, { tag }),
        message: t(keys.messageKey, { tag }),
        confirmLabel: t(keys.confirmKey, { tag }),
        ...(keys.variant ? { variant: keys.variant } : {}),
      },
      async () => { install(); },
    );
  }

  async function handleUpgrade(tag: string) {
    await confirmVersionChange(
      tag,
      versionChangeDirection(versionInfo?.isDowngrade),
      () => onUpgrade(tag, versionInfo?.current ?? null),
    );
  }

  async function handleRollback(tag: string) {
    await confirmVersionChange(
      tag,
      'downgrade',
      () => onRollback(tag, versionInfo?.current ?? null),
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
          log.debug('Failed to cancel upgrade:', err);
        }
      },
    );
  }

  return {
    versionInfo,
    releases,
    loading,
    checking,
    showChangelog,
    openRelease,
    powerState,
    channel,
    advancedMode,
    updateNotificationEnabled,
    updateNotifSaveError,
    autoUpdate,
    autoUpdateSaveError,
    handleCheckUpdates,
    handleOpenChangelog,
    handleOpenRelease,
    handleSetChannel,
    handleToggleAdvanced,
    handleToggleUpdateNotification,
    handleToggleAutoUpdate,
    handleSetAutoUpdateTime,
    handleUpgrade,
    handleRollback,
    handleDismissFailedUpdate,
    handlePowerAction,
    handleCancelUpgrade,
  };
}
