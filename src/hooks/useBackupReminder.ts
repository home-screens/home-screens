'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { BackupState } from '@/lib/backup-state';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

interface UseBackupReminderOptions {
  enabled: boolean;
  intervalDays: number;
  /** Override fetch for auth-aware wrappers like editorFetch. Defaults to window.fetch. */
  fetchFn?: FetchFn;
  /** If set, re-check backup state on this interval (ms). The editor uses 3_600_000 (1 hour). */
  pollIntervalMs?: number;
}

export function useBackupReminder({
  enabled,
  intervalDays,
  fetchFn = fetch,
  pollIntervalMs,
}: UseBackupReminderOptions) {
  const [backupState, setBackupState] = useState<BackupState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const seedingRef = useRef(false);

  // Fetch backup state on mount, then optionally poll
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    async function check() {
      try {
        const res = await fetchFn('/api/backup/reminder');
        if (!mounted) return;
        if (res.ok) setBackupState(await res.json());
      } catch {
        // Not critical
      }
    }

    check();
    const id = pollIntervalMs ? setInterval(check, pollIntervalMs) : undefined;
    return () => { mounted = false; if (id) clearInterval(id); };
  }, [enabled, fetchFn, pollIntervalMs]);

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
    if (!enabled || !backupState || dismissed) return false;
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
  }, [enabled, intervalDays, backupState, dismissed]);

  const daysSinceBackup = useMemo(() => {
    if (!backupState?.lastBackupDate) return null;
    const ms = Date.now() - new Date(backupState.lastBackupDate).getTime();
    return Math.floor(ms / 86_400_000);
  }, [backupState?.lastBackupDate]);

  /** Download a full backup. Returns true on success, false on failure. */
  const handleBackup = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetchFn('/api/backup');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `home-screens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // Optimistic update — server records the timestamp via fire-and-forget in the GET handler
      setBackupState((prev) => prev ? { ...prev, lastBackupDate: new Date().toISOString(), lastDismissedDate: null } : prev);
      setDismissed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [fetchFn]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    fetchFn('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {});
  }, [fetchFn]);

  return { shouldShow, daysSinceBackup, busy, handleBackup, handleDismiss };
}
