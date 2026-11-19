import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  isAuthEnabled: vi.fn(),
  isUpgradeRunning: vi.fn(),
  freeBytes: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  breakArchive: { value: false },
}));

vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  isAuthEnabled: mocks.isAuthEnabled,
}));
vi.mock('@/lib/upgrade', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/upgrade')>()),
  isUpgradeRunning: mocks.isUpgradeRunning,
}));
vi.mock('@/lib/auto-backup-files', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auto-backup-files')>()),
  autoBackupFreeBytes: mocks.freeBytes,
}));
vi.mock('@/lib/offsite-send', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/offsite-send')>()),
  sendToDestination: mocks.uploadFile,
  removeFromDestination: mocks.deleteFile,
}));
// A zip that breaks halfway through, to prove a half-written copy never stays.
vi.mock('@/lib/backup-archive', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/backup-archive')>();
  return {
    ...actual,
    composeBackupArchive: (bundle: unknown, pictures: readonly { path: string }[]) => {
      if (!mocks.breakArchive.value) return actual.composeBackupArchive(bundle, pictures);
      return new Readable({
        read() {
          this.push(Buffer.from('PK partial bytes'));
          this.destroy(new Error('disk went away'));
        },
      });
    },
  };
});

import { JSON_FREE_SPACE_MARGIN, isAutoBackupRunning, retryPendingUpload, runAutoBackup } from '../auto-backup-run';
import { RESTORE_FREE_SPACE_MARGIN } from '../backup-pictures';
import { readAutoBackupState, startOffsiteRecord, updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '../auto-backup-state';
import { autoBackupSecretsStore, updateAutoBackupSecrets } from '../auto-backup-secrets';
import { autoBackupRoot, listAutoBackups } from '../auto-backup-files';
import { readConfig, writeConfig } from '../config';
import { decryptCredentials } from '../backup-crypto';
import { inspectRestoreArchive } from '../backup-archive';
import { getLatestSchemaVersion } from '../migrations';
import type { AutoBackupSettings, ScreenConfiguration } from '@/types/config';

const GB = 1024 ** 3;

async function configure(autoBackup: Partial<AutoBackupSettings>): Promise<void> {
  const config: ScreenConfiguration = {
    version: getLatestSchemaVersion(),
    screens: [{ id: 's1', name: 'Screen 1', modules: [], backgroundImage: '/backgrounds/beach.jpg' }],
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      timezone: 'America/Chicago',
      autoBackup: { enabled: true, ...autoBackup },
    },
  } as unknown as ScreenConfiguration;
  await writeConfig(config);
}

async function readCopy(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(path.join(autoBackupRoot(), name), 'utf8'));
}

async function folderNames(): Promise<string[]> {
  try {
    return (await fs.readdir(autoBackupRoot())).sort();
  } catch {
    return [];
  }
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.isAuthEnabled.mockResolvedValue(false);
  mocks.isUpgradeRunning.mockReturnValue(false);
  mocks.freeBytes.mockResolvedValue(10 * GB);
  mocks.uploadFile.mockResolvedValue({ ok: true });
  mocks.deleteFile.mockResolvedValue({ ok: true });
  mocks.breakArchive.value = false;
  await fs.rm(autoBackupRoot(), { recursive: true, force: true });
  await fs.rm(path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg'), { force: true });
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
  await autoBackupSecretsStore.write({});
  await configure({});
});

