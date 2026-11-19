import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

/**
 * A stand-in for `smb3-client`: a share held in memory that answers the way
 * Samba did in testing (the statuses, the one-level `mkdir`, the `rename`
 * that will not replace), and can be told to fail or freeze at any step.
 */
type Hook = (...args: unknown[]) => unknown;
const fake = vi.hoisted(() => ({
  clients: [] as { opts: Record<string, unknown>; calls: string[]; destroyed: number }[],
  files: new Map<string, Buffer>(),
  dirs: new Set<string>(),
  shares: ['Backups', 'Media'],
  listed: [] as { name: string; type: string }[],
  hooks: {} as Record<string, Hook | undefined>,
  freezeWrites: false,
  freezeClose: false,
}));

vi.mock('smb3-client', async (importActual) => {
  const actual = await importActual<typeof import('smb3-client')>();
  const { SmbError, SmbProtocolError } = actual;
  const status = (code: number, message: string) => new SmbError({ status: code, message });
  const lower = (p: string) => p.toLowerCase();
  const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));

  class FakeClient {
    record: { opts: Record<string, unknown>; calls: string[]; destroyed: number };
    conn: { transport: { socket: { destroy: () => void } } } | null = null;
    private frozen: (() => void)[] = [];

    constructor(opts: Record<string, unknown>) {
      this.record = { opts, calls: [], destroyed: 0 };
      fake.clients.push(this.record);
    }
    private log(call: string) {
      this.record.calls.push(call);
      return fake.hooks[call.split(' ')[0]];
    }
    private freeze<T>(): Promise<T> {
      return new Promise<T>((_resolve, reject) => {
        this.frozen.push(() => reject(new SmbProtocolError({ status: 0, message: 'connection closed' })));
      });
    }
    private requireFolder(p: string) {
      const parent = parentOf(p);
      if (!fake.dirs.has(lower(parent))) throw status(0xc000003a, 'CREATE failed: STATUS_OBJECT_PATH_NOT_FOUND');
    }
    async connect() {
      await this.log('connect')?.();
      this.conn = {
        transport: {
          socket: {
            destroy: () => {
              this.record.destroyed++;
              for (const kill of this.frozen.splice(0)) kill();
            },
          },
        },
      };
    }
    async stat(p: string) {
      const hooked = await this.log(`stat ${p}`)?.(p);
      if (hooked) return hooked;
      if (!p.includes('/')) {
        if (!fake.shares.some((s) => lower(s) === lower(p))) throw status(0xc00000cc, 'TREE_CONNECT failed: STATUS_BAD_NETWORK_NAME');
        return { size: 0, isDirectory: true };
      }
      const file = fake.files.get(lower(p));
      if (file) return { size: file.length, isDirectory: false };
      if (fake.dirs.has(lower(p))) return { size: 0, isDirectory: true };
      throw status(0xc0000034, 'CREATE failed: STATUS_OBJECT_NAME_NOT_FOUND');
    }
    async mkdir(p: string) {
      await this.log(`mkdir ${p}`)?.(p);
      this.requireFolder(p);
      if (fake.dirs.has(lower(p))) throw status(0xc0000035, 'CREATE failed: STATUS_OBJECT_NAME_COLLISION');
      fake.dirs.add(lower(p));
    }
    createWriteStream(p: string) {
      this.log(`createWriteStream ${p}`);
      const chunks: Buffer[] = [];
      return new Writable({
        write: (chunk: Buffer, _encoding, callback) => {
          try {
            this.requireFolder(p);
          } catch (err) {
            callback(err as Error);
            return;
          }
          chunks.push(chunk);
          fake.files.set(lower(p), Buffer.concat(chunks));
          if (fake.freezeWrites) {
            this.freeze<void>().catch((err) => callback(err));
            return;
          }
          const hook = fake.hooks.write;
          if (hook) {
            try {
              hook(p);
            } catch (err) {
              callback(err as Error);
              return;
            }
          }
          callback();
        },
      });
    }
    async writeFile(p: string, data: string | Buffer) {
      await this.log(`writeFile ${p}`)?.(p);
      this.requireFolder(p);
      fake.files.set(lower(p), Buffer.from(data));
    }
    async rename(from: string, to: string) {
      await this.log(`rename ${from} ${to}`)?.(from, to);
      const file = fake.files.get(lower(from));
      if (!file) throw status(0xc0000034, 'CREATE failed: STATUS_OBJECT_NAME_NOT_FOUND');
      if (fake.files.has(lower(to))) throw status(0xc0000035, 'SET_INFO rename failed: STATUS_OBJECT_NAME_COLLISION');
      fake.files.delete(lower(from));
      fake.files.set(lower(to), file);
    }
    async rm(p: string) {
      await this.log(`rm ${p}`)?.(p);
      if (!fake.files.delete(lower(p))) throw status(0xc0000034, 'CREATE failed: STATUS_OBJECT_NAME_NOT_FOUND');
    }
    async listShares() {
      await this.log('listShares')?.();
      return fake.listed;
    }
    async close() {
      this.log('close');
      if (fake.freezeClose) await this.freeze<void>().catch(() => {});
    }
    // Sending a backup never reads; these record the call so a test can say so.
    async readFile(p: string) { this.log(`READ ${p}`); throw new Error('read'); }
    createReadStream(p: string) { this.log(`READ ${p}`); throw new Error('read'); }
    async readdir(p: string) { this.log(`READ ${p}`); throw new Error('read'); }
  }
  return { ...actual, Client: FakeClient };
});

