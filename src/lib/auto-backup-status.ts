/**
 * The status `GET /api/backup/auto` answers and `POST` answers after a run:
 * the record, the copies on disk, and what is set up, with no secret in it.
 */
import { readConfig } from './config';
import { isAuthEnabled } from './auth';
import { wallClockMinutes, wallDateKey } from './auto-update-policy';
import { resolveAutoBackupSettings, wallMoment } from './auto-backup-policy';
import { readAutoBackupState } from './auto-backup-state';
import { readAutoBackupSecrets } from './auto-backup-secrets';
import { destinationSummary } from './storage-destination';
import { listAutoBackups } from './auto-backup-files';
import { isAutoBackupRunning } from './auto-backup-run';
import { isAutoBackupSchedulerRunning, nextRunWall } from './auto-backup-scheduler';
import type { AutoBackupStatus } from './auto-backup-types';

export async function readAutoBackupStatus(now: Date = new Date()): Promise<AutoBackupStatus> {
  const [config, state, secrets, copies, editorPasswordSet] = await Promise.all([
    readConfig(),
    readAutoBackupState(),
    readAutoBackupSecrets(),
    listAutoBackups(),
    isAuthEnabled(),
  ]);
  const timezone = config.settings?.timezone;
  const settings = resolveAutoBackupSettings(config.settings?.autoBackup);
  const wallNow = wallClockMinutes(now, timezone);
  // No promise of a next backup from a process that will not make one (a
  // development server, an E2E run).
  const next = isAutoBackupSchedulerRunning() ? nextRunWall(settings, state, timezone, now) : null;
  return {
    lastAttemptAt: state.lastAttemptAt,
    lastOkAt: state.lastOkAt,
    lastError: state.lastError?.code ?? null,
    keysLeftOut: state.keysLeftOut,
    picturesLeftOut: state.picturesLeftOut,
    offsite: {
      lastAttemptAt: state.offsite.lastAttemptAt,
      lastOkAt: state.offsite.lastOkAt,
      lastError: state.offsite.lastError?.code ?? null,
      pending: !!state.offsite.pendingFile,
    },
    lastPulledAt: state.lastPulledAt,
    nextRun: next === null ? null : wallMoment(Math.max(next, wallNow)),
    today: wallDateKey(wallNow),
    copies,
    hasBackupPassword: !!secrets.backupPassword,
    destination: secrets.destination ? destinationSummary(secrets.destination) : null,
    hasLink: !!secrets.linkToken,
    editorPasswordSet,
    running: isAutoBackupRunning(),
  };
}
