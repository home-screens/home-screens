import { describe, it, expect } from 'vitest';
import {
  destinationPlace,
  destinationSummary,
  sameServer,
  sanitizeDestination,
  type ShareDestination,
  type WebdavDestination,
} from '../storage-destination';
import { destinationFromBody, draftServer } from '../auto-backup-destination';
import { sanitizeAutoBackupSecrets } from '../auto-backup-secrets';

const DAV: WebdavDestination = { kind: 'webdav', url: 'https://nas.example/dav/Backups/', username: 'taylor', password: 'pw' };
const SHARE: ShareDestination = { kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', password: 'pw' };

describe('sanitizeDestination', () => {
  it('keeps a whole destination of either kind', () => {
    expect(sanitizeDestination(DAV)).toEqual(DAV);
    expect(sanitizeDestination({ ...SHARE, port: 1445, domain: 'HOME' })).toEqual({ ...SHARE, port: 1445, domain: 'HOME' });
  });

  it.each([
    ['no kind', { url: DAV.url, username: 'taylor', password: 'pw' }],
    ['an unknown kind', { ...DAV, kind: 'ftp' }],
    ['a share with no host', { ...SHARE, host: '' }],
    ['a share with no share', { ...SHARE, share: '' }],
    ['a share with no folder field', { ...SHARE, folder: undefined }],
    ['no password', { ...SHARE, password: undefined }],
    ['an array', [SHARE]],
  ])('drops %s', (_label, raw) => {
    expect(sanitizeDestination(raw)).toBeUndefined();
  });

  it('drops a port that is not a port, and an empty domain', () => {
    expect(sanitizeDestination({ ...SHARE, port: 70000, domain: '' })).toEqual(SHARE);
  });

  it('is what the secrets file goes through', () => {
    expect(sanitizeAutoBackupSecrets({ destination: SHARE, webdav: DAV })).toEqual({ destination: SHARE });
  });
});

describe('sameServer', () => {
  it('is the same origin for WebDAV and the same host and port for a share', () => {
    expect(sameServer(DAV, { kind: 'webdav', url: 'https://nas.example/other/' })).toBe(true);
    expect(sameServer(DAV, { kind: 'webdav', url: 'http://nas.example/dav/Backups/' })).toBe(false);
    expect(sameServer(SHARE, { kind: 'smb', host: 'NAS.local' })).toBe(true);
    expect(sameServer(SHARE, { kind: 'smb', host: 'nas.local', port: 445 })).toBe(true);
    expect(sameServer(SHARE, { kind: 'smb', host: 'nas.local', port: 1445 })).toBe(false);
    expect(sameServer(SHARE, { kind: 'smb', host: 'backup-pc' })).toBe(false);
  });

  it('is never true across kinds, even for one machine', () => {
    expect(sameServer({ kind: 'webdav', url: 'https://nas.local/' }, { kind: 'smb', host: 'nas.local' })).toBe(false);
  });
});

describe('destinationSummary and destinationPlace', () => {
  it('leaves the password out of the summary', () => {
    expect(destinationSummary({ ...SHARE, domain: 'HOME' })).toEqual({ kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', domain: 'HOME' });
    expect(JSON.stringify(destinationSummary(DAV))).not.toContain('pw');
  });

  it('changes when files would land somewhere else, and not for a new password or a differently written host', () => {
    expect(destinationPlace({ ...SHARE, password: 'new' })).toBe(destinationPlace(SHARE));
    expect(destinationPlace({ ...SHARE, host: 'NAS.LOCAL', share: 'backups' })).toBe(destinationPlace(SHARE));
    expect(destinationPlace({ ...SHARE, folder: 'elsewhere' })).not.toBe(destinationPlace(SHARE));
    expect(destinationPlace({ ...SHARE, username: 'sam' })).not.toBe(destinationPlace(SHARE));
    expect(destinationPlace({ ...SHARE, port: 1445 })).not.toBe(destinationPlace(SHARE));
  });
});

describe('draftServer', () => {
  it('reads the server out of either kind of address, or nothing while it is not usable', () => {
    expect(draftServer('smb', '\\\\nas.local\\Backups\\x')).toEqual({ kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'x' });
    expect(draftServer('webdav', 'https://nas.example/dav')).toEqual({ kind: 'webdav', url: 'https://nas.example/dav/' });
    expect(draftServer('smb', '\\\\nas.local')).toBeNull();
    expect(draftServer('webdav', '\\\\nas.local\\Backups')).toBeNull();
  });

  it('agrees with the hub about keeping the saved password', () => {
    const typed = { kind: 'smb', address: '\\\\nas.local\\Other', username: 'taylor', password: '' };
    expect(sameServer(destinationSummary(SHARE), draftServer('smb', typed.address)!)).toBe(true);
    expect(destinationFromBody(typed, SHARE)).toMatchObject({ password: 'pw' });
  });
});