describe('runAutoBackup', () => {
  it('writes a whole JSON copy named on the household clock and records it', async () => {
    const outcome = await runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: true });
    expect(await folderNames()).toEqual(['home-screens-auto-backup-2026-11-16-0300.json']);
    const bundle = await readCopy('home-screens-auto-backup-2026-11-16-0300.json');
    expect(bundle._type).toBe('home-screens-backup');
    expect((bundle.config as ScreenConfiguration).screens[0].id).toBe('s1');
    expect(bundle.credentials).toBeUndefined();
    const state = await readAutoBackupState();
    expect(state).toMatchObject({
      lastOkAt: '2026-11-16T09:00:00.000Z',
      lastAttemptAt: '2026-11-16T09:00:00.000Z',
      lastError: null,
      lastFile: 'home-screens-auto-backup-2026-11-16-0300.json',
      keysLeftOut: null,
    });
  });

  it('leaves the keys out, and says why, while there is no editor password', async () => {
    await configure({ includeKeys: true });
    await updateAutoBackupSecrets(() => ({ backupPassword: 'correct horse' }));
    await runAutoBackup({ reason: 'schedule' });
    const [name] = await folderNames();
    expect(name).not.toContain('with-keys');
    expect((await readCopy(name)).credentials).toBeUndefined();
    expect((await readAutoBackupState()).keysLeftOut).toBe('no-editor-password');
  });

  it('leaves the keys out, and says why, until a backup password is chosen', async () => {
    mocks.isAuthEnabled.mockResolvedValue(true);
    await configure({ includeKeys: true });
    await runAutoBackup({ reason: 'schedule' });
    expect((await readAutoBackupState()).keysLeftOut).toBe('no-backup-password');
    expect((await readCopy((await folderNames())[0])).credentials).toBeUndefined();
  });

  it('locks the keys with the saved password, never plain', async () => {
    mocks.isAuthEnabled.mockResolvedValue(true);
    await configure({ includeKeys: true });
    await updateAutoBackupSecrets(() => ({ backupPassword: 'correct horse', destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' } }));
    mocks.uploadFile.mockResolvedValue({ ok: true });
    await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    const [name] = await folderNames();
    expect(name).toBe('home-screens-auto-backup-with-keys-2026-11-16-0300.json');
    const bundle = await readCopy(name);
    expect((bundle.credentials as { encrypted: boolean }).encrypted).toBe(true);
    const payload = await decryptCredentials(bundle.credentials as never, 'correct horse');
    // The folder travels in the keys, so a restored hub keeps sending.
    expect(payload.autoBackup).toEqual({ backupPassword: 'correct horse', destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' } });
    expect(JSON.stringify(bundle)).not.toContain('nas-pass');
    expect((await readAutoBackupState()).keysLeftOut).toBeNull();
  });

  it('carries the pictures in a zip when there is room', async () => {
    await fs.writeFile(path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg'), Buffer.alloc(2048, 7));
    await configure({ pictures: 'used' });
    await runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T09:00:00Z') });
    const [name] = await folderNames();
    expect(name).toBe('home-screens-auto-backup-2026-11-16-0300.zip');
    const inspected = await inspectRestoreArchive(path.join(autoBackupRoot(), name), 100 * 1024 * 1024);
    expect(inspected?.pictures.map((p) => p.libraryPath)).toEqual(['beach.jpg']);
    expect((await readAutoBackupState()).picturesLeftOut).toBeNull();
  });

  it('saves without the pictures, and says how much room they needed, when they do not fit', async () => {
    await fs.writeFile(path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg'), Buffer.alloc(2048, 7));
    await configure({ pictures: 'all' });
    mocks.freeBytes.mockResolvedValue(64 * 1024 * 1024);
    const outcome = await runAutoBackup({ reason: 'schedule' });
    expect(outcome).toMatchObject({ ran: true, ok: true });
    const [name] = await folderNames();
    expect(name.endsWith('.json')).toBe(true);
    const { picturesLeftOut } = await readAutoBackupState();
    expect(picturesLeftOut?.freeBytes).toBe(64 * 1024 * 1024);
    expect(picturesLeftOut!.neededBytes).toBeGreaterThan(64 * 1024 * 1024);
  });

  it('fails the run and writes nothing when even the settings do not fit', async () => {
    mocks.freeBytes.mockResolvedValue(1024);
    const outcome = await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: false });
    expect(await folderNames()).toEqual([]);
    expect(await readAutoBackupState()).toMatchObject({
      lastError: { code: 'no-room' },
      lastOkAt: null,
      failedTries: { day: '2026-11-16', count: 1 },
    });
  });

  it('keeps only the newest copies, and removes old ones only once the new one is in place', async () => {
    await configure({ keep: 2 });
    for (const at of ['2026-11-14T09:00:00Z', '2026-11-15T09:00:00Z', '2026-11-16T09:00:00Z']) {
      await runAutoBackup({ reason: 'schedule', now: new Date(at) });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect((await listAutoBackups()).map((c) => c.name)).toEqual([
      'home-screens-auto-backup-2026-11-16-0300.json',
      'home-screens-auto-backup-2026-11-15-0300.json',
    ]);
  });

  it('never leaves a half-written copy, and keeps the old ones, when the write breaks', async () => {
    await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-15T09:00:00Z') });
    await fs.writeFile(path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg'), Buffer.alloc(2048, 7));
    await configure({ pictures: 'used', keep: 1 });
    mocks.breakArchive.value = true;
    const outcome = await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: false });
    expect(await folderNames()).toEqual(['home-screens-auto-backup-2026-11-15-0300.json']);
    expect((await readAutoBackupState()).lastError?.code).toBe('failed');
  });

  it('with "keep the last 1", says there is no room rather than deleting the only backup to make some', async () => {
    await configure({ keep: 1 });
    const old = 'home-screens-auto-backup-2026-11-15-0300.json';
    await fs.mkdir(autoBackupRoot(), { recursive: true });
    await fs.writeFile(path.join(autoBackupRoot(), old), Buffer.alloc(5 * 1024 * 1024, 32));
    // Room for the new copy only if the old one went first.
    mocks.freeBytes.mockResolvedValue(JSON_FREE_SPACE_MARGIN + 1024);
    const outcome = await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: false });
    expect(await folderNames()).toEqual([old]);
    expect((await readAutoBackupState()).lastError?.code).toBe('no-room');
  });

  it('with "keep the last 1", keeps the only backup until a replacement is written, falling back to one without pictures', async () => {
    await configure({ keep: 1, pictures: 'used' });
    await fs.writeFile(path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg'), Buffer.alloc(2048, 7));
    const old = 'home-screens-auto-backup-2026-11-15-0300.zip';
    await fs.mkdir(autoBackupRoot(), { recursive: true });
    await fs.writeFile(path.join(autoBackupRoot(), old), Buffer.alloc(5 * 1024 * 1024, 32));
    // The pictures fit only if the old copy went first, and that zip breaks.
    mocks.freeBytes.mockResolvedValue(RESTORE_FREE_SPACE_MARGIN + 1024);
    mocks.breakArchive.value = true;
    const outcome = await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: true });
    expect(await folderNames()).toEqual(['home-screens-auto-backup-2026-11-16-0300.json']);
    expect((await readAutoBackupState()).picturesLeftOut).not.toBeNull();
  });

  it('does nothing while an update is being installed', async () => {
    mocks.isUpgradeRunning.mockReturnValue(true);
    expect(await runAutoBackup({ reason: 'schedule' })).toEqual({ ran: false, reason: 'updating' });
    expect(await folderNames()).toEqual([]);
  });

  it('runs one backup at a time', async () => {
    const [first, second] = await Promise.all([
      runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T09:00:00Z') }),
      runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T09:00:00Z') }),
    ]);
    expect([first.ran, second.ran].sort()).toEqual([false, true]);
  });
});

