import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/webdav-upload', () => ({
  uploadFile: async () => { calls.push('webdav upload'); return { ok: true }; },
  deleteFile: async () => { calls.push('webdav delete'); return { ok: true }; },
  testDestination: async () => { calls.push('webdav test'); return { ok: true }; },
}));
vi.mock('@/lib/smb-upload', () => ({
  uploadFile: async () => { calls.push('smb upload'); return { ok: true }; },
  deleteFile: async () => { calls.push('smb delete'); return { ok: true }; },
  testDestination: async () => { calls.push('smb test'); return { ok: false, code: 'share-not-found', shares: ['Backups'] }; },
}));

import { checkDestination, removeFromDestination, sendToDestination } from '../offsite-send';
import type { ShareDestination, WebdavDestination } from '../storage-destination';

const DAV: WebdavDestination = { kind: 'webdav', url: 'https://nas.example/dav/', username: 'taylor', password: 'pw' };
const SHARE: ShareDestination = { kind: 'smb', host: 'nas.local', share: 'Backups', folder: '', username: 'taylor', password: 'pw' };

beforeEach(() => { calls.length = 0; });

describe('offsite-send', () => {
  it('sends, removes and checks through the kind the destination is', async () => {
    await sendToDestination(DAV, '/tmp/x', 'x');
    await sendToDestination(SHARE, '/tmp/x', 'x');
    await removeFromDestination(DAV, 'x');
    await removeFromDestination(SHARE, 'x');
    await checkDestination(DAV);
    expect(await checkDestination(SHARE)).toEqual({ ok: false, code: 'share-not-found', shares: ['Backups'] });
    expect(calls).toEqual(['webdav upload', 'smb upload', 'webdav delete', 'smb delete', 'webdav test', 'smb test']);
  });
});
