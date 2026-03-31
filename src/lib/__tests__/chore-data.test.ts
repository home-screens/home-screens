import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;
let origCwd: () => string;
let readChoreData: typeof import('../chore-data').readChoreData;
let writeChoreData: typeof import('../chore-data').writeChoreData;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-chore-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  // Reset modules so DATA_FILE is recomputed with the new cwd
  vi.resetModules();
  const mod = await import('../chore-data');
  readChoreData = mod.readChoreData;
  writeChoreData = mod.writeChoreData;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readChoreData', () => {
  it('returns empty data when file does not exist', async () => {
    const data = await readChoreData();
    expect(data).toEqual({ members: [], chores: [] });
  });

  it('reads existing chore data', async () => {
    const choreData = {
      members: [{ id: 'alice', name: 'Alice', emoji: '', color: '#f00' }],
      chores: [
        {
          id: 'chore-1',
          name: 'Dishes',
          emoji: '🍽️',
          points: 1,
          frequency: 'daily',
          daysOfWeek: [],
          timeOfDay: 'morning',
          assigneeIds: ['alice'],
          rotation: 'fixed',
        },
      ],
    };

    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'chores.json'), JSON.stringify(choreData));

    const result = await readChoreData();
    expect(result.members).toHaveLength(1);
    expect(result.members[0].name).toBe('Alice');
    expect(result.chores).toHaveLength(1);
    expect(result.chores[0].name).toBe('Dishes');
  });

  it('throws on corrupt JSON instead of returning empty', async () => {
    const dataDir = path.join(tmpDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'chores.json'), '{corrupt!!');

    await expect(readChoreData()).rejects.toThrow();
  });
});

describe('writeChoreData', () => {
  it('writes data to data/chores.json', async () => {
    const choreData = {
      members: [{ id: 'bob', name: 'Bob', emoji: '', color: '#00f' }],
      chores: [],
    };

    await writeChoreData(choreData);

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const written = JSON.parse(raw);
    expect(written.members[0].name).toBe('Bob');
  });

  it('creates data directory if it does not exist', async () => {
    await writeChoreData({ members: [], chores: [] });
    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates a backup before overwriting', async () => {
    const original = { members: [{ id: '1', name: 'Original', emoji: '', color: '#000' }], chores: [] };
    await writeChoreData(original);

    const updated = { members: [{ id: '2', name: 'Updated', emoji: '', color: '#111' }], chores: [] };
    await writeChoreData(updated);

    const bakRaw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json.bak'), 'utf-8');
    const backup = JSON.parse(bakRaw);
    expect(backup.members[0].name).toBe('Original');

    const currentRaw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const current = JSON.parse(currentRaw);
    expect(current.members[0].name).toBe('Updated');
  });

  it('serializes writes to avoid race conditions', async () => {
    // Write two values concurrently — the second should win
    const data1 = { members: [{ id: '1', name: 'First', emoji: '', color: '#000' }], chores: [] };
    const data2 = { members: [{ id: '2', name: 'Second', emoji: '', color: '#111' }], chores: [] };

    const p1 = writeChoreData(data1);
    const p2 = writeChoreData(data2);
    await Promise.all([p1, p2]);

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const written = JSON.parse(raw);
    expect(written.members[0].name).toBe('Second');
  });
});
