import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commitDataTransaction, durableWriteFile, withDataTransaction } from '../data-transaction';
import { createJsonStore, sweepStaleTempFiles } from '../json-store';
let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-data-txn-')); vi.spyOn(process, 'cwd').mockReturnValue(directory); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

describe('durable file writes', () => {
  it('keeps ordinary file permissions and private credential directories through journal publication', async () => {
    const ordinary = createJsonStore({ path: 'data/plain.json', defaultValue: {} });
    await ordinary.write({ value: 1 });
    expect((await fs.stat(ordinary.filePath)).mode & 0o777).toBe(0o666 & ~process.umask());
    const rename = fs.rename.bind(fs);
    let journalMode: number | undefined;
    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => {
      await rename(...args);
      if (String(args[1]).endsWith('/family-transaction.json')) journalMode = (await fs.stat(args[1])).mode & 0o777;
    });
    await withDataTransaction(() => commitDataTransaction({ kind: 'credentials', changes: [{
      path: 'data/plugin-tokens/demo.json', before: null, after: '{"access_token":"sample"}', mode: 0o600, dirMode: 0o700,
    }] }));
    expect(journalMode).toBe(0o600);
    expect((await fs.stat(path.join(directory, 'data/plugin-tokens'))).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(directory, 'data/plugin-tokens/demo.json'))).mode & 0o777).toBe(0o600);
  });
  it('syncs staged content before rename and the containing directory after rename', async () => {
    const events: string[] = [];
    const open = fs.open.bind(fs);
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      const target = String(args[0]);
      const sync = handle.sync.bind(handle);
      const write = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'sync').mockImplementation(async () => { events.push(target.endsWith('.tmp') ? 'sync-file' : `sync-dir:${target}`); return sync(); });
      vi.spyOn(handle, 'writeFile').mockImplementation(async (...writeArgs: Parameters<typeof handle.writeFile>) => { events.push('write-file'); return write(...writeArgs); });
      return handle;
    });
    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => { events.push('rename'); return rename(...args); });
    await durableWriteFile(path.join(directory, 'data/file.json'), '{}');
    expect(events.indexOf('write-file')).toBeLessThan(events.indexOf('sync-file'));
    expect(events.indexOf('sync-file')).toBeLessThan(events.indexOf('rename'));
    expect(events.lastIndexOf(`sync-dir:${path.join(directory, 'data')}`)).toBeGreaterThan(events.indexOf('rename'));
  });
  it('does not publish an image when file fsync fails', async () => {
    await fs.mkdir(path.join(directory, 'data'));
    const target = path.join(directory, 'data/file.json');
    await fs.writeFile(target, '{"original":true}');
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      if (String(args[0]).endsWith('.tmp')) vi.spyOn(handle, 'sync').mockRejectedValue(new Error('fsync failed'));
      return handle;
    });
    await expect(durableWriteFile(target, '{}')).rejects.toThrow('fsync failed');
    expect(await fs.readFile(target, 'utf8')).toBe('{"original":true}');
    expect((await fs.readdir(path.dirname(target))).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });
});

