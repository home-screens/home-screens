import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
}));

import { DELETE, GET } from '@/app/api/backup/auto/files/[name]/route';
import { requireSession } from '@/lib/auth';
import { autoBackupRoot } from '@/lib/auto-backup-files';

const NAME = 'home-screens-auto-backup-with-keys-2026-11-16-0300.json';
const BUNDLE = { _type: 'home-screens-backup', _version: 2, credentials: { encrypted: true, kdf: 'scrypt', kdfParams: {}, salt: 's', iv: 'i', tag: 't', ciphertext: 'c' } };

function req(name: string, { method = 'GET', query = '' } = {}) {
  return [
    new NextRequest(`http://localhost/api/backup/auto/files/${encodeURIComponent(name)}${query}`, { method }),
    { params: Promise.resolve({ name }) },
  ] as const;
}

beforeEach(async () => {
  vi.mocked(requireSession).mockReset();
  await fs.rm(autoBackupRoot(), { recursive: true, force: true });
  await fs.mkdir(autoBackupRoot(), { recursive: true });
  await fs.writeFile(path.join(autoBackupRoot(), NAME), JSON.stringify(BUNDLE));
  await fs.writeFile(path.join(process.cwd(), 'data', 'secrets.json'), '{"openweathermap":"KEY"}');
});

describe('/api/backup/auto/files/[name]', () => {
  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
    expect((await GET(...req(NAME))).status).toBe(401);
    expect((await DELETE(...req(NAME, { method: 'DELETE' }))).status).toBe(401);
    await expect(fs.stat(path.join(autoBackupRoot(), NAME))).resolves.toBeTruthy();
  });

  it('downloads a copy under its own name', async () => {
    const res = await GET(...req(NAME));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${NAME}"`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(await res.text())).toEqual(BUNDLE);
  });

  it('says what a copy holds for the restore prompts', async () => {
    const res = await GET(...req(NAME, { query: '?summary=1' }));
    expect(await res.json()).toEqual({
      hasCredentials: true,
      credentialsEncrypted: true,
      hasCustomIcons: false,
      usesCustomIcons: false,
      pictures: { count: 0, bytes: 0, skipped: 0 },
    });
  });

  it.each(['../secrets.json', '..%2Fsecrets.json', 'secrets.json', `${NAME}.partial`, '../../data/secrets.json'])(
    'touches nothing outside the folder for %j',
    async (name) => {
      expect((await GET(...req(name))).status).toBe(404);
      expect((await DELETE(...req(name, { method: 'DELETE' }))).status).toBe(404);
      await expect(fs.readFile(path.join(process.cwd(), 'data', 'secrets.json'), 'utf8')).resolves.toContain('KEY');
    },
  );

  it('removes one copy', async () => {
    expect((await DELETE(...req(NAME, { method: 'DELETE' }))).status).toBe(200);
    await expect(fs.stat(path.join(autoBackupRoot(), NAME))).rejects.toThrow();
    expect((await GET(...req(NAME))).status).toBe(404);
  });
});
