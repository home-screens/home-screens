import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// Only auth is stubbed. The export, the copy on disk and the restore all run
// for real against the sandbox data/.
vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));

import { GET, POST } from '@/app/api/backup/route';
import { readConfig, writeConfig } from '@/lib/config';
import { getLatestSchemaVersion } from '@/lib/migrations';
import { buildBackupBundle } from '@/lib/backup-compose';
import { runAutoBackup } from '@/lib/auto-backup-run';
import { autoBackupRoot, listAutoBackups } from '@/lib/auto-backup-files';
import { autoBackupSecretsStore, readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { collectCredentials } from '@/lib/backup-credentials';
import { encryptCredentials } from '@/lib/backup-crypto';
import { updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '@/lib/auto-backup-state';
import { writeSecrets, readSecrets } from '@/lib/secrets';
import { seedDataFile } from '@/test-utils';
import type { ScreenConfiguration } from '@/types/config';

function config(name: string, extra: Partial<ScreenConfiguration['settings']> = {}): ScreenConfiguration {
  return {
    version: getLatestSchemaVersion(),
    screens: [{ id: 's1', name, modules: [], backgroundImage: '/backgrounds/beach.jpg' }],
    settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920, timezone: 'America/Chicago', ...extra },
  } as unknown as ScreenConfiguration;
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BEACH = path.join(process.cwd(), 'public', 'backgrounds', 'beach.jpg');

beforeEach(async () => {
  vi.clearAllMocks();
  await fs.rm(autoBackupRoot(), { recursive: true, force: true });
  await fs.rm(BEACH, { force: true });
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
  await autoBackupSecretsStore.write({});
  await writeSecrets({});
  await seedDataFile('data/chores.json', { chores: [] });
  await seedDataFile('data/family.json', { members: [], migrated: true });
  await seedDataFile('data/auth.json', { passwordHash: null, salt: null, cookieSecret: null });
});

describe('the backup bundle', () => {
  it('is the same whether the download or an automatic backup builds it', async () => {
    await writeConfig(config('Kitchen'));
    const downloaded = await (await GET(new NextRequest('http://localhost/api/backup'))).json();
    const built = await buildBackupBundle();
    const { _createdAt: _a, ...a } = downloaded;
    const { _createdAt: _b, ...b } = built;
    expect(b).toEqual(a);
  });
});

describe('POST /api/backup with a copy kept on the hub', () => {
  it('restores a JSON copy and leaves the copy where it was', async () => {
    await writeConfig(config('Kitchen', { autoBackup: { enabled: true } }));
    await runAutoBackup({ reason: 'manual' });
    const [copy] = await listAutoBackups();
    await writeConfig(config('Changed since'));

    const res = await POST(post({ _auto: copy.name }));
    expect(res.status).toBe(200);
    expect((await readConfig()).screens[0].name).toBe('Kitchen');
    expect((await listAutoBackups()).map((c) => c.name)).toEqual([copy.name]);
  });

  it('restores a zip copy, pictures and all, and leaves the copy where it was', async () => {
    await fs.writeFile(BEACH, Buffer.alloc(4096, 3));
    await writeConfig(config('Kitchen', { autoBackup: { enabled: true, pictures: 'used' } }));
    await runAutoBackup({ reason: 'manual' });
    const [copy] = await listAutoBackups();
    expect(copy.withPictures).toBe(true);
    await fs.rm(BEACH);
    await writeConfig(config('Changed since'));

    const res = await POST(post({ _auto: copy.name }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pictures).toMatchObject({ added: 1 });
    expect((await fs.stat(BEACH)).size).toBe(4096);
    expect((await readConfig()).screens[0].name).toBe('Kitchen');
    await expect(fs.stat(path.join(autoBackupRoot(), copy.name))).resolves.toBeTruthy();
  });

  it('keeps the copy even when the restore is refused', async () => {
    await writeConfig(config('Kitchen', { autoBackup: { enabled: true, includeKeys: true } }));
    await autoBackupSecretsStore.write({ backupPassword: 'correct horse' });
    await runAutoBackup({ reason: 'manual' });
    const [copy] = await listAutoBackups();
    const res = await POST(post({ _auto: copy.name, _passphrase: 'wrong password' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'bad_passphrase' });
    expect((await listAutoBackups()).map((c) => c.name)).toEqual([copy.name]);
  });

  it('asks for the password, and unlocks with the saved one without it ever leaving the hub', async () => {
    await writeSecrets({ openweathermap_key: 'KEY-1' });
    await writeConfig(config('Kitchen', { autoBackup: { enabled: true, includeKeys: true } }));
    await autoBackupSecretsStore.write({ backupPassword: 'correct horse' });
    await runAutoBackup({ reason: 'manual' });
    const [copy] = await listAutoBackups();
    expect(copy.withKeys).toBe(true);
    await writeSecrets({});

    const asked = await POST(post({ _auto: copy.name }));
    expect(asked.status).toBe(400);
    expect(await asked.json()).toMatchObject({ code: 'passphrase_required' });

    const res = await POST(post({ _auto: copy.name, _useSavedPassword: true }));
    expect(res.status).toBe(200);
    expect(await readSecrets()).toMatchObject({ openweathermap_key: 'KEY-1' });
  });

  it('restores everything but the keys when asked to', async () => {
    await writeConfig(config('Kitchen', { autoBackup: { enabled: true, includeKeys: true } }));
    await autoBackupSecretsStore.write({ backupPassword: 'correct horse' });
    await runAutoBackup({ reason: 'manual' });
    const [copy] = await listAutoBackups();
    await writeConfig(config('Changed since'));
    const res = await POST(post({ _auto: copy.name, _withoutKeys: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).credentials).toBeUndefined();
    expect((await readConfig()).screens[0].name).toBe('Kitchen');
  });

  it.each(['../config.json', 'home-screens-backup-2026-11-16.json', 'home-screens-auto-backup-2026-11-16-0300.json'])(
    'refuses %j without touching anything',
    async (name) => {
      await writeConfig(config('Kitchen'));
      const res = await POST(post({ _auto: name }));
      expect(res.status).toBe(400);
      expect((await readConfig()).screens[0].name).toBe('Kitchen');
    },
  );
});

describe('the storage folder and backup password inside a backup\'s keys', () => {
  it('travel with the keys, and the download link does not', async () => {
    await autoBackupSecretsStore.write({
      backupPassword: 'correct horse',
      destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' },
      linkToken: 'old-hub-link',
    });
    const payload = await collectCredentials();
    expect(payload.autoBackup).toEqual({
      backupPassword: 'correct horse',
      destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' },
    });
    expect(JSON.stringify(payload)).not.toContain('old-hub-link');
  });

  it('carry a network share the same way, domain included', async () => {
    const share = { kind: 'smb' as const, host: 'nas.local', port: 1445, share: 'Backups', folder: 'home-screens', username: 'taylor', domain: 'HOME', password: 'nas-pass' };
    await autoBackupSecretsStore.write({ destination: share });
    expect((await collectCredentials()).autoBackup).toEqual({ destination: share });

    await writeConfig(config('Kitchen'));
    await autoBackupSecretsStore.write({});
    const bundle = {
      ...(await buildBackupBundle()),
      credentials: await encryptCredentials({ autoBackup: { destination: share } }, 'correct horse'),
    };
    const res = await POST(post({ ...bundle, _passphrase: 'correct horse' }));
    expect(res.status).toBe(200);
    expect(await readAutoBackupSecrets()).toEqual({ destination: share });
  });

  it('restore onto a hub that keeps its own link', async () => {
    await writeConfig(config('Kitchen'));
    await autoBackupSecretsStore.write({ linkToken: 'this-hub-link' });
    const bundle = {
      ...(await buildBackupBundle()),
      credentials: await encryptCredentials({
        autoBackup: { backupPassword: 'correct horse', destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' } },
      }, 'correct horse'),
    };
    const res = await POST(post({ ...bundle, _passphrase: 'correct horse' }));
    expect(res.status).toBe(200);
    expect((await res.json()).credentials.applied).toEqual(['autoBackup']);
    expect(await readAutoBackupSecrets()).toEqual({
      backupPassword: 'correct horse',
      destination: { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' },
      linkToken: 'this-hub-link',
    });
  });
});