import { SmbAuthError, SmbError, SmbProtocolError } from 'smb3-client';
import { SMB_LIMITS, connectHost, deleteFile, outcomeForSmbError, sharePath, testDestination, uploadFile } from '../smb-upload';
import type { ShareDestination } from '../storage-destination';

const DEST: ShareDestination = { kind: 'smb', host: 'nas.local', share: 'Backups', folder: 'home-screens', username: 'taylor', password: 'pw' };
const NAME = 'home-screens-auto-backup-2026-11-19-0300.json';
const LIMITS = { ...SMB_LIMITS };

async function localFile(contents: string): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'smb-test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, NAME);
  await fs.writeFile(file, contents);
  return file;
}

function stored(p: string): string | undefined {
  return fake.files.get(p.toLowerCase())?.toString();
}

function allCalls(): string[] {
  return fake.clients.flatMap((c) => c.calls);
}

beforeEach(() => {
  fake.clients.length = 0;
  fake.files.clear();
  fake.dirs.clear();
  fake.dirs.add('backups');
  fake.dirs.add('media');
  fake.shares = ['Backups', 'Media'];
  fake.listed = [];
  fake.hooks = {};
  fake.freezeWrites = false;
  fake.freezeClose = false;
  Object.assign(SMB_LIMITS, LIMITS);
});

afterEach(() => {
  // Nothing here ever reads from the share (see the top of smb-upload.ts).
  expect(allCalls().filter((call) => call.startsWith('READ'))).toEqual([]);
});

