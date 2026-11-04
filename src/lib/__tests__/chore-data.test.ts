import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../family-data', () => ({ settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));

let tmpDir: string;
let origCwd: () => string;
let readChoreData: typeof import('../chore-data').readChoreData;
let writeChoreList: typeof import('../chore-data').writeChoreList;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-chore-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;

  // Reset modules so DATA_FILE is recomputed with the new cwd
  vi.resetModules();
  const mod = await import('../chore-data');
  readChoreData = mod.readChoreData;
  writeChoreList = mod.writeChoreList;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readChoreData', () => {
  it('returns empty data when file does not exist', async () => {
    const data = await readChoreData();
    expect(data).toEqual({ chores: [], settings: { grabLimit: 1, grabHold: 'day' } });
  });

  it('reads existing chore data', async () => {
    const choreData = {
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
    expect(result).not.toHaveProperty('members');
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

const chore = (id: string, name: string): import('@/types/config').ChoreDefinition => ({
  id, name, emoji: '', points: 1, frequency: 'daily', daysOfWeek: [],
  timeOfDay: 'anytime', assigneeIds: [], rotation: 'fixed',
});

describe('writeChoreList', () => {
  it('writes data to data/chores.json', async () => {
    await writeChoreList([chore('bob', 'Dishes')]);

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const written = JSON.parse(raw);
    expect(written.chores[0].name).toBe('Dishes');
  });

  it('creates data directory if it does not exist', async () => {
    await writeChoreList([]);
    const stat = await fs.stat(path.join(tmpDir, 'data'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates a backup before overwriting', async () => {
    await writeChoreList([chore('1', 'Original')]);
    await writeChoreList([chore('2', 'Updated')]);

    const bakRaw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json.bak'), 'utf-8');
    const backup = JSON.parse(bakRaw);
    expect(backup.chores[0].name).toBe('Original');

    const currentRaw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const current = JSON.parse(currentRaw);
    expect(current.chores[0].name).toBe('Updated');
  });

  it('serializes writes to avoid race conditions', async () => {
    // Write two values concurrently — the second should win
    const p1 = writeChoreList([chore('1', 'First')]);
    const p2 = writeChoreList([chore('2', 'Second')]);
    await Promise.all([p1, p2]);

    const raw = await fs.readFile(path.join(tmpDir, 'data', 'chores.json'), 'utf-8');
    const written = JSON.parse(raw);
    expect(written.chores[0].name).toBe('Second');
  });
});

describe('validateChoreList', () => {
  // Pure: the rule the chore save and a backup restore share, so a static
  // import is fine beside the per-test module reset above.
  const validate = async (chores: unknown) => (await import('../chore-data')).validateChoreList(chores);
  const base = { ...chore('c1', 'Dishes'), assigneeIds: ['a'] };

  it('accepts a well formed list, a bonus chore and a schedule naming its groups', async () => {
    expect(await validate([
      base,
      { ...base, id: 'c2', bonus: { claim: 'first', comesBack: 'daily' }, groupSchedule: { kids: [1] } },
      { ...base, id: 'c3', assigneeGroupIds: ['kids'], rotation: 'schedule', schedule: { a: [0, 6] }, groupSchedule: { kids: [1, 3] } },
    ])).toBeNull();
  });

  it.each([
    ['not a list', 'nope', 'Chore data needs a list of chores.'],
    ['an entry without an id', { ...base, id: '' }, 'Each chore needs an id.'],
    ['assignees that are not ids', { ...base, assigneeIds: 'a' }, 'Each chore needs a list of who it goes to.'],
    ['groups that are not ids', { ...base, assigneeGroupIds: 'kids' }, 'Each chore needs a list of who it goes to.'],
    ['a schedule day outside the week', { ...base, schedule: { a: [7] } }, 'A chore schedule needs days for each person or group on it.'],
    ['a regular chore scheduling a group it does not go to', { ...base, groupSchedule: { kids: [1] } }, 'A chore schedule needs days for each person or group on it.'],
    ['negative tickets', { ...base, points: -1 }, 'Tickets for a chore must be 0 or more.'],
    ['tickets that are not a number', { ...base, points: '3' }, 'Tickets for a chore must be 0 or more.'],
    ['a bonus without a kind', { ...base, bonus: { comesBack: 'daily' } }, 'A bonus chore needs a kind and a time it comes back.'],
  ])('refuses %s', async (_name, entry, message) => {
    expect(await validate(typeof entry === 'string' ? entry : [entry])).toBe(message);
  });

  it('checks the whole file through validateChoreData', async () => {
    const { validateChoreData } = await import('../chore-data');
    expect(validateChoreData({ chores: [base], settings: { grabLimit: 2 } })).toBeNull();
    expect(validateChoreData([base])).toBe('Chore data needs a list of chores.');
    expect(validateChoreData({ chores: [{ ...base, points: -2 }] })).toBe('Tickets for a chore must be 0 or more.');
  });
});
