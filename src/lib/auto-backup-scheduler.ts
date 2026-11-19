/**
 * Looks at the clock once a minute and saves an automatic backup when one is
 * owed (see `auto-backup-policy.ts`), and sends a copy that failed to reach
 * the storage folder again an hour later. Same shape as the automatic update
 * scheduler: state on `globalThis`, production servers only, and a kill
 * switch (`HS_DISABLE_AUTO_BACKUP=1`) the E2E servers set, so tests drive
 * runs through "Back up now" instead.
 */
import { readConfigCached } from './config-cache';
import { logger } from './logger';
import { wallClockMinutes } from './auto-update-policy';
import {
  backupDue,
  isoToWall,
  nextBackupAt,
  resolveAutoBackupSettings,
  scheduleSignature,
  type ResolvedAutoBackup,
} from './auto-backup-policy';
import { readAutoBackupState, updateAutoBackupState, type AutoBackupState } from './auto-backup-state';
import { retryPendingUpload, runAutoBackup } from './auto-backup-run';
import { sweepPartialBackups } from './auto-backup-files';

const log = logger('auto-backup');

const TICK_MS = 60_000;

interface SchedulerState {
  started: boolean;
  busy: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

const stateKey = Symbol.for('home-screens.auto-backup-scheduler.v1');
const globals = globalThis as typeof globalThis & { [stateKey]?: SchedulerState };
const scheduler: SchedulerState = globals[stateKey] ??= { started: false, busy: false, timer: null };

function schedulerAllowed(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.HS_DISABLE_AUTO_BACKUP !== '1';
}

export function isAutoBackupSchedulerRunning(): boolean {
  return scheduler.started;
}

/** Called once from the boot hook. Safe to call again; only the first call starts anything. */
export function startAutoBackupScheduler(): void {
  if (scheduler.started || !schedulerAllowed()) return;
  scheduler.started = true;
  void sweepPartialBackups().catch(() => {}).finally(() => {
    scheduler.timer = setInterval(() => { void autoBackupTick(); }, TICK_MS);
    scheduler.timer.unref?.();
    void autoBackupTick();
  });
}

/** Test seam: stop the timer and forget everything. */
export function __resetAutoBackupSchedulerForTests(): void {
  if (scheduler.timer) clearInterval(scheduler.timer);
  Object.assign(scheduler, { started: false, busy: false, timer: null } satisfies SchedulerState);
}

/**
 * The schedule record once `signature` is the current setting: unchanged
 * when it matches, restarted at `now` when the setting changed. A save the
 * scheduler has not ticked over yet already counts, so Settings never
 * promises the slot that was just switched past.
 */
export function scheduleAfter(previous: AutoBackupState['schedule'], signature: string, now: Date): NonNullable<AutoBackupState['schedule']> {
  if (previous && previous.signature === signature) return previous;
  return { signature, changedAt: now.toISOString() };
}

/** When the next backup is owed, as wall minutes, or null when backups are off. */
export function nextRunWall(
  settings: ResolvedAutoBackup,
  state: AutoBackupState,
  timezone: string | undefined,
  now: Date,
): number | null {
  const schedule = scheduleAfter(state.schedule, scheduleSignature(settings, timezone), now);
  return nextBackupAt({
    wallNow: wallClockMinutes(now, timezone),
    settings,
    lastOkAt: isoToWall(state.lastOkAt, timezone),
    lastAttemptAt: isoToWall(state.lastAttemptAt, timezone),
    failedTries: state.failedTries,
    changedAt: isoToWall(schedule.changedAt, timezone),
  });
}

/** One look at the clock. Exported for tests; the interval is the only other caller. */
export async function autoBackupTick(now: Date = new Date()): Promise<void> {
  if (scheduler.busy) return;
  scheduler.busy = true;
  try {
    const config = await readConfigCached();
    const settings = resolveAutoBackupSettings(config.settings?.autoBackup);
    const timezone = config.settings?.timezone;
    const signature = scheduleSignature(settings, timezone);
    let state = await readAutoBackupState();
    if (state.schedule?.signature !== signature) {
      state = await updateAutoBackupState((current) => ({ ...current, schedule: scheduleAfter(current.schedule, signature, now) }));
    }
    if (settings.enabled) {
      const timing = {
        wallNow: wallClockMinutes(now, timezone),
        settings,
        lastOkAt: isoToWall(state.lastOkAt, timezone),
        lastAttemptAt: isoToWall(state.lastAttemptAt, timezone),
        failedTries: state.failedTries,
        changedAt: isoToWall(state.schedule?.changedAt, timezone),
      };
      if (backupDue(timing)) {
        await runAutoBackup({ reason: 'schedule', now });
        return;
      }
    }
    await retryPendingUpload(now);
  } catch (err) {
    log.warn('Automatic backup check failed:', err);
  } finally {
    scheduler.busy = false;
  }
}