describe('uploadFile', () => {
  it('makes the folder, writes under a temporary name, then gives the file its name', async () => {
    const file = await localFile('{"_type":"home-screens-backup"}');
    expect(await uploadFile(DEST, file, NAME)).toEqual({ ok: true });
    expect(stored(`Backups/home-screens/${NAME}`)).toBe('{"_type":"home-screens-backup"}');
    expect(stored(`Backups/home-screens/${NAME}.partial`)).toBeUndefined();
    const [client] = fake.clients;
    expect(client.opts).toMatchObject({ host: 'nas.local', username: 'taylor', password: 'pw' });
    expect(client.opts).not.toHaveProperty('signing');
    expect(client.calls).toEqual([
      'connect',
      'stat Backups',
      'mkdir Backups/home-screens',
      `createWriteStream Backups/home-screens/${NAME}.partial`,
      `stat Backups/home-screens/${NAME}.partial`,
      `rename Backups/home-screens/${NAME}.partial Backups/home-screens/${NAME}`,
      'close',
    ]);
    expect(client.destroyed).toBe(1);
  });

  it('uses a new connection for every call, and passes the port and domain when there are any', async () => {
    const file = await localFile('{}');
    await uploadFile({ ...DEST, port: 1445, domain: 'HOME' }, file, NAME);
    await uploadFile(DEST, file, 'second.json');
    expect(fake.clients).toHaveLength(2);
    expect(fake.clients[0].opts).toMatchObject({ port: 1445, domain: 'HOME' });
    expect(fake.clients[1].opts).not.toHaveProperty('port');
  });

  it('makes a folder two levels deep one level at a time, and is fine when it is already there', async () => {
    const file = await localFile('{}');
    fake.dirs.add('backups/family');
    expect(await uploadFile({ ...DEST, folder: 'family/hub' }, file, NAME)).toEqual({ ok: true });
    expect(fake.clients[0].calls.filter((c) => c.startsWith('mkdir'))).toEqual(['mkdir Backups/family', 'mkdir Backups/family/hub']);
    expect(stored(`Backups/family/hub/${NAME}`)).toBe('{}');
  });

  it('writes straight into the share when there is no folder', async () => {
    const file = await localFile('{}');
    expect(await uploadFile({ ...DEST, folder: '' }, file, NAME)).toEqual({ ok: true });
    expect(stored(`Backups/${NAME}`)).toBe('{}');
  });

  it('replaces a copy by the same name left by a run that stopped before writing it down', async () => {
    const file = await localFile('new');
    fake.dirs.add('backups/home-screens');
    fake.files.set(`backups/home-screens/${NAME}`.toLowerCase(), Buffer.from('old'));
    expect(await uploadFile(DEST, file, NAME)).toEqual({ ok: true });
    expect(stored(`Backups/home-screens/${NAME}`)).toBe('new');
  });

  it('refuses a copy that did not all arrive, and removes the half-sent file', async () => {
    const file = await localFile('{"whole":true}');
    fake.hooks.stat = (p) => (String(p).endsWith('.partial') ? { size: 3 } : undefined);
    const outcome = await uploadFile(DEST, file, NAME);
    expect(outcome).toMatchObject({ ok: false, code: 'refused' });
    expect(stored(`Backups/home-screens/${NAME}.partial`)).toBeUndefined();
    expect(stored(`Backups/home-screens/${NAME}`)).toBeUndefined();
  });

  it('says the storage is out of room and removes what it wrote', async () => {
    const file = await localFile('x'.repeat(200_000));
    fake.hooks.write = () => { throw new SmbError({ status: 0xc000007f, message: 'WRITE failed: STATUS_DISK_FULL' }); };
    expect(await uploadFile(DEST, file, NAME)).toMatchObject({ ok: false, code: 'no-room' });
    expect(stored(`Backups/home-screens/${NAME}.partial`)).toBeUndefined();
  });

  it('a name that may only look gets the no-write reason', async () => {
    const file = await localFile('{}');
    fake.hooks.mkdir = () => { throw new SmbError({ status: 0xc0000022, message: 'CREATE failed: STATUS_ACCESS_DENIED' }); };
    expect(await uploadFile(DEST, file, NAME)).toMatchObject({ ok: false, code: 'no-write' });
  });

  it('does not try to tidy up over a connection that has gone', async () => {
    const file = await localFile('{}');
    fake.hooks.write = () => { throw new SmbProtocolError({ status: 0, message: 'connection closed' }); };
    expect(await uploadFile(DEST, file, NAME)).toMatchObject({ ok: false, code: 'unreachable' });
    expect(fake.clients[0].calls.some((c) => c.startsWith('rm'))).toBe(false);
  });

  it('says why when the copy on the hub cannot be read', async () => {
    expect(await uploadFile(DEST, '/no/such/file.json', NAME)).toMatchObject({ ok: false, code: 'refused' });
    expect(fake.clients).toHaveLength(0);
  });

  it('gives up on a frozen storage, closing the socket rather than waiting for a goodbye', async () => {
    Object.assign(SMB_LIMITS, { idleMs: 100, watchMs: 10, closeGraceMs: 50 });
    fake.freezeWrites = true;
    fake.freezeClose = true;
    const file = await localFile('x'.repeat(100_000));
    const started = Date.now();
    expect(await uploadFile(DEST, file, NAME)).toMatchObject({ ok: false, code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(fake.clients[0].destroyed).toBeGreaterThanOrEqual(1);
  });

  it('gives up when the whole send runs past its limit, even before the idle limit', async () => {
    Object.assign(SMB_LIMITS, { baseMs: 80, bytesPerSecondFloor: Number.MAX_SAFE_INTEGER, idleMs: 60_000, watchMs: 10, closeGraceMs: 20 });
    fake.freezeWrites = true;
    const file = await localFile('{}');
    const started = Date.now();
    expect(await uploadFile(DEST, file, NAME)).toMatchObject({ ok: false, code: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('does not wait forever for a storage that will not say goodbye after a good send', async () => {
    Object.assign(SMB_LIMITS, { closeGraceMs: 50 });
    fake.freezeClose = true;
    const file = await localFile('{}');
    expect(await uploadFile(DEST, file, NAME)).toEqual({ ok: true });
    expect(fake.clients[0].destroyed).toBe(1);
  });
});

describe('deleteFile', () => {
  it('removes the copy and any half-sent copy of it', async () => {
    fake.dirs.add('backups/home-screens');
    fake.files.set(`backups/home-screens/${NAME}`.toLowerCase(), Buffer.from('a'));
    fake.files.set(`backups/home-screens/${NAME}.partial`.toLowerCase(), Buffer.from('b'));
    expect(await deleteFile(DEST, NAME)).toEqual({ ok: true });
    expect(fake.files.size).toBe(0);
  });

  it('counts a copy already gone, or a folder already gone, as removed', async () => {
    expect(await deleteFile(DEST, NAME)).toEqual({ ok: true });
  });

  it('reports a refusal', async () => {
    fake.hooks.rm = () => { throw new SmbError({ status: 0xc0000022, message: 'STATUS_ACCESS_DENIED' }); };
    expect(await deleteFile(DEST, NAME)).toMatchObject({ ok: false, code: 'no-write' });
  });
});

describe('testDestination', () => {
  it('saves a small file in the folder and removes it again', async () => {
    expect(await testDestination(DEST)).toEqual({ ok: true });
    const calls = fake.clients[0].calls;
    expect(calls).toContain('writeFile Backups/home-screens/home-screens-test.txt');
    expect(calls).toContain('rm Backups/home-screens/home-screens-test.txt');
    expect(fake.files.size).toBe(0);
  });

  it('offers the shares the storage has when the name is wrong, without hidden or printer shares', async () => {
    fake.listed = [
      { name: 'Media', type: 'disk' },
      { name: 'IPC$', type: 'ipc' },
      { name: 'Secret$', type: 'disk' },
      { name: 'Printer', type: 'print' },
      { name: 'Backups', type: 'disk' },
      { name: 'family', type: 'disk' },
    ];
    expect(await testDestination({ ...DEST, share: 'Backup' })).toMatchObject({ ok: false, code: 'share-not-found', shares: ['Backups', 'family', 'Media'] });
  });

  it('still answers when the storage will not list its shares', async () => {
    fake.hooks.listShares = () => { throw new SmbError({ status: 0xc0000022, message: 'STATUS_ACCESS_DENIED' }); };
    const outcome = await testDestination({ ...DEST, share: 'Backup' });
    expect(outcome).toMatchObject({ ok: false, code: 'share-not-found' });
    expect(outcome).not.toHaveProperty('shares');
  });
});

describe('outcomeForSmbError', () => {
  const smb = (status: number) => new SmbError({ status, message: 'x' });
  const closed = () => new SmbProtocolError({ status: 0, message: 'connection closed' });
  const sys = (code: string) => Object.assign(new Error(code), { code });

  it.each([
    ['a refused sign-in', new SmbAuthError({ status: 0xc000006d, message: 'x' }), 'connect', 'sign-in'],
    ['a locked account', smb(0xc0000234), 'share', 'sign-in'],
    ['a hang-up while connecting (SMB 1 only)', closed(), 'connect', 'too-old'],
    ['a hang-up on the first look at the share (an unknown name signed in as a guest)', closed(), 'share', 'sign-in'],
    ['a hang-up part way through', closed(), 'work', 'unreachable'],
    ['a share that is not there', smb(0xc00000cc), 'share', 'share-not-found'],
    ['a name not let into the share', smb(0xc0000022), 'share', 'no-write'],
    ['a name that may only look', smb(0xc0000022), 'work', 'no-write'],
    ['a full share', smb(0xc000007f), 'work', 'no-room'],
    ['a used-up quota', smb(0xc0000044), 'work', 'no-room'],
    ['a folder that could not be made', smb(0xc000003a), 'work', 'not-found'],
    ['nothing listening', sys('ECONNREFUSED'), 'connect', 'unreachable'],
    ['a name nobody knows', sys('ENOTFOUND'), 'connect', 'unreachable'],
    ['no answer at all', new Error('connect timeout after 10000ms'), 'connect', 'unreachable'],
    ['anything else', smb(0xc00000bb), 'work', 'refused'],
  ] as const)('%s', (_label, err, phase, code) => {
    expect(outcomeForSmbError(err, phase)).toMatchObject({ ok: false, code });
  });

  it('keeps the status in the detail, never a password', () => {
    expect(outcomeForSmbError(smb(0xc000007f), 'work')).toMatchObject({ detail: expect.stringContaining('STATUS_DISK_FULL') });
  });
});

describe('connectHost', () => {
  it('takes the brackets off an IPv6 address and leaves everything else alone', () => {
    expect(connectHost('[fd00::20]')).toBe('fd00::20');
    expect(connectHost('nas.local')).toBe('nas.local');
    expect(connectHost('192.168.1.20')).toBe('192.168.1.20');
  });

  it('is what the connection is given', async () => {
    const file = path.join(process.cwd(), 'data', 'smb-test', 'v6.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{}');
    await uploadFile({ ...DEST, host: '[fd00::20]' }, file, 'v6.json');
    expect(fake.clients[0].opts.host).toBe('fd00::20');
  });
});

describe('sharePath', () => {
  it('is share/folder/name with any empty parts left out', () => {
    expect(sharePath(DEST, NAME)).toBe(`Backups/home-screens/${NAME}`);
    expect(sharePath({ ...DEST, folder: 'a/b' })).toBe('Backups/a/b');
    expect(sharePath({ ...DEST, folder: '' }, NAME)).toBe(`Backups/${NAME}`);
  });
});
