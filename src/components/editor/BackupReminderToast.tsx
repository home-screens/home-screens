'use client';

import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { X, Download } from 'lucide-react';

export default function BackupReminderToast() {
  const reminderSettings = useEditorStore((s) => s.config?.settings?.backupReminder);
  const { shouldShow, daysSinceBackup, busy, handleBackup, handleDismiss } = useBackupReminder({
    enabled: reminderSettings?.enabled ?? false,
    intervalDays: reminderSettings?.intervalDays ?? 7,
    fetchFn: editorFetch,
    pollIntervalMs: 3_600_000,
  });

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
          You haven&#x2019;t backed up in {daysSinceBackup} day{daysSinceBackup === 1 ? '' : 's'}.
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
