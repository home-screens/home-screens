import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/backup/latest/route';
import { CLIENT_IP_HEADER } from '@/lib/client-ip';
import { autoBackupRoot } from '@/lib/auto-backup-files';
import { autoBackupSecretsStore } from '@/lib/auto-backup-secrets';
import { readAutoBackupState, updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '@/lib/auto-backup-state';

const TOKEN = 'n3wLnkT0k3n-abcdefghijklmnopqrstuvwxyz012345';
const OLDER = 'home-screens-auto-backup-2026-11-15-0300.json';
const NEWER = 'home-screens-auto-backup-2026-11-16-0300.zip';

let ipCounter = 0;
/** Each test from its own address, so the wrong-token limit of one never spills into another. */
function req({ query = '', auth, ip }: { query?: string; auth?: string; ip?: string } = {}): NextRequest {
  // The address the server stamps from the socket (see server-ip-patch.ts).
  const headers: Record<string, string> = { [CLIENT_IP_HEADER]: ip ?? `10.9.0.${++ipCounter}` };
  if (auth) headers.authorization = auth;
  return new NextRequest(`http://localhost/api/backup/latest${query}`, { headers });
}

async function seedCopies(): Promise<void> {
  await fs.mkdir(autoBackupRoot(), { recursive: true });
  await fs.writeFile(path.join(autoBackupRoot(), OLDER), '{"older":true}');
  const older = new Date('2026-11-15T09:00:00Z');
  await fs.utimes(path.join(autoBackupRoot(), OLDER), older, older);
  await fs.writeFile(path.join(autoBackupRoot(), NEWER), 'PK zip bytes');
}

beforeEach(async () => {
  await fs.rm(autoBackupRoot(), { recursive: true, force: true });
  await autoBackupSecretsStore.write({ linkToken: TOKEN });
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
});

describe('GET /api/backup/latest', () => {
  it('serves the newest copy for the right token in the header', async () => {
    await seedCopies();
    const res = await GET(req({ auth: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${NEWER}"`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('PK zip bytes');
    expect((await readAutoBackupState()).lastPulledAt).not.toBeNull();
  });

  it('takes the token from the address too, for tools that cannot send a header', async () => {
    await seedCopies();
    expect((await GET(req({ query: `?token=${TOKEN}` }))).status).toBe(200);
  });

  it('looks the same from outside for no link, a wrong token and no token', async () => {
    await seedCopies();
    expect((await GET(req({ query: '?token=wrong' }))).status).toBe(404);
    expect((await GET(req())).status).toBe(404);
    await autoBackupSecretsStore.write({});
    expect((await GET(req({ query: `?token=${TOKEN}` }))).status).toBe(404);
    expect((await readAutoBackupState()).lastPulledAt).toBeNull();
  });

  it('never makes a backup when there is none yet', async () => {
    const res = await GET(req({ query: `?token=${TOKEN}` }));
    expect(res.status).toBe(404);
    expect(await fs.readdir(autoBackupRoot()).catch(() => [])).toEqual([]);
  });

  it('makes an address that keeps guessing wait', async () => {
    await seedCopies();
    const ip = '10.9.9.9';
    for (let i = 0; i < 10; i++) expect((await GET(req({ query: `?token=guess${i}`, ip }))).status).toBe(404);
    expect((await GET(req({ query: `?token=${TOKEN}`, ip }))).status).toBe(429);
    // Another address is unaffected.
    expect((await GET(req({ query: `?token=${TOKEN}` }))).status).toBe(200);
  });
});
