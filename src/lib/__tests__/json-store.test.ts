import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createJsonStore } from '../json-store';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('read', () => {
  it('returns defaultValue when file does not exist', async () => {
    const store = createJsonStore({ path: 'data/test.json', defaultValue: { key: 'default' } });
    expect(await store.read()).toEqual({ key: 'default' });
  });

  it('parses existing JSON file', async () => {
    const dir = path.join(tmpDir, 'data');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'test.json'), JSON.stringify({ key: 'stored' }));

    const store = createJsonStore({ path: 'data/test.json', defaultValue: { key: 'default' } });
    expect(await store.read()).toEqual({ key: 'stored' });
  });

  it('returns independent copies of defaultValue (structuredClone)', async () => {
    const store = createJsonStore({ path: 'data/missing.json', defaultValue: { items: [] as string[] } });
    const a = await store.read();
    a.items.push('mutated');
    const b = await store.read();
    expect(b.items).toEqual([]);
  });
});

describe('read — errorHandling', () => {
  it('default: returns defaultValue for corrupt JSON', async () => {
    const dir = path.join(tmpDir, 'data');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'test.json'), 'not json{{{');

    const store = createJsonStore({ path: 'data/test.json', defaultValue: { ok: true } });
    expect(await store.read()).toEqual({ ok: true });
  });

  it('throw-corrupt: throws on corrupt JSON', async () => {
    const dir = path.join(tmpDir, 'data');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'test.json'), 'not json{{{');

    const store = createJsonStore({ path: 'data/test.json', defaultValue: {}, errorHandling: 'throw-corrupt' });
    await expect(store.read()).rejects.toThrow();
  });

  it('throw-corrupt: returns defaultValue for ENOENT', async () => {
    const store = createJsonStore({ path: 'data/missing.json', defaultValue: { fallback: true }, errorHandling: 'throw-corrupt' });
    expect(await store.read()).toEqual({ fallback: true });
  });
});

describe('write', () => {
  it('creates directories and writes atomically', async () => {
    const store = createJsonStore({ path: 'data/nested/test.json', defaultValue: {} });
    await store.write({ hello: 'world' });

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'nested', 'test.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ hello: 'world' });

    // No leftover .tmp file
    await expect(fs.access(path.join(tmpDir, 'data', 'nested', 'test.json.tmp'))).rejects.toThrow();
  });

  it('serializes concurrent writes', async () => {
    const store = createJsonStore({ path: 'data/test.json', defaultValue: {} });
    // Fire three writes without awaiting individually
    const p1 = store.write({ seq: 1 });
    const p2 = store.write({ seq: 2 });
    const p3 = store.write({ seq: 3 });
    await Promise.all([p1, p2, p3]);

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'test.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ seq: 3 });
  });

  it('queue recovers after a failed write', async () => {
    // Write to a path where mkdir will succeed but the dir is actually a file
    const store = createJsonStore({ path: 'data/test.json', defaultValue: {} });

    // First write succeeds
    await store.write({ first: true });

    // Sabotage: remove the data dir and put a file in its place
    await fs.rm(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data'), 'blocker');

    // Second write fails (can't mkdir because 'data' is a file)
    await expect(store.write({ second: true })).rejects.toThrow();

    // Restore
    await fs.unlink(path.join(tmpDir, 'data'));

    // Third write succeeds — queue is not permanently broken
    await store.write({ third: true });
    const raw = await fs.readFile(path.join(tmpDir, 'data', 'test.json'), 'utf-8');
    expect(JSON.parse(raw)).toEqual({ third: true });
  });
});

describe('write — backup option', () => {
  it('creates .bak with previous content before overwriting', async () => {
    const store = createJsonStore({ path: 'data/test.json', defaultValue: {}, backup: true });
    await store.write({ version: 1 });
    await store.write({ version: 2 });

    const bak = await fs.readFile(path.join(tmpDir, 'data', 'test.json.bak'), 'utf-8');
    expect(JSON.parse(bak)).toEqual({ version: 1 });

    const current = await fs.readFile(path.join(tmpDir, 'data', 'test.json'), 'utf-8');
    expect(JSON.parse(current)).toEqual({ version: 2 });
  });

  it('skips backup silently when no existing file', async () => {
    const store = createJsonStore({ path: 'data/test.json', defaultValue: {}, backup: true });
    await store.write({ first: true });

    // No .bak created on first write
    await expect(fs.access(path.join(tmpDir, 'data', 'test.json.bak'))).rejects.toThrow();
  });
});

describe('write — chmod option', () => {
  it('sets file permissions on the written file', async () => {
    const store = createJsonStore({ path: 'data/secret.json', defaultValue: {}, chmod: 0o600 });
    await store.write({ token: 'abc' });

    const stat = await fs.stat(path.join(tmpDir, 'data', 'secret.json'));
    // Check owner read/write, no group/other access
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe('filePath', () => {
  it('resolves lazily using current process.cwd()', () => {
    const store = createJsonStore({ path: 'data/test.json', defaultValue: {} });
    expect(store.filePath).toBe(path.join(tmpDir, 'data', 'test.json'));
  });
});
