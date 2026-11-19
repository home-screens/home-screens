/**
 * What automatic backups add to the backup reminder, with no server
 * imports so the hook that reads it can share the type.
 *
 * A copy kept on the hub does not survive the hub's memory card, so only a
 * copy that has left it (sent to the storage folder, or fetched through the
 * download link) quiets the "time to back up" reminder.
 */
export interface AutoBackupReminder {
  enabled: boolean;
  /** What stopped working: the backup itself, or sending it on. */
  failed: 'backup' | 'offsite' | null;
  /** When that failure happened, ISO, so a dismissal before it does not hide it. */
  failedAt: string | null;
  /** The last time a copy left the hub, ISO. */
  offsiteAt: string | null;
}

interface StateLike {
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  lastError: unknown;
  lastPulledAt: string | null;
  offsite: { lastAttemptAt: string | null; lastOkAt: string | null; lastError: unknown; pendingFile: string | null };
}

function latest(...dates: (string | null)[]): string | null {
  return dates.filter((d): d is string => !!d).sort().pop() ?? null;
}

export function autoBackupReminder(enabled: boolean, state: StateLike): AutoBackupReminder {
  const offsiteAt = latest(state.offsite.lastOkAt, state.lastPulledAt);
  if (!enabled) return { enabled: false, failed: null, failedAt: null, offsiteAt };
  if (state.lastError && state.lastAttemptAt) {
    return { enabled, failed: 'backup', failedAt: state.lastAttemptAt, offsiteAt };
  }
  if (state.offsite.lastError && state.offsite.pendingFile && state.offsite.lastAttemptAt) {
    return { enabled, failed: 'offsite', failedAt: state.offsite.lastAttemptAt, offsiteAt };
  }
  return { enabled, failed: null, failedAt: null, offsiteAt };
}
