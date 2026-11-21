'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { attachCustomIcons } from '@/lib/custom-icon-backup';
import { saveBackupFile } from '@/lib/picture-backup';
import type { BackupState } from '@/lib/backup-state';
import type { AutoBackupReminder } from '@/lib/backup-reminder-auto';
import { backupReminderKind } from '@/lib/backup-reminder';

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
  /**
   * Automatic backups are switched on. Their failures show whether or not
   * the reminder is on, and only a copy that has left the hub counts as a
   * backup for the reminder.
   */
  autoBackupEnabled?: boolean;
}

type ReminderState = BackupState & { auto?: AutoBackupReminder };

function latestDate(...dates: (string | null | undefined)[]): string | null {
  return dates.filter((d): d is string => !!d).sort().pop() ?? null;
}

export function useBackupReminder({
  enabled,
  intervalDays,
  fetchFn = fetch,
  pollIntervalMs,
  timezone,
  autoBackupEnabled = false,
}: UseBackupReminderOptions) {
  const [backupState, setBackupState] = useState<ReminderState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  /** When this tab dismissed, so a later failure shows again. */
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The last download went without the family's icons because they could
   *  not be read, although the switch asked for them. */
  const [iconsLeftOut, setIconsLeftOut] = useState(false);
  /** The last download went without the library pictures the remembered
   *  choice asked for (the zip could not be made), so it is a JSON file. */
  const [picturesLeftOut, setPicturesLeftOut] = useState(false);
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
    { enabled: enabled || autoBackupEnabled, intervalMs: pollIntervalMs },
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

  const auto = autoBackupEnabled && backupState?.auto?.enabled ? backupState.auto : null;
  /** The automatic backup, or sending it on, stopped working, and nobody has dismissed that since. */
  const autoFailed = useMemo((): 'backup' | 'offsite' | null => {
    if (!auto?.failed || !auto.failedAt) return null;
    const seen = latestDate(dismissedAt, backupState?.lastDismissedDate);
    if (seen && seen >= auto.failedAt) return null;
    return auto.failed;
  }, [auto, dismissedAt, backupState?.lastDismissedDate]);
  /** The last time a copy left the hub: a download, or a copy sent or fetched by itself. */
  const lastCopyAway = latestDate(backupState?.lastBackupDate, auto?.offsiteAt);

  const shouldShow = useMemo(() => {
    if (!backupState) return false;
    if (autoFailed) return true;
    if (!enabled) return false;
    // A backup that could not carry the icons is not the backup the reminder
    // asked for: stay up and say so, so the family can try again.
    if (iconsLeftOut || picturesLeftOut) return true;
    if (dismissed) return false;
    const intervalMs = intervalDays * 86_400_000;
    const now = Date.now();

    const lastBackup = lastCopyAway ? new Date(lastCopyAway).getTime() : 0;
    if (lastBackup && now - lastBackup <= intervalMs) return false;

    // First-run: no backup date yet — seed it instead of nagging
    if (!backupState.lastBackupDate) return false;

    const lastDismissed = backupState.lastDismissedDate
      ? new Date(backupState.lastDismissedDate).getTime()
      : 0;
    if (lastDismissed && now - lastDismissed <= intervalMs) return false;

    return true;
  }, [enabled, intervalDays, backupState, dismissed, iconsLeftOut, picturesLeftOut, autoFailed, lastCopyAway]);

  /**
   * Automatic backups are on but none of their copies has left the hub in
   * time: the reminder says to send one somewhere else rather than to
   * download one.
   */
  const autoLocalOnly = shouldShow && !autoFailed && !iconsLeftOut && !picturesLeftOut && !!auto;

  const daysSinceBackup = useMemo(() => {
    if (!lastCopyAway) return null;
    const ms = Date.now() - new Date(lastCopyAway).getTime();
    return Math.floor(ms / 86_400_000);
  }, [lastCopyAway]);

  /** Download a full backup. Returns true when a file was saved (then
   *  `iconsLeftOut` and `picturesLeftOut` say what it lacks), false on failure. */
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
      const saved = await saveBackupFile(bundle, fetchFn, { timezone });
      // Optimistic update — server records the timestamp via fire-and-forget in the GET handler
      setBackupState((prev) => prev ? { ...prev, lastBackupDate: new Date().toISOString(), lastDismissedDate: null } : prev);
      setIconsLeftOut(leftOut);
      setPicturesLeftOut(saved.picturesLeftOut);
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
    setDismissedAt(new Date().toISOString());
    setIconsLeftOut(false);
    setPicturesLeftOut(false);
    fetchFn('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {});
  }, [fetchFn]);

  /** Which message is up; each surface gives it its own words and buttons. */
  const kind = backupReminderKind({ shouldShow, autoFailed, iconsLeftOut, picturesLeftOut, autoOn: !!auto });

  return { shouldShow, kind, daysSinceBackup, busy, iconsLeftOut, picturesLeftOut, autoFailed, autoLocalOnly, handleBackup, handleDismiss };
}
