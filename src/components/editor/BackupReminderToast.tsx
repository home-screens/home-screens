'use client';

import { useEditorStore } from '@/stores/editor-store';
import { editorFetch } from '@/lib/editor-fetch';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { useTranslate } from '@/i18n';
import { X, Download } from 'lucide-react';

export default function BackupReminderToast() {
  const t = useTranslate('editor');
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
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-hs-panel/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/30">
        <div className="text-hs-warning text-sm">
          {t('backupReminder.message', { count: daysSinceBackup ?? 0 })}
        </div>
        <button
          onClick={handleBackup}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {busy ? t('backupReminder.downloading') : t('backupReminder.backupNow')}
        </button>
        <button
          onClick={handleDismiss}
          className="text-hs-text-faint hover:text-hs-text-secondary transition-colors p-0.5"
          aria-label={t('backupReminder.dismiss')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