describe('sending a copy to the storage folder', () => {
  const folder = { kind: 'smb' as const, host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', password: 'nas-pass' };

  beforeEach(async () => {
    await updateAutoBackupSecrets(() => ({ destination: folder }));
  });

  it('sends each copy and keeps only the newest there too', async () => {
    await configure({ keep: 2 });
    for (const at of ['2026-11-14T09:00:00Z', '2026-11-15T09:00:00Z', '2026-11-16T09:00:00Z']) {
      await runAutoBackup({ reason: 'schedule', now: new Date(at) });
    }
    expect(mocks.uploadFile).toHaveBeenCalledTimes(3);
    expect(mocks.uploadFile.mock.calls[2][2]).toBe('home-screens-auto-backup-2026-11-16-0300.json');
    expect(mocks.deleteFile).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFile).toHaveBeenCalledWith(folder, 'home-screens-auto-backup-2026-11-14-0300.json');
    const { offsite } = await readAutoBackupState();
    expect(offsite).toMatchObject({
      lastOkAt: '2026-11-16T09:00:00.000Z',
      lastError: null,
      pendingFile: null,
      remoteFiles: ['home-screens-auto-backup-2026-11-16-0300.json', 'home-screens-auto-backup-2026-11-15-0300.json'],
    });
  });

  it('keeps the local copy and marks the upload to try again when sending fails', async () => {
    mocks.uploadFile.mockResolvedValue({ ok: false, code: 'sign-in', detail: 'HTTP 401' });
    const outcome = await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    expect(outcome).toMatchObject({ ran: true, ok: true });
    expect(await folderNames()).toHaveLength(1);
    const state = await readAutoBackupState();
    expect(state.lastError).toBeNull();
    expect(state.offsite).toMatchObject({
      lastError: { code: 'sign-in' },
      pendingFile: 'home-screens-auto-backup-2026-11-16-0300.json',
      lastOkAt: null,
    });
  });

  it('sends the newest copy again an hour after a failed upload, not sooner', async () => {
    mocks.uploadFile.mockResolvedValueOnce({ ok: false, code: 'unreachable', detail: 'ECONNREFUSED' });
    await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    await retryPendingUpload(new Date('2026-11-16T09:30:00Z'));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    await retryPendingUpload(new Date('2026-11-16T10:00:00Z'));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect((await readAutoBackupState()).offsite).toMatchObject({ pendingFile: null, lastError: null, lastOkAt: '2026-11-16T10:00:00.000Z' });
  });

  it('drops a send\'s result when the storage folder changed while it was being sent', async () => {
    let finish: (outcome: unknown) => void = () => {};
    mocks.uploadFile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const run = runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T09:00:00Z') });
    await vi.waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(1));
    // What the secrets route does when the folder moves somewhere else.
    await updateAutoBackupSecrets(() => ({ destination: { ...folder, host: 'backup-pc' } }));
    await startOffsiteRecord();
    finish({ ok: true });
    expect(await run).toMatchObject({ ran: true, ok: true });
    const state = await readAutoBackupState();
    // The backup on the hub still counts; only the old folder's result is dropped.
    expect(state.lastOkAt).toBe('2026-11-16T09:00:00.000Z');
    expect(state.offsite).toEqual({ ...EMPTY_AUTO_BACKUP_STATE.offsite, revision: 1 });
  });

  it('drops a retry\'s result when the storage folder changed while it was being sent', async () => {
    mocks.uploadFile.mockResolvedValueOnce({ ok: false, code: 'unreachable', detail: 'ECONNREFUSED' });
    await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    let finish: (outcome: unknown) => void = () => {};
    mocks.uploadFile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const retry = retryPendingUpload(new Date('2026-11-16T10:00:00Z'));
    await vi.waitFor(() => expect(mocks.uploadFile).toHaveBeenCalledTimes(2));
    await startOffsiteRecord();
    finish({ ok: true });
    await retry;
    expect((await readAutoBackupState()).offsite).toEqual({ ...EMPTY_AUTO_BACKUP_STATE.offsite, revision: 1 });
  });

  it('holds the lock from the first moment of a retry, so "Back up now" waits its turn', async () => {
    mocks.uploadFile.mockResolvedValueOnce({ ok: false, code: 'unreachable', detail: 'ECONNREFUSED' });
    await runAutoBackup({ reason: 'schedule', now: new Date('2026-11-16T09:00:00Z') });
    const retry = retryPendingUpload(new Date('2026-11-16T10:00:00Z'));
    const manual = runAutoBackup({ reason: 'manual', now: new Date('2026-11-16T10:00:00Z') });
    expect(await manual).toEqual({ ran: false, reason: 'busy' });
    await retry;
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect(isAutoBackupRunning()).toBe(false);
  });

  it('lets the lock go when a retry finds nothing to send', async () => {
    await retryPendingUpload(new Date('2026-11-16T10:00:00Z'));
    expect(isAutoBackupRunning()).toBe(false);
    expect(await runAutoBackup({ reason: 'manual' })).toMatchObject({ ran: true });
  });

  it('leaves the reminder\'s off-site date alone when nothing has been sent', async () => {
    await fs.rm(autoBackupRoot(), { recursive: true, force: true });
    await autoBackupSecretsStore.write({});
    await runAutoBackup({ reason: 'schedule' });
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect((await readAutoBackupState()).offsite.lastOkAt).toBeNull();
    expect((await readConfig()).settings.autoBackup?.enabled).toBe(true);
  });
});
