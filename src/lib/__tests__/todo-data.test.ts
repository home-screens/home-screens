import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// data/todo-state.json is resolved relative to process.cwd(), so each test runs
// in its own tmp cwd to keep parallel test files from clobbering each other.
let tmpDir: string;
let origCwd: () => string;
let readTodoState: typeof import('../todo-data').readTodoState;
let updateTodoState: typeof import('../todo-data').updateTodoState;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-todo-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  // Reset modules so the store's path is recomputed against the new cwd.
  vi.resetModules();
  const mod = await import('../todo-data');
  readTodoState = mod.readTodoState;
  updateTodoState = mod.updateTodoState;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readTodoState', () => {
  it('returns an empty completion map when the file does not exist', async () => {
    expect(await readTodoState()).toEqual({ completed: {} });
  });

  it('reads an existing completion map', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, 'todo-state.json'),
      JSON.stringify({ completed: { i1: true } }),
    );
    expect((await readTodoState()).completed.i1).toBe(true);
  });

  it('throws on corrupt JSON instead of silently returning empty', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'todo-state.json'), '{corrupt!!');
    await expect(readTodoState()).rejects.toThrow();
  });
});

describe('updateTodoState', () => {
  it('persists a flip and is readable afterward', async () => {
    await updateTodoState((cur) => ({ completed: { ...cur.completed, i1: true } }));
    expect((await readTodoState()).completed.i1).toBe(true);
  });

  it('serializes concurrent flips of different items without losing either', async () => {
    await Promise.all([
      updateTodoState((cur) => ({ completed: { ...cur.completed, i1: true } })),
      updateTodoState((cur) => ({ completed: { ...cur.completed, i2: true } })),
    ]);
    const state = await readTodoState();
    expect(state.completed).toEqual({ i1: true, i2: true });
  });

  it('returns the post-mutation state to the caller', async () => {
    const result = await updateTodoState((cur) => ({ completed: { ...cur.completed, i1: false } }));
    expect(result.completed.i1).toBe(false);
  });
});
