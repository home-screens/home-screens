'use client';

import { useEditorStore } from '@/stores/editor-store';
import { useEditorHouseholdTimezone } from '@/components/editor/useEditorHouseholdClock';
import { editorFetch } from '@/lib/editor-fetch';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { resolveBackupReminder } from '@/lib/backup-reminder';
import { useTranslate } from '@/i18n';
import { settingsPath } from '@/lib/settings-route';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import Toast from '@/components/ui/Toast';

/** Where "See why" and "Set it up" go: the automatic backups block in Settings. */
const AUTO_BACKUP_SETTINGS = settingsPath({ kind: 'defaults', page: 'data' }, { highlight: 'data.autoBackup' });

export default function BackupReminderToast() {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const router = useRouter();
  const reminderSettings = useEditorStore((s) => s.config?.settings?.backupReminder);
  const autoBackupEnabled = useEditorStore((s) => s.config?.settings?.autoBackup?.enabled === true);
  const timezone = useEditorHouseholdTimezone();
  const { kind, daysSinceBackup, busy, handleBackup, handleDismiss } = useBackupReminder({
    ...resolveBackupReminder(reminderSettings),
    fetchFn: editorFetch,
    pollIntervalMs: 3_600_000,
    timezone,
    autoBackupEnabled,
  });

  if (!kind) return null;

  // Automatic backups: the fix is in Settings, not a download.
  const autoMessage = kind === 'autoFailed'
    ? t('backupReminder.autoFailed')
    : kind === 'autoNotSent'
    ? t('backupReminder.autoNotSent')
    : kind === 'autoLocalOnly'
    ? t('backupReminder.autoOnlyHere')
    : null;

  const message = autoMessage
    ?? (kind === 'iconsLeftOut'
    ? tCore('customIcons.backup.leftOut')
    : kind === 'picturesLeftOut'
    ? tCore('pictureBackup.leftOut')
    : t('backupReminder.message', { count: daysSinceBackup ?? 0 }));

  return (
    <Toast
      tone="warning"
      message={message}
      messageTestId="backup-reminder-message"
      action={autoMessage
        ? {
          label: kind === 'autoLocalOnly' ? t('backupReminder.setItUp') : t('backupReminder.seeWhy'),
          onClick: () => { handleDismiss(); router.push(AUTO_BACKUP_SETTINGS); },
        }
        : {
          label: busy ? t('backupReminder.downloading') : t('settings.dataPage.autoBackup.backUpNow'),
          icon: Download,
          onClick: handleBackup,
          disabled: busy,
        }}
      onDismiss={handleDismiss}
      dismissLabel={t('backupReminder.dismiss')}
    />
  );
}
