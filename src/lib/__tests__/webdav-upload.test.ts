import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Readable } from 'node:stream';

// Every file the upload opens, so a test can see it was closed again.
const opened = vi.hoisted(() => [] as Readable[]);
vi.mock('fs', async (importActual) => {
  const actual = await importActual<typeof import('fs')>();
  const createReadStream = ((...args: Parameters<typeof actual.createReadStream>) => {
    const stream = actual.createReadStream(...args);
    opened.push(stream);
    return stream;
  }) as typeof actual.createReadStream;
  return { ...actual, default: { ...actual, createReadStream }, createReadStream };
});
import { deleteFile, fileUrl, outcomeForError, testDestination, uploadFile, TEST_FILE_NAME } from '../webdav-upload';
import type { WebdavDestination } from '../auto-backup-secrets';

/**
 * A tiny WebDAV folder: PUT stores, DELETE removes, with Basic sign-in.
 * `mode` makes it answer the way a real storage box does when something is
 * wrong.
 */
let mode: 'ok' | 'full' | 'redirect' | 'too-big' | 'error' = 'ok';
const stored = new Map<string, Buffer>();
const seen: { method: string; url: string; contentLength?: string; chunked: boolean }[] = [];
let server: http.Server;
let base: string;

const GOOD = { username: 'taylor', password: 'pa:ss word' };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, contentLength: req.headers['content-length'], chunked: req.headers['transfer-encoding'] === 'chunked' });
      const expected = `Basic ${Buffer.from(`${GOOD.username}:${GOOD.password}`).toString('base64')}`;
      if (req.headers.authorization !== expected) { res.writeHead(401).end(); return; }
      if (!req.url!.startsWith('/dav/Backups/')) { res.writeHead(409).end(); return; }
      if (mode === 'full') { res.writeHead(507).end(); return; }
      if (mode === 'too-big') { res.writeHead(413).end(); return; }
      if (mode === 'error') { res.writeHead(500).end(); return; }
      if (mode === 'redirect') { res.writeHead(301, { Location: 'http://elsewhere.example/' }).end(); return; }
      const name = decodeURIComponent(req.url!.slice('/dav/Backups/'.length));
      if (req.method === 'PUT') { stored.set(name, Buffer.concat(chunks)); res.writeHead(201).end(); return; }
      if (req.method === 'DELETE') { res.writeHead(stored.delete(name) ? 204 : 404).end(); return; }
      res.writeHead(405).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  mode = 'ok';
  stored.clear();
  seen.length = 0;
});

function dest(overrides: Partial<WebdavDestination> = {}): WebdavDestination {
  return { kind: 'webdav', url: `${base}/dav/Backups/`, ...GOOD, ...overrides };
}

async function localFile(name: string, contents: string): Promise<string> {
  const dir = path.join(process.cwd(), 'data', 'webdav-test');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await fs.writeFile(file, contents);
  return file;
}

describe('uploadFile', () => {
  it('sends the file under its own name with its real length', async () => {
    const file = await localFile('home-screens-auto-backup-2026-11-16-0300.json', '{"_type":"home-screens-backup"}');
    const outcome = await uploadFile(dest(), file, 'home-screens-auto-backup-2026-11-16-0300.json');
    expect(outcome).toEqual({ ok: true });
    expect(stored.get('home-screens-auto-backup-2026-11-16-0300.json')?.toString()).toBe('{"_type":"home-screens-backup"}');
    expect(seen[0]).toMatchObject({ method: 'PUT', contentLength: '31', chunked: false });
  });

  it.each([
    ['a refused sign-in', { password: 'wrong' }, 'ok', 'sign-in'],
    ['a folder that is not there', { url: `${'BASE'}/nope/` }, 'ok', 'not-found'],
    ['a full storage', {}, 'full', 'no-room'],
    ['a file too big for it', {}, 'too-big', 'too-big'],
    ['a redirect', {}, 'redirect', 'refused-redirect'],
    ['any other answer', {}, 'error', 'refused'],
  ] as const)('answers %s with its code', async (_label, overrides, serverMode, code) => {
    mode = serverMode;
    const file = await localFile('copy.json', '{}');
    const target = 'url' in overrides ? { url: overrides.url.replace('BASE', base) } : overrides;
    const outcome = await uploadFile(dest(target), file, 'copy.json');
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.code).toBe(code === 'refused-redirect' ? 'redirect' : code);
  });

  it('never follows a redirect, so the password does not go to another host', async () => {
    mode = 'redirect';
    const file = await localFile('copy.json', '{}');
    await uploadFile(dest(), file, 'copy.json');
    expect(seen).toHaveLength(1);
  });

  it('says it cannot reach a storage that is not there', async () => {
    const file = await localFile('copy.json', '{}');
    const outcome = await uploadFile(dest({ url: 'http://127.0.0.1:1/dav/' }), file, 'copy.json');
    expect(outcome).toMatchObject({ ok: false, code: 'unreachable' });
  });

  it('closes the file it was sending when the request fails, so retries do not pile up open files', async () => {
    const file = await localFile('big.json', 'x'.repeat(2 * 1024 * 1024));
    opened.length = 0;
    const outcome = await uploadFile(dest({ url: 'http://127.0.0.1:1/dav/' }), file, 'big.json');
    expect(outcome).toMatchObject({ ok: false, code: 'unreachable' });
    expect(opened).toHaveLength(1);
    expect(opened[0].destroyed).toBe(true);
  });
});

describe('deleteFile', () => {
  it('removes a file, and counts one already gone as removed', async () => {
    stored.set('old.json', Buffer.from('{}'));
    expect(await deleteFile(dest(), 'old.json')).toEqual({ ok: true });
    expect(stored.has('old.json')).toBe(false);
    expect(await deleteFile(dest(), 'old.json')).toEqual({ ok: true });
  });
});

describe('testDestination', () => {
  it('saves a small file and removes it again', async () => {
    expect(await testDestination(dest())).toEqual({ ok: true });
    expect(seen.map((r) => r.method)).toEqual(['PUT', 'DELETE']);
    expect(seen[0].url).toBe(`/dav/Backups/${TEST_FILE_NAME}`);
    expect(stored.size).toBe(0);
  });

  it('answers the same codes as an upload', async () => {
    expect(await testDestination(dest({ password: 'nope' }))).toMatchObject({ ok: false, code: 'sign-in' });
  });
});

describe('fileUrl', () => {
  it('puts the name inside the folder, encoded, with or without a trailing slash', () => {
    expect(fileUrl('https://cloud.example.com/remote.php/dav/files/taylor/Backups/', 'a b.json').toString())
      .toBe('https://cloud.example.com/remote.php/dav/files/taylor/Backups/a%20b.json');
    expect(fileUrl('https://nas.local:5006/home/Backups', 'x.zip').toString()).toBe('https://nas.local:5006/home/Backups/x.zip');
  });
});

describe('outcomeForError', () => {
  it('tells a certificate problem apart from an unreachable storage', () => {
    expect(outcomeForError(Object.assign(new Error('self signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }))).toMatchObject({ code: 'certificate' });
    expect(outcomeForError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toMatchObject({ code: 'unreachable' });
  });
});
