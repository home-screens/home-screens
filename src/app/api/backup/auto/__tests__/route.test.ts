import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(true),
}));

import { GET, POST } from '@/app/api/backup/auto/route';
import { requireSession } from '@/lib/auth';
import { writeConfig } from '@/lib/config';
import { getLatestSchemaVersion } from '@/lib/migrations';
import { autoBackupRoot } from '@/lib/auto-backup-files';
import { autoBackupSecretsStore } from '@/lib/auto-backup-secrets';
import { updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '@/lib/auto-backup-state';
import type { AutoBackupStatus } from '@/lib/auto-backup-types';
import type { ScreenConfiguration } from '@/types/config';

const req = (method = 'GET') => new NextRequest('http://localhost/api/backup/auto', { method });

beforeEach(async () => {
  vi.mocked(requireSession).mockReset();
  await fs.rm(autoBackupRoot(), { recursive: true, force: true });
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
  await autoBackupSecretsStore.write({});
  await writeConfig({
    version: getLatestSchemaVersion(),
    screens: [{ id: 's1', name: 'Screen 1', modules: [] }],
    settings: { rotationIntervalMs: 30000, displayWidth: 1080, displayHeight: 1920, autoBackup: { enabled: true } },
  } as unknown as ScreenConfiguration);
});

describe('/api/backup/auto', () => {
  it('needs a signed-in session for both reading and running', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
    expect((await GET(req())).status).toBe(401);
    expect((await POST(req('POST'))).status).toBe(401);
    expect(await fs.readdir(autoBackupRoot()).catch(() => [])).toEqual([]);
  });

  it('answers what is set up without any secret in it', async () => {
    await autoBackupSecretsStore.write({
      backupPassword: 'correct horse',
      destination: { kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', password: 'nas-pass' },
      linkToken: 'tok-secret',
    });
    const res = await GET(req());
    const text = await res.text();
    expect(text).not.toContain('correct horse');
    expect(text).not.toContain('nas-pass');
    expect(text).not.toContain('tok-secret');
    const status = JSON.parse(text) as AutoBackupStatus;
    expect(status).toMatchObject({
      hasBackupPassword: true,
      destination: { kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor' },
      hasLink: true,
      editorPasswordSet: true,
      copies: [],
      running: false,
      // No scheduler runs in a test process, so no next backup is promised.
      nextRun: null,
    });
  });

  it('runs a backup now and answers the new status with the copy in it', async () => {
    const res = await POST(req('POST'));
    expect(res.status).toBe(200);
    const status = (await res.json()) as AutoBackupStatus;
    expect(status.copies).toHaveLength(1);
    expect(status.copies[0]).toMatchObject({ withKeys: false, withPictures: false });
    expect(status.lastOkAt).not.toBeNull();
    expect(status.lastError).toBeNull();
  });

  it('refuses a second run while one is in flight', async () => {
    const [a, b] = await Promise.all([POST(req('POST')), POST(req('POST'))]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const refused = a.status === 409 ? a : b;
    expect(await refused.json()).toMatchObject({ code: 'busy' });
  });
});
