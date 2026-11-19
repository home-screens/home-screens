import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const checkDestination = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
}));
vi.mock('@/lib/offsite-send', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/offsite-send')>()),
  checkDestination,
}));

import { POST } from '@/app/api/backup/auto/test/route';
import { requireSession } from '@/lib/auth';
import { autoBackupSecretsStore } from '@/lib/auto-backup-secrets';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup/auto/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAVED = { kind: 'webdav' as const, url: 'https://nas.example/dav/', username: 'taylor', password: 'nas-pass' };

beforeEach(async () => {
  vi.mocked(requireSession).mockReset();
  checkDestination.mockReset().mockResolvedValue({ ok: true });
  await autoBackupSecretsStore.write({ destination: SAVED });
});

describe('POST /api/backup/auto/test', () => {
  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
    expect((await POST(post({}))).status).toBe(401);
    expect(checkDestination).not.toHaveBeenCalled();
  });

  it('checks the saved folder when the body names none', async () => {
    expect(await (await POST(post({}))).json()).toEqual({ ok: true });
    expect(checkDestination).toHaveBeenCalledWith(SAVED);
  });

  it('checks the form\'s values, keeping the saved password on the same host', async () => {
    await POST(post({ kind: 'webdav', url: 'https://nas.example/dav/Other', username: 'sam', password: '' }));
    expect(checkDestination).toHaveBeenCalledWith({ kind: 'webdav', url: 'https://nas.example/dav/Other/', username: 'sam', password: 'nas-pass' });
  });

  it('never sends the saved password to a host it was not typed for', async () => {
    const res = await POST(post({ kind: 'webdav', url: 'https://elsewhere.example/', username: 'taylor', password: '' }));
    expect(res.status).toBe(400);
    expect(checkDestination).not.toHaveBeenCalled();
  });

  it('answers a storage problem as a result with its code', async () => {
    checkDestination.mockResolvedValue({ ok: false, code: 'sign-in', detail: 'HTTP 401' });
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, code: 'sign-in' });
  });

  it('checks a network share from the form, and passes on the shares a wrong name came back with', async () => {
    checkDestination.mockResolvedValue({ ok: false, code: 'share-not-found', detail: 'STATUS_BAD_NETWORK_NAME', shares: ['Backups', 'Media'] });
    const res = await POST(post({ kind: 'smb', address: '\\\\nas.local\\Backup\\home-screens', username: 'taylor', password: 'pw' }));
    expect(checkDestination).toHaveBeenCalledWith({ kind: 'smb', host: 'nas.local', share: 'Backup', folder: 'home-screens', username: 'taylor', password: 'pw' });
    expect(await res.json()).toEqual({ ok: false, code: 'share-not-found', shares: ['Backups', 'Media'] });
  });

  it('says when there is nothing to check', async () => {
    await autoBackupSecretsStore.write({});
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'not_set_up' });
  });
});
