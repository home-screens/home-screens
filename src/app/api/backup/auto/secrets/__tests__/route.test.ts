import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/auth')>()),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn(),
}));

import { PUT } from '@/app/api/backup/auto/secrets/route';
import { isAuthEnabled, requireSession } from '@/lib/auth';
import { autoBackupSecretsStore, readAutoBackupSecrets } from '@/lib/auto-backup-secrets';
import { readAutoBackupState, updateAutoBackupState, EMPTY_AUTO_BACKUP_STATE } from '@/lib/auto-backup-state';

function put(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backup/auto/secrets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FOLDER = { kind: 'webdav', url: 'https://nas.example/dav/Backups', username: 'taylor', password: 'nas-pass' };
const SHARE = { kind: 'smb', address: '\\\\nas.local\\Backups\\home-screens', username: 'taylor', password: 'nas-pass' };

beforeEach(async () => {
  vi.mocked(requireSession).mockReset();
  vi.mocked(isAuthEnabled).mockResolvedValue(true);
  await autoBackupSecretsStore.write({});
  await updateAutoBackupState(() => structuredClone(EMPTY_AUTO_BACKUP_STATE));
});

describe('PUT /api/backup/auto/secrets', () => {
  it('needs a signed-in session', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Response(null, { status: 401 }));
    expect((await PUT(put({ backupPassword: 'correct horse' }))).status).toBe(401);
    expect(await readAutoBackupSecrets()).toEqual({});
  });

  it('saves a backup password and never answers it back', async () => {
    const res = await PUT(put({ backupPassword: 'correct horse' }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('correct horse');
    expect(JSON.parse(text)).toEqual({ hasBackupPassword: true, destination: null });
    expect((await readAutoBackupSecrets()).backupPassword).toBe('correct horse');
  });

  it('refuses a backup password while there is no editor password', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(false);
    const res = await PUT(put({ backupPassword: 'correct horse' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'editor_password_required' });
    expect(await readAutoBackupSecrets()).toEqual({});
  });

  it('refuses a short backup password', async () => {
    const res = await PUT(put({ backupPassword: 'short' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'passphrase_too_short' });
  });

  it('forgets the backup password on null', async () => {
    await autoBackupSecretsStore.write({ backupPassword: 'correct horse', linkToken: 'tok' });
    await PUT(put({ backupPassword: null }));
    expect(await readAutoBackupSecrets()).toEqual({ linkToken: 'tok' });
  });

  it('saves the storage folder with a trailing slash and answers only its address and name', async () => {
    const res = await PUT(put({ destination: FOLDER }));
    expect(await res.json()).toEqual({ hasBackupPassword: false, destination: { kind: 'webdav', url: 'https://nas.example/dav/Backups/', username: 'taylor' } });
    expect((await readAutoBackupSecrets()).destination).toEqual({ ...FOLDER, url: 'https://nas.example/dav/Backups/' });
  });

  it.each([
    [{ ...FOLDER, url: 'ftp://nas.example/' }, 'url_scheme'],
    [{ ...FOLDER, url: 'https://taylor:pw@nas.example/' }, 'url_credentials'],
    [{ ...FOLDER, url: 'not a url' }, 'url_invalid'],
    [{ ...FOLDER, username: '' }, 'username_required'],
    [{ ...FOLDER, password: '' }, 'password_required'],
  ])('refuses %j', async (destination, code) => {
    const res = await PUT(put({ destination }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code });
    expect(await readAutoBackupSecrets()).toEqual({});
  });

  it('keeps the saved password when the folder stays on the same host', async () => {
    await PUT(put({ destination: FOLDER }));
    await PUT(put({ destination: { kind: 'webdav', url: 'https://nas.example/dav/Other/', username: 'taylor', password: '' } }));
    expect((await readAutoBackupSecrets()).destination).toEqual({ kind: 'webdav', url: 'https://nas.example/dav/Other/', username: 'taylor', password: 'nas-pass' });
  });

  it('never sends the saved password to a different host', async () => {
    await PUT(put({ destination: FOLDER }));
    const res = await PUT(put({ destination: { kind: 'webdav', url: 'https://elsewhere.example/dav/', username: 'taylor', password: '' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'password_required' });
    expect((await readAutoBackupSecrets()).destination).toMatchObject({ url: 'https://nas.example/dav/Backups/' });
  });

  it('saves a network share from a Windows-style address, with a work-style name split off', async () => {
    const res = await PUT(put({ destination: { ...SHARE, username: 'HOME\\taylor' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).destination).toEqual({ kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', domain: 'HOME' });
    expect((await readAutoBackupSecrets()).destination).toEqual({
      kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', domain: 'HOME', password: 'nas-pass',
    });
  });

  it.each([
    [{ ...SHARE, address: '\\\\nas.local' }, 'address_no_share'],
    [{ ...SHARE, address: 'smb://taylor:pw@nas.local/Backups' }, 'address_credentials'],
    [{ ...SHARE, address: '\\\\nas.local\\Backups\\..\\etc' }, 'address_bad_character'],
    [{ ...SHARE, address: 'https://nas.local/Backups' }, 'address_invalid'],
    [{ ...SHARE, kind: 'ftp' }, 'kind_invalid'],
  ])('refuses the share %j', async (destination, code) => {
    const res = await PUT(put({ destination }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code });
  });

  it('keeps the saved share password for another folder on the same server, never for another server or kind', async () => {
    await PUT(put({ destination: SHARE }));
    await PUT(put({ destination: { ...SHARE, address: 'smb://NAS.local/Other/place', password: '' } }));
    expect((await readAutoBackupSecrets()).destination).toMatchObject({ share: 'Other', folder: 'place', password: 'nas-pass' });
    for (const moved of [
      { ...SHARE, address: '\\\\backup-pc\\Shared', password: '' },
      { ...SHARE, address: 'smb://nas.local:1445/Backups', password: '' },
      { kind: 'webdav', url: 'https://nas.local/dav/', username: 'taylor', password: '' },
    ]) {
      const res = await PUT(put({ destination: moved }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'password_required' });
    }
    expect((await readAutoBackupSecrets()).destination).toMatchObject({ kind: 'smb', host: 'NAS.local', share: 'Other' });
  });

  it('a share in a new place starts with a clean record; the same place with a new password does not', async () => {
    await PUT(put({ destination: SHARE }));
    await updateAutoBackupState((current) => ({
      ...current,
      offsite: { ...current.offsite, lastAttemptAt: 'x', lastOkAt: 'x', lastError: { code: 'sign-in' }, pendingFile: 'f', remoteFiles: ['f'] },
    }));
    const revision = (await readAutoBackupState()).offsite.revision;
    await PUT(put({ destination: { ...SHARE, password: 'new-pass' } }));
    expect((await readAutoBackupState()).offsite).toMatchObject({ remoteFiles: ['f'], revision });
    await PUT(put({ destination: { ...SHARE, address: '\\\\nas.local\\Backups\\elsewhere' } }));
    expect((await readAutoBackupState()).offsite).toEqual({ ...EMPTY_AUTO_BACKUP_STATE.offsite, revision: revision + 1 });
  });

  it('starts a new folder with a clean record, and stopping clears it too', async () => {
    await PUT(put({ destination: FOLDER }));
    await updateAutoBackupState((current) => ({
      ...current,
      offsite: { ...current.offsite, lastAttemptAt: 'x', lastOkAt: 'x', lastError: { code: 'sign-in' }, pendingFile: 'f', remoteFiles: ['f'] },
    }));
    const revision = (await readAutoBackupState()).offsite.revision;
    await PUT(put({ destination: { ...FOLDER, url: 'https://nas.example/dav/New/' } }));
    expect((await readAutoBackupState()).offsite).toEqual({ ...EMPTY_AUTO_BACKUP_STATE.offsite, revision: revision + 1 });
    await updateAutoBackupState((current) => ({ ...current, offsite: { ...current.offsite, remoteFiles: ['g'] } }));
    await PUT(put({ destination: null }));
    expect((await readAutoBackupSecrets()).destination).toBeUndefined();
    expect((await readAutoBackupState()).offsite.remoteFiles).toEqual([]);
  });
});
