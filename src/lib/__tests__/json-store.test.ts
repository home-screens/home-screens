import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('updateAtomic', () => {
  interface Counter { count: number; log: string[] }

  it('serializes concurrent read-modify-write cycles — no lost updates', async () => {
    // Regression test for the cross-surface race: two PUTs hitting the meals
    // API would both read the same `existing`, both compute their mutation,
    // and the second write would silently revert the first. updateAtomic
    // threads the read through the same write queue so each mutator sees
    // the prior mutator's result.
    const store = createJsonStore<Counter>({
      path: 'data/counter.json',
      defaultValue: { count: 0, log: [] },
    });

    // Seed initial state
    await store.write({ count: 0, log: [] });

    // Fire three concurrent increments. Each mutator awaits a small delay
    // BEFORE computing the new value to make sure the test fails without
    // serialization (the delay simulates the readMealData+compute+writeMealData
    // pause that made the old PUT handler racy).
    const increment = (tag: string) => store.updateAtomic(async (current) => {
      await new Promise((r) => setTimeout(r, 10));
      return { count: current.count + 1, log: [...current.log, tag] };
    });

    await Promise.all([increment('a'), increment('b'), increment('c')]);

    const final = await store.read();
    // All three increments must land — no updates lost
    expect(final.count).toBe(3);
    // All three tags must appear (order is serialization order — 'a','b','c'
    // by FIFO promise queue, but any order is acceptable as long as they're
    // all present).
    expect(final.log).toHaveLength(3);
    expect(final.log.sort()).toEqual(['a', 'b', 'c']);
  });

  it('a thrown mutator propagates to the caller without corrupting state', async () => {
    const store = createJsonStore<{ v: number }>({
      path: 'data/counter.json',
      defaultValue: { v: 0 },
    });
    await store.write({ v: 42 });

    const sentinel = new Error('abort-from-mutator');
    await expect(
      store.updateAtomic(() => { throw sentinel; }),
    ).rejects.toBe(sentinel);

    // File is unchanged
    const after = await store.read();
    expect(after.v).toBe(42);
  });

  it('a mutator throwing a Response (API guard pattern) short-circuits without writing', async () => {
    // The PUT /api/meals/data handler uses the same pattern: its
    // guardEmptyOverwrite helper returns a Response that the route throws
    // from inside the mutator to short-circuit. Verify the file is untouched
    // on that path.
    const store = createJsonStore<{ meals: string[] }>({
      path: 'data/meals.json',
      defaultValue: { meals: [] },
    });
    await store.write({ meals: ['existing'] });

    class FakeResponse {}
    const response = new FakeResponse();

    await expect(
      store.updateAtomic(() => { throw response; }),
    ).rejects.toBe(response);

    const after = await store.read();
    expect(after.meals).toEqual(['existing']);
  });

  it('a failed mutator does not jam the queue — subsequent updates still run', async () => {
    const store = createJsonStore<{ v: number }>({
      path: 'data/counter.json',
      defaultValue: { v: 0 },
    });
    await store.write({ v: 1 });

    // Fire a failing update and a subsequent succeeding update. The second
    // must still land even though the first rejected.
    const failing = store.updateAtomic(() => { throw new Error('boom'); });
    const succeeding = store.updateAtomic((c) => ({ v: c.v + 100 }));

    await expect(failing).rejects.toThrow('boom');
    const result = await succeeding;
    expect(result.v).toBe(101);

    const after = await store.read();
    expect(after.v).toBe(101);
  });

  it('sees writes from prior queued writes (read-through-queue semantics)', async () => {
    const store = createJsonStore<{ v: number }>({
      path: 'data/counter.json',
      defaultValue: { v: 0 },
    });

    // Queue a write and an updateAtomic without awaiting the write.
    // The updateAtomic's read must observe the prior write, not the
    // default value.
    const writePromise = store.write({ v: 7 });
    const atomicPromise = store.updateAtomic((current) => ({ v: current.v + 1 }));

    await writePromise;
    const result = await atomicPromise;
    expect(result.v).toBe(8);
  });

  it('no-op signal: returning the input reference unchanged skips the disk write', async () => {
    // Spy on `fs.writeFile` to count actual disk writes — the no-op
    // optimization is observable as "fewer writeFile calls."
    const writeSpy = vi.spyOn(fs, 'writeFile');

    const store = createJsonStore<{ v: number }>({
      path: 'data/counter.json',
      defaultValue: { v: 0 },
    });

    // Seed initial state — this consumes one writeFile call.
    await store.write({ v: 99 });
    const baselineWrites = writeSpy.mock.calls.length;

    // Mutator returns its input ref unchanged → updateAtomic should
    // detect the no-op and skip the write entirely.
    const result = await store.updateAtomic((current) => current);
    expect(result.v).toBe(99);
    expect(writeSpy.mock.calls.length).toBe(baselineWrites);

    // Sanity check: a mutator that returns a NEW reference still writes.
    await store.updateAtomic((current) => ({ v: current.v + 1 }));
    expect(writeSpy.mock.calls.length).toBe(baselineWrites + 1);

    writeSpy.mockRestore();
  });
});
