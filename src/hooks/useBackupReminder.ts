'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { downloadBlob } from '@/lib/download';
import { attachCustomIcons } from '@/lib/custom-icon-backup';
import { backupFileName } from '@/lib/backup-file-name';
import type { BackupState } from '@/lib/backup-state';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface UseBackupReminderOptions {
  enabled: boolean;
  intervalDays: number;
  /** Override fetch for auth-aware wrappers like editorFetch. Defaults to window.fetch. */
  fetchFn?: FetchFn;
  /** If set, re-check backup state on this interval (ms). The editor uses 3_600_000 (1 hour). */
  pollIntervalMs?: number;
  /** The household's zone, which dates the downloaded file. */
  timezone?: string;
}

export function useBackupReminder({
  enabled,
  intervalDays,
  fetchFn = fetch,
  pollIntervalMs,
  timezone,
}: UseBackupReminderOptions) {
  const [backupState, setBackupState] = useState<BackupState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The last download went without the family's icons because they could
   *  not be read, although the switch asked for them. */
  const [iconsLeftOut, setIconsLeftOut] = useState(false);
  const seedingRef = useRef(false);

  // Fetch backup state on mount, then optionally poll
  usePolledFetch(
    async (isMounted) => {
      try {
        const res = await fetchFn('/api/backup/reminder');
        if (!isMounted()) return;
        if (res.ok) setBackupState(await res.json());
      } catch {
        // Not critical
      }
    },
    [fetchFn],
    { enabled, intervalMs: pollIntervalMs },
  );

  // Seed lastBackupDate on first encounter when null (avoids nagging new users)
  useEffect(() => {
    if (!enabled || !backupState) return;
    if (backupState.lastBackupDate !== null) return;
    if (seedingRef.current) return;
    seedingRef.current = true;

    let mounted = true;
    fetchFn('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'backed-up' }),
    }).then(async (res) => {
      if (res.ok && mounted) setBackupState(await res.json());
    }).catch(() => {}).finally(() => { seedingRef.current = false; });

    return () => { mounted = false; };
  }, [enabled, backupState?.lastBackupDate, fetchFn]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-run when lastBackupDate changes, not the full object

  const shouldShow = useMemo(() => {
    if (!enabled || !backupState) return false;
    // A backup that could not carry the icons is not the backup the reminder
    // asked for: stay up and say so, so the family can try again.
    if (iconsLeftOut) return true;
    if (dismissed) return false;
    const intervalMs = intervalDays * 86_400_000;
    const now = Date.now();

    const lastBackup = backupState.lastBackupDate
      ? new Date(backupState.lastBackupDate).getTime()
      : 0;
    if (lastBackup && now - lastBackup <= intervalMs) return false;

    // First-run: no backup date yet — seed it instead of nagging
    if (!backupState.lastBackupDate) return false;

    const lastDismissed = backupState.lastDismissedDate
      ? new Date(backupState.lastDismissedDate).getTime()
      : 0;
    if (lastDismissed && now - lastDismissed <= intervalMs) return false;

    return true;
  }, [enabled, intervalDays, backupState, dismissed, iconsLeftOut]);

  const daysSinceBackup = useMemo(() => {
    if (!backupState?.lastBackupDate) return null;
    const ms = Date.now() - new Date(backupState.lastBackupDate).getTime();
    return Math.floor(ms / 86_400_000);
  }, [backupState?.lastBackupDate]);

  /** Download a full backup. Returns true when a file was saved (then
   *  `iconsLeftOut` says whether it lacks the icons), false on failure. */
  const handleBackup = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetchFn('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let bundle = await res.json();
      // A backup without the pictures still beats no backup, so a failure
      // to read them saves the rest and reports it rather than saving nothing.
      let leftOut = false;
      try { bundle = await attachCustomIcons(bundle, fetchFn); } catch { leftOut = true; }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      downloadBlob(blob, backupFileName(timezone));
      // Optimistic update — server records the timestamp via fire-and-forget in the GET handler
      setBackupState((prev) => prev ? { ...prev, lastBackupDate: new Date().toISOString(), lastDismissedDate: null } : prev);
      setIconsLeftOut(leftOut);
      setDismissed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [fetchFn, timezone]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setIconsLeftOut(false);
    fetchFn('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {});
  }, [fetchFn]);

  return { shouldShow, daysSinceBackup, busy, iconsLeftOut, handleBackup, handleDismiss };
}
