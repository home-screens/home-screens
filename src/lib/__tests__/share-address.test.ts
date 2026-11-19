import { describe, it, expect } from 'vitest';
import {
  addressKind,
  formatShareAddress,
  parseShareAddress,
  splitAccountName,
  warnsOutsideHome,
  withShare,
} from '../share-address';
import { isHomeHost } from '../home-host';

describe('parseShareAddress', () => {
  it.each([
    ['\\\\nas.local\\Backups', { host: 'nas.local', share: 'Backups', folder: '' }],
    ['\\\\nas.local\\Backups\\home-screens', { host: 'nas.local', share: 'Backups', folder: 'home-screens' }],
    ['\\\\nas.local\\Backups\\a\\b\\', { host: 'nas.local', share: 'Backups', folder: 'a/b' }],
    ['//nas.local/Backups/home-screens', { host: 'nas.local', share: 'Backups', folder: 'home-screens' }],
    ['smb://nas.local/Backups/home-screens/', { host: 'nas.local', share: 'Backups', folder: 'home-screens' }],
    ['SMB://192.168.1.20:1445/Backups', { host: '192.168.1.20', port: 1445, share: 'Backups', folder: '' }],
    ['smb://nas/Family%20Backups/Sauvegardes%20%C3%A9t%C3%A9', { host: 'nas', share: 'Family Backups', folder: 'Sauvegardes été' }],
    ['\\\\nas\\Family Backups\\Sauvegardes été', { host: 'nas', share: 'Family Backups', folder: 'Sauvegardes été' }],
    ['smb://[fd00::20]/Backups', { host: '[fd00::20]', share: 'Backups', folder: '' }],
    ['  nas.local/Backups  ', { host: 'nas.local', share: 'Backups', folder: '' }],
    ['\\\\nas.local\\Secret$', { host: 'nas.local', share: 'Secret$', folder: '' }],
    // Both slashes mixed, the way people type a folder after a pasted address.
    ['smb://192.168.50.223/homescreens\\home-screens', { host: '192.168.50.223', share: 'homescreens', folder: 'home-screens' }],
    ['smb://nas\\Backups/a\\b', { host: 'nas', share: 'Backups', folder: 'a/b' }],
    ['\\\\nas.local/Backups\\home-screens', { host: 'nas.local', share: 'Backups', folder: 'home-screens' }],
  ])('reads %s', (raw, expected) => {
    expect(parseShareAddress(raw)).toEqual(expected);
  });

  it.each([
    ['', 'invalid'],
    [42, 'invalid'],
    ['https://nas.local/Backups', 'invalid'],
    ['C:\\Users\\taylor', 'invalid'],
    ['\\\\bad host\\Backups', 'invalid'],
    ['smb://nas.local:99999/Backups', 'invalid'],
    ['\\\\nas.local', 'no-share'],
    ['smb://nas.local/', 'no-share'],
    ['smb://taylor:pw@nas.local/Backups', 'credentials'],
    ['\\\\taylor@nas.local\\Backups', 'credentials'],
    ['\\\\nas.local\\Backups\\..\\etc', 'bad-character'],
    ['\\\\nas.local\\Backups\\what?', 'bad-character'],
    ['smb://nas.local/Backups/a%5Cb', 'bad-character'],
    ['smb://nas.local/Backups/a%2Fb', 'bad-character'],
    ['smb://nas.local/%E0%A4%A', 'invalid'],
    [`\\\\nas\\${'x'.repeat(81)}`, 'invalid'],
  ])('refuses %j as %s', (raw, problem) => {
    expect(parseShareAddress(raw)).toEqual({ problem });
  });
});

describe('formatShareAddress and withShare', () => {
  it('writes an address the way Windows shows it, and with smb:// when it names a port', () => {
    expect(formatShareAddress({ host: 'nas.local', share: 'Backups', folder: 'a/b' })).toBe('\\\\nas.local\\Backups\\a\\b');
    expect(formatShareAddress({ host: 'nas.local', port: 1445, share: 'Family Backups', folder: '' })).toBe('smb://nas.local:1445/Family%20Backups');
  });

  it('reads back what it writes', () => {
    for (const address of [
      { host: 'nas.local', share: 'Backups', folder: 'home-screens' },
      { host: 'nas', port: 1445, share: 'Family Backups', folder: 'Sauvegardes été' },
    ]) {
      expect(parseShareAddress(formatShareAddress(address))).toEqual(address);
    }
  });

  it('swaps the share and keeps the folder, for the share list', () => {
    expect(withShare('\\\\nas.local\\Backup\\home-screens', 'Backups')).toBe('\\\\nas.local\\Backups\\home-screens');
    expect(withShare('smb://nas.local/Backup', 'Media')).toBe('\\\\nas.local\\Media');
    expect(withShare('\\\\nas.local', 'Backups')).toBeNull();
  });
});

describe('addressKind', () => {
  it.each([
    ['\\\\nas\\Backups', 'smb'],
    ['  SMB://nas/Backups', 'smb'],
    ['https://cloud.example.com/dav/', 'webdav'],
    ['http://nas.local:5005/', 'webdav'],
    ['nas.local/Backups', null],
    ['h', null],
  ])('%s is %s', (raw, kind) => {
    expect(addressKind(raw)).toBe(kind);
  });
});

describe('warnsOutsideHome', () => {
  it('warns only for a server outside the home', () => {
    expect(warnsOutsideHome('\\\\files.example.com\\Backups')).toBe(true);
    expect(warnsOutsideHome('\\\\nas.local\\Backups')).toBe(false);
    expect(warnsOutsideHome('\\\\nas\\Backups')).toBe(false);
    expect(warnsOutsideHome('smb://192.168.50.20/Backups')).toBe(false);
    expect(warnsOutsideHome('smb://8.8.8.8/Backups')).toBe(true);
    expect(warnsOutsideHome('\\\\files.example.com')).toBe(false);
  });
});

describe('splitAccountName', () => {
  it('splits a work-style name and leaves a plain one alone', () => {
    expect(splitAccountName('HOME\\taylor')).toEqual({ domain: 'HOME', username: 'taylor' });
    expect(splitAccountName(' taylor ')).toEqual({ username: 'taylor' });
    expect(splitAccountName('taylor@home.example')).toEqual({ username: 'taylor@home.example' });
    expect(splitAccountName('\\taylor')).toEqual({ username: '\\taylor' });
    expect(splitAccountName('HOME\\')).toEqual({ username: 'HOME\\' });
  });
});

describe('isHomeHost', () => {
  it.each([
    ['nas', true],
    ['nas.local', true],
    ['router.home.arpa', true],
    ['10.0.0.5', true],
    ['172.20.1.1', true],
    ['192.168.86.143', true],
    ['100.101.102.103', true],
    ['[fd00::1]', true],
    ['fe80::1', true],
    ['172.32.0.1', false],
    ['cloud.example.com', false],
    ['8.8.8.8', false],
  ])('%s is %s', (host, home) => {
    expect(isHomeHost(host)).toBe(home);
  });
});
