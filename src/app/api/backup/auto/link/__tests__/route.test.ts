import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
}));

import { DELETE, GET, POST } from '@/app/api/backup/auto/link/route';
import { requireSession } from '@/lib/auth';
import { autoBackupSecretsStore, readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { readAutoBackupState, updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '@/lib/auto-backup-state';

const req = (method: string) => new NextRequest('http://localhost/api/backup/auto/link', { method });

beforeEach(async () => {
  vi.mocked(requireSession).mockReset();
  await autoBackupSecretsStore.write({ backupPassword: 'correct horse' });
  await updateAutoBackupState(() => ({ ...structuredClone(EMPTY_AUTO_BACKUP_STATE), lastPulledAt: '2026-11-15T10:12:00.000Z' }));
});

describe('/api/backup/auto/link', () => {
  it('needs a signed-in session for every method', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
    for (const handler of [GET, POST, DELETE]) {
      const method = handler === GET ? 'GET' : handler === POST ? 'POST' : 'DELETE';
      expect((await handler(req(method))).status).toBe(401);
    }
    expect((await readAutoBackupSecrets()).linkToken).toBeUndefined();
  });

  it('has no link until one is made', async () => {
    expect((await GET(req('GET'))).status).toBe(404);
  });

  it('makes a long random link, answers it to the session, and starts its fetch record over', async () => {
    const made = await (await POST(req('POST'))).json();
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await (await GET(req('GET'))).json()).toEqual({ token: made.token });
    expect((await readAutoBackupState()).lastPulledAt).toBeNull();
    expect((await readAutoBackupSecrets()).backupPassword).toBe('correct horse');
  });

  it('replaces the link with a new one', async () => {
    const first = (await (await POST(req('POST'))).json()).token;
    const second = (await (await POST(req('POST'))).json()).token;
    expect(second).not.toBe(first);
    expect((await readAutoBackupSecrets()).linkToken).toBe(second);
  });

  it('removes the link and nothing else', async () => {
    await POST(req('POST'));
    expect((await DELETE(req('DELETE'))).status).toBe(200);
    expect(await readAutoBackupSecrets()).toEqual({ backupPassword: 'correct horse' });
    expect((await GET(req('GET'))).status).toBe(404);
  });
});
