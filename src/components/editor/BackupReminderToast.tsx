'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { editorFetch } from '@/lib/editor-fetch';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import { X, Download } from 'lucide-react';

/** Where "See why" and "Set it up" go: the automatic backups block in Settings. */
const AUTO_BACKUP_SETTINGS = settingsPath({ kind: 'defaults', page: 'data' }, { highlight: 'data.autoBackup' });

export default function BackupReminderToast() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const reminderSettings = useEditorStore((s) => s.config?.settings?.backupReminder);
  const autoBackupEnabled = useEditorStore((s) => s.config?.settings?.autoBackup?.enabled === true);
  const timezone = useEditorHouseholdTimezone();
  const { shouldShow, daysSinceBackup, busy, iconsLeftOut, picturesLeftOut, autoFailed, autoLocalOnly, handleBackup, handleDismiss } = useBackupReminder({
    enabled: reminderSettings?.enabled ?? false,
    intervalDays: reminderSettings?.intervalDays ?? 7,
    fetchFn: editorFetch,
    pollIntervalMs: 3_600_000,
    timezone,
    autoBackupEnabled,
  });

  if (!shouldShow) return null;

  // Automatic backups: the fix is in Settings, not a download.
  const autoMessage = autoFailed === 'backup'
    ? t('backupReminder.autoFailed')
    : autoFailed === 'offsite'
    ? t('backupReminder.autoNotSent')
    : autoLocalOnly
    ? t('backupReminder.autoOnlyHere')
    : null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-[toast-slide-up_0.3s_ease-out]">
      <style>{`
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-hs-panel/95 backdrop-blur-sm px-4 py-3 shadow-lg shadow-black/30">
        <div className="text-hs-warning text-sm" data-testid="backup-reminder-message">
          {autoMessage
            ?? (iconsLeftOut
            ? tCore('customIcons.backup.leftOut')
            : picturesLeftOut
            ? tCore('pictureBackup.leftOut')
            : t('backupReminder.message', { count: daysSinceBackup ?? 0 }))}
        </div>
        {autoMessage ? (
          <a
            href={AUTO_BACKUP_SETTINGS}
            onClick={handleDismiss}
            className="rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors"
          >
            {autoLocalOnly ? t('backupReminder.setItUp') : t('backupReminder.seeWhy')}
          </a>
        ) : (
          <button
            onClick={handleBackup}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {busy ? t('backupReminder.downloading') : t('backupReminder.backupNow')}
          </button>
        )}
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
