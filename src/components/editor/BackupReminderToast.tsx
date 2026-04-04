'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { X, Download } from 'lucide-react';
import type { BackupState } from '@/lib/backup-state';

const CHECK_INTERVAL_MS = 3_600_000; // 1 hour

export default function BackupReminderToast() {
  const reminderSettings = useEditorStore((s) => s.config?.settings?.backupReminder);
  const [backupState, setBackupState] = useState<BackupState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const seedingRef = useRef(false);

  // Fetch backup state on mount, then periodically
  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await editorFetch('/api/backup/reminder');
        if (!mounted) return;
        if (res.ok) setBackupState(await res.json());
      } catch {
        // Silently fail — not critical
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const shouldShow = useMemo(() => {
    if (!reminderSettings?.enabled || !backupState || dismissed) return false;
    const intervalMs = (reminderSettings.intervalDays ?? 7) * 86_400_000;
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
  }, [reminderSettings, backupState, dismissed]);

  // Seed lastBackupDate on first encounter when null
  useEffect(() => {
    if (!reminderSettings?.enabled || !backupState) return;
    if (backupState.lastBackupDate !== null) return;
    if (seedingRef.current) return;
    seedingRef.current = true;

    editorFetch('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'backed-up' }),
    }).then(async (res) => {
      if (res.ok) setBackupState(await res.json());
    }).catch(() => {}).finally(() => { seedingRef.current = false; });
  }, [reminderSettings?.enabled, backupState?.lastBackupDate]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-run when lastBackupDate changes, not the full object

  const daysSinceBackup = useMemo(() => {
    if (!backupState?.lastBackupDate) return null;
    const ms = Date.now() - new Date(backupState.lastBackupDate).getTime();
    return Math.floor(ms / 86_400_000);
  }, [backupState?.lastBackupDate]);

  const handleBackup = useCallback(async () => {
    setBusy(true);
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
      // Update local state to reflect the backup (server records it via fire-and-forget)
      setBackupState((prev) => prev ? { ...prev, lastBackupDate: new Date().toISOString(), lastDismissedDate: null } : prev);
      setDismissed(true);
    } catch {
      // Backup failed — leave toast visible
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    editorFetch('/api/backup/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    }).catch(() => {});
  }, []);

  if (!shouldShow) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-[toast-slide-up_0.3s_ease-out]">
      <style>{`
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-neutral-900/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/30">
        <div className="text-amber-400 text-sm">
          {daysSinceBackup !== null
            ? `You haven\u2019t backed up in ${daysSinceBackup} day${daysSinceBackup === 1 ? '' : 's'}.`
            : 'You haven\u2019t backed up your config.'}
        </div>
        <button
          onClick={handleBackup}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {busy ? 'Downloading\u2026' : 'Backup Now'}
        </button>
        <button
          onClick={handleDismiss}
          className="text-neutral-500 hover:text-neutral-300 transition-colors p-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