describe('coordinator barriers', () => {
  it('runtime-only stores keep making progress behind a held family transaction without fsync', async () => {
    const transient = createJsonStore({ path: 'data/runtime.json', defaultValue: { count: 0 }, transient: true });
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const held = withDataTransaction(async () => { entered(); await gate; });
    await ready;
    const open = vi.spyOn(fs, 'open');
    try {
      await Promise.all(Array.from({ length: 5 }, () => transient.updateAtomic(({ count }) => ({ count: count + 1 }))));
      expect(await transient.read()).toEqual({ count: 5 });
      expect(open).not.toHaveBeenCalled();
    } finally {
      release();
      await held;
    }
  });
  it('joins nested stores without recursive deadlock and excludes outside reads', async () => {
    const a = createJsonStore({ path: 'data/a.json', defaultValue: { count: 0 } });
    const b = createJsonStore({ path: 'data/b.json', defaultValue: { count: 0 } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const work = withDataTransaction(async () => {
      await Promise.all([a.write({ count: 1 }), b.write({ count: 2 })]);
      await a.updateAtomic(async (current) => ({ count: current.count + (await b.read()).count }));
      entered();
      await gate;
      await b.write({ count: 4 });
    });
    await ready;
    let finished = false;
    const read = b.read().then((data) => { finished = true; return data; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finished).toBe(false);
    release();
    await work;
    expect(await read).toEqual({ count: 4 });
    expect(await a.read()).toEqual({ count: 3 });
  });
  it('temp cleanup waits until active writers have published', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (...args: Parameters<typeof fs.rename>) => { entered(); await gate; return rename(...args); });
    const store = createJsonStore({ path: 'data/value.json', defaultValue: {} });
    const write = store.write({ saved: true });
    await ready;
    let swept = false;
    const sweep = sweepStaleTempFiles().then(() => { swept = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(swept).toBe(false);
    release();
    await Promise.all([write, sweep]);
    expect(await store.read()).toEqual({ saved: true });
  });
});

/**
 * Plan 64 requires every participating read and write path to join the
 * coordinator: API handlers, server rendering, the short-TTL config cache,
 * background work, migration and the backup export. That audit was manual, so
 * assert it: a future refactor that reads a participating store directly, or a
 * new hot path that skips the lock to go faster, fails here rather than
 * interleaving with a half-applied family transaction.
 */
describe('participating entry points join the coordinator', () => {
  it.each([
    ['readConfig', async () => { const { readConfig } = await import('../config'); return readConfig(); }],
    ['readFamilyData', async () => { const { readFamilyData } = await import('../family-data'); return readFamilyData(); }],
    ['readChoreData', async () => { const { readChoreData } = await import('../chore-data'); return readChoreData(); }],
    ['readCompletions', async () => { const { readCompletions } = await import('../chore-completion-data'); return readCompletions(); }],
    ['readRewardData', async () => { const { readRewardData } = await import('../reward-data'); return readRewardData(); }],
    ['readTodoData', async () => { const { readTodoData } = await import('../todo-data'); return readTodoData(); }],
    ['readMealData', async () => { const { readMealData } = await import('../meal-data'); return readMealData(); }],
    ['readRoutinesFile', async () => { const { readRoutinesFile } = await import('../timer-data'); return readRoutinesFile(); }],
    ['readSecrets', async () => { const { readSecrets } = await import('../secrets'); return readSecrets(); }],
  ])('%s waits for an open transaction', async (_label, entryPoint) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const holder = withDataTransaction(async () => { entered(); await gate; });
    await ready;

    let settled = false;
    const contender = entryPoint().then((value) => { settled = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled, `${_label} read participating data without holding the coordinator`).toBe(false);

    release();
    await holder;
    await expect(contender).resolves.toBeDefined();
  });

  // A cold readConfigCached blocks through readConfig underneath it, so that
  // proves nothing about the cache itself. A warm hit is the interesting case:
  // it must not hand out settings snapshotted before a family transaction
  // rewrote them, however cheap serving it would be.
  it('readConfigCached waits for an open transaction even on a warm cache hit', async () => {
    const { readConfigCached, __resetConfigReadCacheForTests } = await import('../config-cache');
    __resetConfigReadCacheForTests();
    await readConfigCached();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const holder = withDataTransaction(async () => { entered(); await gate; });
    await ready;

    let settled = false;
    const contender = readConfigCached().then((value) => { settled = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(settled, 'a warm config cache hit bypassed the coordinator').toBe(false);

    release();
    await holder;
    await expect(contender).resolves.toBeDefined();
    __resetConfigReadCacheForTests();
  });

  // These are deliberately outside the protocol: hot runtime state that is
  // never part of a journal or a restore. If one is ever added to a bundle it
  // has to lose `transient` and move into the list above.
  it.each([
    ['timer session', 'data/timer-session.json', async () => { const { readSessionFile } = await import('../timer-data'); return readSessionFile(); }],
    ['backup state', 'data/backup-state.json', async () => { const { readBackupState } = await import('../backup-state'); return readBackupState(); }],
  ])('%s stays outside the coordinator on purpose', async (_label, _file, entryPoint) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const holder = withDataTransaction(async () => { entered(); await gate; });
    await ready;
    await expect(entryPoint()).resolves.toBeDefined();
    release();
    await holder;
  });
});
