import type { BackupReminderSettings } from '@/types/config';

/**
 * The backup reminder's rules that the editor's toast and the phone's banner
 * share, with no server imports: what an unset reminder means, and which of
 * its messages is up. Each surface keeps its own words and buttons.
 */

/** A household that never touched the reminder: off, and weekly once switched on. */
export const BACKUP_REMINDER_DEFAULTS: BackupReminderSettings = { enabled: false, intervalDays: 7 };

/** The saved reminder with the defaults filled in. */
export function resolveBackupReminder(saved: Partial<BackupReminderSettings> | undefined): BackupReminderSettings {
  return {
    enabled: saved?.enabled ?? BACKUP_REMINDER_DEFAULTS.enabled,
    intervalDays: saved?.intervalDays ?? BACKUP_REMINDER_DEFAULTS.intervalDays,
  };
}

/**
 * Which message the reminder is showing, most pressing first:
 * - `autoFailed`: the automatic backup itself stopped working.
 * - `autoNotSent`: it was made but could not be sent on.
 * - `iconsLeftOut` / `picturesLeftOut`: the backup just downloaded went
 *   without the family's icons, or without the library pictures.
 * - `autoLocalOnly`: automatic backups are on, but no copy has left the hub
 *   in time.
 * - `overdue`: it has simply been too long.
 */
export type BackupReminderKind = 'autoFailed' | 'autoNotSent' | 'iconsLeftOut' | 'picturesLeftOut' | 'autoLocalOnly' | 'overdue';

export function backupReminderKind(state: {
  shouldShow: boolean;
  autoFailed: 'backup' | 'offsite' | null;
  iconsLeftOut: boolean;
  picturesLeftOut: boolean;
  /** Automatic backups are switched on and answering. */
  autoOn: boolean;
}): BackupReminderKind | null {
  if (!state.shouldShow) return null;
  if (state.autoFailed === 'backup') return 'autoFailed';
  if (state.autoFailed === 'offsite') return 'autoNotSent';
  if (state.iconsLeftOut) return 'iconsLeftOut';
  if (state.picturesLeftOut) return 'picturesLeftOut';
  return state.autoOn ? 'autoLocalOnly' : 'overdue';
}
