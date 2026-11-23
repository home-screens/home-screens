'use client';

import { X } from 'lucide-react';
import { useTranslate } from '@/i18n';
import IconButton from './IconButton';
import type { BackupReminderKind } from '@/lib/backup-reminder';

interface BackupReminderBannerProps {
  /** Which message is up (`backupReminderKind`), or null for none. */
  kind: BackupReminderKind | null;
  daysSinceBackup: number | null;
  busy: boolean;
  onBackup: () => void;
  onDismiss: () => void;
}

export default function BackupReminderBanner({
  kind,
  daysSinceBackup,
  busy,
  onBackup,
  onDismiss,
}: BackupReminderBannerProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  if (!kind) return null;

  // Pluralize via discrete keys so each locale picks the form it needs
  // (English: 1 day / 2 days; German: 1 Tag / 2 Tagen). `daysSinceBackup`
  // can be null when shouldShow guards against missing data — in practice
  // the parent only renders when it has a real count, so default to 0
  // for the rare null case.
  const days = daysSinceBackup ?? 0;
  // Automatic backups that stopped working are fixed in the editor, where
  // they are set up, so the banner says where to look and offers no button
  // to a place the phone cannot go.
  const autoFailed = kind === 'autoFailed' || kind === 'autoNotSent';
  const message = kind === 'autoFailed'
    ? t('backupReminder.autoFailed')
    : kind === 'autoNotSent'
    ? t('backupReminder.autoNotSent')
    : kind === 'iconsLeftOut'
    ? tCore('customIcons.backup.leftOut')
    : kind === 'picturesLeftOut'
    ? tCore('pictureBackup.leftOut')
    // `overdue`, and `autoLocalOnly` too: with automatic backups on but no
    // copy off the hub, the editor points at the storage folder to set up.
    // The phone cannot do that, but its Back up button downloads a copy,
    // which is a copy off the hub, so it keeps the plain "N days ago".
    : days === 1
    ? t('backupReminder.daysAgoSingular', { n: days })
    : t('backupReminder.daysAgoPlural', { n: days });

  return (
    <div className="mx-4 mt-2 rounded-xl border border-hs-warning/20 bg-hs-warning/[0.06] px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-hs-warning-ink" data-testid="backup-reminder-banner">{message}</div>
      </div>
      {!autoFailed && (
        <button
          onClick={onBackup}
          disabled={busy}
          className="press-btn shrink-0 min-h-[44px] -my-2 rounded-lg bg-hs-warning text-hs-on-warning text-xs font-medium px-3 disabled:opacity-50"
        >
          {busy ? tCore('status.saving') : t('backupReminder.backupButton')}
        </button>
      )}
      {/* A full-size target; the negative margin keeps the banner its height. */}
      <IconButton label={t('backupReminder.dismissAriaLabel')} onClick={onDismiss} style={{ margin: '-10px -12px -10px -6px', color: 'var(--hs-text-faint)' }}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
