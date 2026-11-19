/**
 * The record automatic backups keep between runs (see
 * `auto-backup-policy.ts`). Runtime state: it names no family member and is
 * not part of a backup, so it stays out of the data transaction. Read by
 * `GET /api/backup/auto` and the reminder, and copied into the diagnostics
 * bundle.
 */
import { createJsonStore } from './json-store';

/** Why a backup was not saved. Each maps to one sentence in Settings. */
export type AutoBackupErrorCode = 'no-room' | 'failed';

/**
 * Why a copy did not reach the storage folder. The last three only come
 * from a network share: a share name the storage does not have, a name that
 * may not save files in the share, and a storage that only speaks SMB 1.
 */
export type OffsiteErrorCode =
  | 'sign-in'
  | 'not-found'
  | 'no-room'
  | 'too-big'
  | 'unreachable'
  | 'timeout'
  | 'redirect'
  | 'certificate'
  | 'refused'
  | 'share-not-found'
  | 'no-write'
  | 'too-old';

export interface RunError<C extends string> {
  code: C;
  /** The raw reason, for the diagnostics bundle and the log. Never shown as is. */
  detail?: string;
}

/** What one send, removal or check came back with, for either kind of storage folder. */
export type OffsiteOutcome = { ok: true } | ({ ok: false } & RunError<OffsiteErrorCode>);

/** Why the keys were left out of the last backup. */
export type KeysLeftOutReason = 'no-backup-password' | 'no-editor-password';

export interface AutoBackupState {
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  /** Set when the last attempt failed; cleared by the next good one. */
  lastError: RunError<AutoBackupErrorCode> | null;
  /** The file the last good run wrote. */
  lastFile: string | null;
  /** Failed tries on one day since the last good backup (see `nextBackupAt`). */
  failedTries: { day: string; count: number } | null;
  keysLeftOut: KeysLeftOutReason | null;
  /** The pictures did not fit: what they needed and what the hub had free. */
  picturesLeftOut: { neededBytes: number; freeBytes: number } | null;
  offsite: {
    lastAttemptAt: string | null;
    lastOkAt: string | null;
    lastError: RunError<OffsiteErrorCode> | null;
    /** A copy still to send. The scheduler tries again every hour. */
    pendingFile: string | null;
    /** What this hub has sent and not yet removed there, newest first, for the folder's own keep-the-last. */
    remoteFiles: string[];
    /**
     * Goes up each time the storage folder moves somewhere else (see
     * `startOffsiteRecord`). A send writes its result only while the number is
     * the one it started with, so a send to the old folder that finishes after
     * the change cannot claim the new folder received it.
     */
    revision: number;
  };
  /** The last time the private download link fetched a backup. */
  lastPulledAt: string | null;
  /** The schedule as last seen, and when it last changed (see `BackupTiming.changedAt`). */
  schedule: { signature: string; changedAt: string } | null;
}

export const EMPTY_AUTO_BACKUP_STATE: AutoBackupState = {
  lastAttemptAt: null,
  lastOkAt: null,
  lastError: null,
  lastFile: null,
  failedTries: null,
  keysLeftOut: null,
  picturesLeftOut: null,
  offsite: { lastAttemptAt: null, lastOkAt: null, lastError: null, pendingFile: null, remoteFiles: [], revision: 0 },
  lastPulledAt: null,
  schedule: null,
};

const store = createJsonStore<Partial<AutoBackupState> | null>({
  path: 'data/auto-backup-state.json',
  defaultValue: null,
  transient: true,
});

/** The saved record merged over the empty one, so a field added later reads as its default. */
function normalize(raw: Partial<AutoBackupState> | null): AutoBackupState {
  const value = raw && typeof raw === 'object' ? raw : {};
  const offsite: Partial<AutoBackupState['offsite']> = value.offsite && typeof value.offsite === 'object' ? value.offsite : {};
  return {
    ...structuredClone(EMPTY_AUTO_BACKUP_STATE),
    ...value,
    offsite: {
      ...structuredClone(EMPTY_AUTO_BACKUP_STATE.offsite),
      ...offsite,
      remoteFiles: Array.isArray(offsite.remoteFiles) ? offsite.remoteFiles.filter((f: unknown): f is string => typeof f === 'string') : [],
      revision: Number.isInteger(offsite.revision) && (offsite.revision as number) >= 0 ? (offsite.revision as number) : 0,
    },
  };
}

export async function readAutoBackupState(): Promise<AutoBackupState> {
  return normalize(await store.read());
}

/** Change the record in one queued read-modify-write. */
export async function updateAutoBackupState(mutate: (current: AutoBackupState) => AutoBackupState): Promise<AutoBackupState> {
  const next = await store.updateAtomic((current) => mutate(normalize(current)));
  return normalize(next);
}

/**
 * A new storage folder starts a clean record: the old folder's files are not
 * there to remove, its last failure is not this folder's, and a send still
 * running against the old one is told apart by the new revision.
 */
export async function startOffsiteRecord(): Promise<AutoBackupState> {
  return updateAutoBackupState((current) => ({
    ...current,
    offsite: { ...structuredClone(EMPTY_AUTO_BACKUP_STATE.offsite), revision: current.offsite.revision + 1 },
  }));
}
