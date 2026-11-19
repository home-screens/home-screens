import { describe, it, expect, beforeEach, vi } from 'vitest';

const run = vi.hoisted(() => ({ runAutoBackup: vi.fn(), retryPendingUpload: vi.fn() }));
vi.mock('../auto-backup-run', () => run);

import { autoBackupTick, nextRunWall, __resetAutoBackupSchedulerForTests } from '../auto-backup-scheduler';
import { readAutoBackupState, updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '../auto-backup-state';
import { resolveAutoBackupSettings, wallMoment } from '../auto-backup-policy';
import { writeConfig } from '../config';
import { invalidateConfigReadCache } from '../config-cache';
import { getLatestSchemaVersion } from '../migrations';
import type { AutoBackupSettings, ScreenConfiguration } from '@/types/config';

const ZONE = 'America/Chicago';

async function configure(autoBackup: AutoBackupSettings): Promise<void> {
  await writeConfig({
    version: getLatestSchemaVersion(),
    screens: [{ id: 's1', name: 'Screen 1', modules: [] }],
    settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920, timezone: ZONE, autoBackup },
  } as unknown as ScreenConfiguration);
  invalidateConfigReadCache();
}

beforeEach(async () => {
  __resetAutoBackupSchedulerForTests();
  run.runAutoBackup.mockReset().mockResolvedValue({ ran: true, ok: true });
  run.retryPendingUpload.mockReset().mockResolvedValue(undefined);
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
});

describe('autoBackupTick', () => {
  it('does nothing but look for a pending upload while backups are off', async () => {
    await configure({ enabled: false });
    await autoBackupTick(new Date('2026-11-16T09:00:00Z'));
    expect(run.runAutoBackup).not.toHaveBeenCalled();
    expect(run.retryPendingUpload).toHaveBeenCalledTimes(1);
  });

  it('waits for the chosen time after being switched on, then backs up once', async () => {
    await configure({ enabled: true, time: '03:00' });
    // 7:42 PM at home: switched on just now.
    await autoBackupTick(new Date('2026-11-17T01:42:00Z'));
    expect(run.runAutoBackup).not.toHaveBeenCalled();
    expect((await readAutoBackupState()).schedule?.changedAt).toBe('2026-11-17T01:42:00.000Z');
    // 2:59 AM: not yet.
    await autoBackupTick(new Date('2026-11-17T08:59:00Z'));
    expect(run.runAutoBackup).not.toHaveBeenCalled();
    // 3:00 AM: owed.
    await autoBackupTick(new Date('2026-11-17T09:00:00Z'));
    expect(run.runAutoBackup).toHaveBeenCalledWith({ reason: 'schedule', now: new Date('2026-11-17T09:00:00Z') });
  });

  it('keeps the moment of the last change across ticks, so the count is not restarted every minute', async () => {
    await configure({ enabled: true, time: '03:00' });
    await autoBackupTick(new Date('2026-11-17T01:42:00Z'));
    await autoBackupTick(new Date('2026-11-17T01:43:00Z'));
    expect((await readAutoBackupState()).schedule?.changedAt).toBe('2026-11-17T01:42:00.000Z');
  });
});

describe('nextRunWall', () => {
  it('counts a save the scheduler has not seen yet', async () => {
    const settings = resolveAutoBackupSettings({ enabled: true, every: 'week', time: '03:00' });
    const state = { ...structuredClone(EMPTY_AUTO_BACKUP_STATE), lastOkAt: '2026-11-08T09:00:00.000Z', lastAttemptAt: '2026-11-08T09:00:00.000Z' };
    // Weekly from Nov 8 would be Nov 15, already past; the change at 7:42 PM on Nov 16 moves it to the next 3:00.
    const next = nextRunWall(settings, state, ZONE, new Date('2026-11-17T01:42:00Z'));
    expect(wallMoment(next!)).toEqual({ date: '2026-11-17', time: '03:00' });
  });
});
