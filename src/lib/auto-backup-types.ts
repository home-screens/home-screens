/**
 * What `GET /api/backup/auto` answers, typed with no server imports so the
 * editor can read it.
 */
import type { AutoBackupErrorCode, KeysLeftOutReason, OffsiteErrorCode } from './auto-backup-state';
import type { DestinationSummary } from './storage-destination';

export type { AutoBackupErrorCode, KeysLeftOutReason, OffsiteErrorCode } from './auto-backup-state';
export type { DestinationSummary } from './storage-destination';

export interface AutoBackupCopyInfo {
  name: string;
  bytes: number;
  /** ISO. */
  savedAt: string;
  withKeys: boolean;
  withPictures: boolean;
}

export interface AutoBackupStatus {
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  lastError: AutoBackupErrorCode | null;
  keysLeftOut: KeysLeftOutReason | null;
  picturesLeftOut: { neededBytes: number; freeBytes: number } | null;
  offsite: {
    lastAttemptAt: string | null;
    lastOkAt: string | null;
    lastError: OffsiteErrorCode | null;
    /** A copy is waiting to be sent again. */
    pending: boolean;
  };
  lastPulledAt: string | null;
  /** When the next backup (or the next try after a failure) is, on the household's clock. Null when off or nothing is scheduled in this process. */
  nextRun: { date: string; time: string } | null;
  /** Today on the household's clock, `YYYY-MM-DD`. */
  today: string;
  copies: AutoBackupCopyInfo[];
  hasBackupPassword: boolean;
  /** Where backups are sent, without the password. */
  destination: DestinationSummary | null;
  hasLink: boolean;
  editorPasswordSet: boolean;
  /** A backup is being saved right now. */
  running: boolean;
}

/** What a copy holds, for the restore prompts. Same fields `POST /api/backup/upload` answers. */
export interface BackupContentsSummary {
  hasCredentials: boolean;
  credentialsEncrypted: boolean;
  hasCustomIcons: boolean;
  usesCustomIcons: boolean;
  pictures: { count: number; bytes: number; skipped: number };
}
