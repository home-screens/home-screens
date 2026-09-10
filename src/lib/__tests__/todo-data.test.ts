import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { TodoData, TodoList } from '@/types/todos';

// data/todos.json is resolved relative to process.cwd(), so each test runs in
// its own tmp cwd to keep parallel test files from clobbering each other.
let tmpDir: string;
let origCwd: () => string;
let mod: typeof import('../todo-data');

async function writeData(name: string, value: unknown): Promise<void> {
  const dataDir = path.join(tmpDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, name), JSON.stringify(value));
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(tmpDir, 'data', name), 'utf-8')) as T;
}

async function exists(name: string): Promise<boolean> {
  try {
    await fs.access(path.join(tmpDir, 'data', name));
    return true;
  } catch {
    return false;
  }
}

function list(overrides: Partial<TodoList> = {}): TodoList {
  return {
    id: 'l1',
    name: 'Groceries',
    slug: 'groceries',
    items: [],
    repeat: 'never',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const migrated = (lists: TodoList[]): TodoData => ({ lists, migratedFromConfig: true });
/** Alias, for tests whose own `list` binding would shadow the builder. */
const list_ = list;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-todo-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
  mod = await import('../todo-data');
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readTodoData', () => {
  it('returns no lists and marks the fold-in done on a fresh install', async () => {
    const data = await mod.readTodoData();
    expect(data.lists).toEqual([]);
    expect(data.migratedFromConfig).toBe(true);
    // Persisted, so the config scan never runs again.
    expect((await readJson<TodoData>('todos.json')).migratedFromConfig).toBe(true);
  });

  it('throws on corrupt JSON instead of silently returning empty', async () => {
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'todos.json'), '{corrupt!!');
    await expect(mod.readTodoData()).rejects.toThrow();
  });
});

describe('fold-in of pre-v2 inline items', () => {
  const legacyModule = (id: string, title: string, items: Array<{ id: string; text: string; completed: boolean }>) => ({
    id,
    type: 'todo',
    x: 0, y: 0, w: 400, h: 400,
    config: { title, items, accentColor: '#000000', interactive: true },
  });

  it('moves each module\'s items into a list, points the module at it, and strips the items', async () => {
    await writeData('config.json', {
      version: 12,
      settings: {},
      screens: [{ id: 's1', name: 'S1', modules: [
        legacyModule('m1', 'Groceries', [
          { id: 'i1', text: 'Milk', completed: false },
          { id: 'i2', text: 'Eggs', completed: true },
        ]),
      ] }],
    });
    await writeData('todo-state.json', { completed: { i1: true } });

    const data = await mod.readTodoData();
    expect(data.lists).toHaveLength(1);
    const [groceries] = data.lists;
    expect(groceries.name).toBe('Groceries');
    expect(groceries.slug).toBe('groceries');
    expect(groceries.items.map((i) => [i.id, i.text, i.completed])).toEqual([
      ['i1', 'Milk', true],   // the wall tap wins over the authored default
      ['i2', 'Eggs', true],
    ]);

    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    const cfg = config.screens[0].modules[0].config;
    expect(cfg.listId).toBe(groceries.id);
    expect(cfg.items).toBeUndefined();
    expect(cfg.interactive).toBe(true);

    expect(await exists('todo-state.json')).toBe(false);
  });

  it('shares one list between modules that carry the same items', async () => {
    const items = [{ id: 'i1', text: 'Milk', completed: false }];
    await writeData('config.json', {
      version: 12,
      settings: {},
      screens: [{ id: 's1', name: 'S1', modules: [legacyModule('m1', 'Groceries', items), legacyModule('m2', 'Groceries', items)] }],
    });
    const data = await mod.readTodoData();
    expect(data.lists).toHaveLength(1);
    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    const [a, b] = config.screens[0].modules.map((m) => m.config.listId);
    expect(a).toBe(data.lists[0].id);
    expect(b).toBe(a);
  });

  it('walks display-owned screens too and keeps slugs unique', async () => {
    await writeData('config.json', {
      version: 12,
      settings: {},
      screens: [],
      displays: [
        { id: 'kitchen', name: 'Kitchen', screens: [{ id: 's1', name: 'S1', modules: [legacyModule('m1', 'To Do', [{ id: 'a', text: 'A', completed: false }])] }] },
        { id: 'hall', name: 'Hall', screens: [{ id: 's2', name: 'S2', modules: [legacyModule('m2', 'To Do', [{ id: 'b', text: 'B', completed: false }])] }] },
      ],
    });
    const data = await mod.readTodoData();
    expect(data.lists.map((l) => l.slug).sort()).toEqual(['to_do', 'to_do_2']);
  });

  it('reuses an existing list whose items match instead of minting a twin', async () => {
    const items = [{ id: 'i1', text: 'Milk', completed: false }];
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [legacyModule('m1', 'Groceries', items)] }] });
    const first = await mod.readTodoData();
    expect(first.lists).toHaveLength(1);
    // The same layout arrives again (a re-import, a restored backup): the
    // module is folded onto the list that already holds these item ids.
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [legacyModule('m2', 'Groceries', items)] }] });
    const second = await mod.foldInLegacyTodoItemsNow();
    expect(second.lists).toHaveLength(1);
    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    expect(config.screens[0].modules[0].config.listId).toBe(first.lists[0].id);
    expect(config.screens[0].modules[0].config.items).toBeUndefined();
  });

  it('keeps a duplicated-then-edited module as its own list with fresh item ids', async () => {
    // The editor's duplicate keeps item ids; the copy then says something else.
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'Groceries', [{ id: 'i1', text: 'Milk', completed: false }]),
      legacyModule('m2', 'Camping', [{ id: 'i1', text: 'Tent', completed: false }]),
    ] }] });
    const data = await mod.readTodoData();
    expect(data.lists.map((l) => l.name).sort()).toEqual(['Camping', 'Groceries']);
    const camping = data.lists.find((l) => l.name === 'Camping')!;
    expect(camping.items[0].text).toBe('Tent');
    expect(camping.items[0].id).not.toBe('i1');
    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    const [a, b] = config.screens[0].modules.map((m) => m.config.listId);
    expect(a).not.toBe(b);
  });

  it('keeps two copies apart when the same words carry different ticks', async () => {
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'Packing', [{ id: 'p1', text: 'Tent', completed: true }, { id: 'p2', text: 'Stove', completed: false }]),
      legacyModule('m2', 'Packing', [{ id: 'p1', text: 'Tent', completed: false }, { id: 'p2', text: 'Stove', completed: false }]),
    ] }] });
    const data = await mod.readTodoData();
    expect(data.lists).toHaveLength(2);
    expect(data.lists.map((l) => l.items[0].completed).sort()).toEqual([false, true]);
    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    const [a, b] = config.screens[0].modules.map((m) => m.config.listId);
    expect(a).not.toBe(b);
    // A second pass over the same layout finds each list again rather than
    // minting more (the retry path after a failed strip).
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'Packing', [{ id: 'p1', text: 'Tent', completed: true }, { id: 'p2', text: 'Stove', completed: false }]),
      legacyModule('m2', 'Packing', [{ id: 'p1', text: 'Tent', completed: false }, { id: 'p2', text: 'Stove', completed: false }]),
    ] }] });
    const again = await mod.foldInLegacyTodoItemsNow();
    expect(again.lists).toHaveLength(2);
  });

  it('a forced fold reports its failure so a restore can roll back', async () => {
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'Groceries', [{ id: 'i1', text: 'Milk', completed: false }]),
    ] }] });
    await writeData('todos.json', { lists: [], migratedFromConfig: true });
    await fs.chmod(path.join(tmpDir, 'data'), 0o500);
    try {
      await expect(mod.foldInLegacyTodoItemsNow()).rejects.toThrow();
    } finally {
      await fs.chmod(path.join(tmpDir, 'data'), 0o700);
    }
    // An ordinary read is not broken by the same failure.
    await expect(mod.readTodoData()).resolves.toBeTruthy();
  });

  it('preserves both sources when the coordinator cannot acquire its lock', async () => {
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'Groceries', [{ id: 'i1', text: 'Milk', completed: false }]),
    ] }] });
    await writeData('todo-state.json', { completed: { i1: true } });
    // The stable lock lives beside the release directory, so it survives a
    // deploy. A directory where the lock file belongs can never be claimed or
    // read, so this fails before any migration work can start.
    await fs.mkdir(`${tmpDir}.data.lock`);
    try {
      await expect(mod.readTodoData()).rejects.toThrow();
    } finally {
      await fs.rmdir(`${tmpDir}.data.lock`);
    }
    // Both sources survive; nothing was lost, and the retry finishes the job.
    expect(await exists('todo-state.json')).toBe(true);
    const cfg = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    expect(Array.isArray(cfg.screens[0].modules[0].config.items)).toBe(true);
    const done = await mod.foldInLegacyTodoItemsNow();
    expect(done.migratedFromConfig).toBe(true);
    expect(done.lists).toHaveLength(1);
    expect(done.lists[0].items[0].completed).toBe(true);
    expect(await exists('todo-state.json')).toBe(false);
  });

  it('strips an empty legacy items array without minting an unnamed list', async () => {
    await writeData('config.json', { version: 12, settings: {}, screens: [{ id: 's1', name: 'S1', modules: [
      legacyModule('m1', 'To Do', []), legacyModule('m2', 'To Do', []),
    ] }] });
    const data = await mod.readTodoData();
    expect(data.lists).toEqual([]);
    expect(data.migratedFromConfig).toBe(true);
    const config = await readJson<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>('config.json');
    for (const m of config.screens[0].modules) {
      expect(m.config.items).toBeUndefined();
      expect(m.config.listId).toBeUndefined();
    }
  });

  it('mints nothing from the frozen top-level screens in multi-display mode', async () => {
    // `config.screens` is a stale snapshot once displays own their own; its
    // copies must lose their items without minting a second list each.
    const stale = legacyModule('m1', 'Groceries', [{ id: 'i1', text: 'Milk (old)', completed: false }]);
    const live = legacyModule('m1', 'Groceries', [{ id: 'i1', text: 'Milk', completed: false }]);
    await writeData('config.json', {
      version: 12,
      settings: {},
      screens: [{ id: 's1', name: 'S1', modules: [stale] }],
      displays: [{ id: 'main', name: 'Main', screens: [{ id: 's1', name: 'S1', modules: [live] }] }],
    });
    const data = await mod.readTodoData();
    expect(data.lists).toHaveLength(1);
    expect(data.lists[0].items[0].text).toBe('Milk');
    const config = await readJson<{
      screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }>;
      displays: Array<{ screens: Array<{ modules: Array<{ config: Record<string, unknown> }> }> }>;
    }>('config.json');
    // Both lose their inline items; only the one that renders gets a list.
    expect(config.screens[0].modules[0].config.items).toBeUndefined();
    expect(config.screens[0].modules[0].config.listId).toBeUndefined();
    expect(config.displays[0].screens[0].modules[0].config.listId).toBe(data.lists[0].id);
  });

  it('leaves the flag unset and retries when config.json cannot be read', async () => {
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'config.json'), '{not json');
    const data = await mod.readTodoData();
    expect(data.migratedFromConfig).toBeUndefined();
    expect(await exists('todos.json')).toBe(false);
  });
});

describe('repeat schedules', () => {
  it('unchecks a daily list once the local day rolls over, and records the reset', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const data = migrated([list({
      repeat: 'daily',
      lastResetAt: yesterday.toISOString(),
      items: [{ id: 'i1', text: 'Brush teeth', completed: true, completedAt: yesterday.toISOString(), createdAt: yesterday.toISOString() }],
    })]);
    const now = new Date();
    const out = mod.applyDueRepeats(data, now);
    expect(out).not.toBe(data);
    expect(out.lists[0].items[0].completed).toBe(false);
    expect(out.lists[0].items[0].completedAt).toBeUndefined();
    expect(out.lists[0].lastResetAt).toBe(now.toISOString());
    // Idempotent within the same day.
    expect(mod.applyDueRepeats(out, now)).toBe(out);
  });

  it('never touches a list that does not repeat', () => {
    const data = migrated([list({ items: [{ id: 'i1', text: 'Milk', completed: true, createdAt: '2020-01-01T00:00:00.000Z' }] })]);
    expect(mod.applyDueRepeats(data, new Date())).toBe(data);
  });

  it('weekly boundary is the most recent midnight on the repeat day', () => {
    // Wednesday 2026-09-09 10:00 local; repeat on Monday (1) -> Monday 2026-09-07 00:00.
    const now = new Date(2026, 8, 9, 10, 0, 0);
    const boundary = mod.lastRepeatBoundary({ repeat: 'weekly', repeatDay: 1 }, now)!;
    expect(boundary.getDay()).toBe(1);
    expect(boundary.getDate()).toBe(7);
    expect(boundary.getHours()).toBe(0);
    // Same day as the repeat day: the boundary is today, not last week.
    const monday = new Date(2026, 8, 7, 15, 0, 0);
    expect(mod.lastRepeatBoundary({ repeat: 'weekly', repeatDay: 1 }, monday)!.getDate()).toBe(7);
  });

  it('computes the boundary in the household timezone, not the OS clock', () => {
    // 2026-09-09T03:30Z is 22:30 on the 8th in Chicago: the Chicago day has
    // not rolled over, so a list reset at 20:00 Chicago on the 8th is not due.
    const now = new Date('2026-09-09T03:30:00.000Z');
    const chicago = mod.lastRepeatBoundary({ repeat: 'daily' }, now, 'America/Chicago')!;
    expect(chicago.getDate()).toBe(8);
    const data = migrated([list({
      repeat: 'daily',
      lastResetAt: '2026-09-08T23:30:00.000Z', // 18:30 Chicago, 8 Sep
      items: [{ id: 'i1', text: 'X', completed: true, createdAt: '2026-09-01T00:00:00.000Z' }],
    })]);
    expect(mod.applyDueRepeats(data, now, 'America/Chicago')).toBe(data);
    // In UTC that same instant is past midnight on the 9th, so it would fire.
    expect(mod.applyDueRepeats(data, now, 'UTC')).not.toBe(data);
  });

  it('the zone the repeat was set in beats the household default', () => {
    // 03:30 UTC on the 9th is 22:30 on the 8th in Chicago.
    const now = new Date('2026-09-09T03:30:00.000Z');
    const list = { repeat: 'daily' as const, repeatTimezone: 'America/Chicago' };
    expect(mod.lastRepeatBoundary(list, now, 'UTC')!.getDate()).toBe(8);
    // Without one, the household setting decides.
    expect(mod.lastRepeatBoundary({ repeat: 'daily' }, now, 'America/Chicago')!.getDate()).toBe(8);
    expect(mod.lastRepeatBoundary({ repeat: 'daily' }, now, 'UTC')!.getDate()).toBe(9);

    const data = migrated([list_({
      repeat: 'daily',
      repeatTimezone: 'America/Chicago',
      lastResetAt: '2026-09-08T23:30:00.000Z', // 18:30 Chicago, still the 8th
      items: [{ id: 'i1', text: 'X', completed: true, createdAt: '2026-09-01T00:00:00.000Z' }],
    })]);
    // The hub is on UTC and would have fired; the list's own zone says not yet.
    expect(mod.applyDueRepeats(data, now, 'UTC')).toBe(data);
  });

  it('records the zone with the schedule and drops it when the repeat stops', () => {
    const base = migrated([list_()]);
    const daily = mod.updateList(base, 'l1', { repeat: 'daily', timezone: 'America/Chicago' });
    expect(daily.lists[0].repeatTimezone).toBe('America/Chicago');
    const off = mod.updateList(daily, 'l1', { repeat: 'never', timezone: '' });
    expect(off.lists[0].repeatTimezone).toBeUndefined();
    expect(() => mod.updateList(base, 'l1', { repeat: 'daily', timezone: 'Mars/Olympus' })).toThrow(/time zone/);
  });

  it('readTodoData persists a due reset', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await writeData('todos.json', migrated([list({
      repeat: 'daily',
      lastResetAt: yesterday.toISOString(),
      items: [{ id: 'i1', text: 'X', completed: true, createdAt: yesterday.toISOString() }],
    })]));
    const data = await mod.readTodoData();
    expect(data.lists[0].items[0].completed).toBe(false);
    expect((await readJson<TodoData>('todos.json')).lists[0].items[0].completed).toBe(false);
  });
});

describe('list operations', () => {
  it('creates a list with a unique slug and validates the name', () => {
    const { data, list: made } = mod.createList(migrated([list()]), { name: '  Groceries ' });
    expect(made.name).toBe('Groceries');
    expect(made.slug).toBe('groceries_2');
    expect(data.lists).toHaveLength(2);
    expect(() => mod.createList(migrated([]), { name: '   ' })).toThrow(mod.TodoError);
    expect(() => mod.createList(migrated([]), { name: 'x'.repeat(61) })).toThrow(/60/);
    expect(() => mod.createList(migrated([]), { name: 'X', color: 'red' })).toThrow(mod.TodoError);
  });

  it('caps the number of lists', () => {
    const many = migrated(Array.from({ length: 64 }, (_, i) => list({ id: `l${i}`, slug: `s${i}` })));
    expect(() => mod.createList(many, { name: 'One more' })).toThrow(/64/);
  });

  it('renames, recolours, sets a weekly repeat with a default day, and keeps the slug', () => {
    const out = mod.updateList(migrated([list()]), 'l1', { name: 'Shopping', color: '#4ADE80', repeat: 'weekly' });
    expect(out.lists[0]).toMatchObject({ name: 'Shopping', slug: 'groceries', color: '#4ade80', repeat: 'weekly', repeatDay: 0 });
    expect(() => mod.updateList(migrated([list()]), 'nope', { name: 'X' })).toThrow(/gone/);
    expect(() => mod.updateList(migrated([list()]), 'l1', { repeat: 'hourly' })).toThrow(mod.TodoError);
    expect(() => mod.updateList(migrated([list()]), 'l1', { repeatDay: 7 })).toThrow(mod.TodoError);
  });

  it('turning on a repeat starts counting from now instead of the list\'s birthday', () => {
    const now = new Date();
    const old = migrated([list({
      createdAt: '2020-01-01T00:00:00.000Z',
      items: [{ id: 'a', text: 'A', completed: true, createdAt: '2020-01-01T00:00:00.000Z' }],
    })]);
    const daily = mod.updateList(old, 'l1', { repeat: 'daily' }, now);
    expect(daily.lists[0].lastResetAt).toBe(now.toISOString());
    // The very next read must not uncheck what was ticked today.
    expect(mod.applyDueRepeats(daily, now)).toBe(daily);
    // Moving the weekday counts as a new schedule too; an unrelated edit does not.
    const weekly = mod.updateList(daily, 'l1', { repeat: 'weekly', repeatDay: 1 }, new Date(now.getTime() + 1000));
    expect(weekly.lists[0].lastResetAt).not.toBe(daily.lists[0].lastResetAt);
    const renamed = mod.updateList(weekly, 'l1', { name: 'Shop' }, new Date(now.getTime() + 2000));
    expect(renamed.lists[0].lastResetAt).toBe(weekly.lists[0].lastResetAt);
  });

  it('reorders items only with a full permutation', () => {
    const data = migrated([list({ items: [
      { id: 'a', text: 'A', completed: false, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', text: 'B', completed: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ] })]);
    expect(mod.updateList(data, 'l1', { itemOrder: ['b', 'a'] }).lists[0].items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(() => mod.updateList(data, 'l1', { itemOrder: ['a'] })).toThrow(/changed/);
    expect(() => mod.updateList(data, 'l1', { itemOrder: ['a', 'a'] })).toThrow(/changed/);
    expect(() => mod.updateList(data, 'l1', { itemOrder: ['a', 'zz'] })).toThrow(/changed/);
  });

  it('tidy-up actions uncheck everything or drop the done items', () => {
    const data = migrated([list({ repeat: 'daily', items: [
      { id: 'a', text: 'A', completed: true, completedAt: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', text: 'B', completed: false, createdAt: '2026-01-01T00:00:00.000Z' },
    ] })]);
    const unchecked = mod.updateList(data, 'l1', { action: 'uncheck-all' });
    expect(unchecked.lists[0].items.every((i) => !i.completed && !i.completedAt)).toBe(true);
    expect(unchecked.lists[0].lastResetAt).toBeDefined();
    const cleared = mod.updateList(data, 'l1', { action: 'clear-completed' });
    expect(cleared.lists[0].items.map((i) => i.id)).toEqual(['b']);
    expect(() => mod.updateList(data, 'l1', { action: 'explode' })).toThrow(/Unknown/);
  });

  it('returns the same reference when nothing changed', () => {
    const data = migrated([list()]);
    expect(mod.updateList(data, 'l1', {})).toBe(data);
  });

  it('deletes a list', () => {
    expect(mod.deleteList(migrated([list()]), 'l1').lists).toEqual([]);
    expect(() => mod.deleteList(migrated([]), 'l1')).toThrow(/gone/);
  });
});

describe('item operations', () => {
  it('adds at the end (or the top), trimming and validating text', () => {
    const base = migrated([list({ items: [{ id: 'a', text: 'A', completed: false, createdAt: 'x' }] })]);
    const { data, item } = mod.addItem(base, 'l1', { text: '  Oat milk ', dueDate: '2026-09-10' });
    expect(item).toMatchObject({ text: 'Oat milk', completed: false, dueDate: '2026-09-10' });
    expect(data.lists[0].items.map((i) => i.id)).toEqual(['a', item.id]);
    const top = mod.addItem(base, 'l1', { text: 'First', position: 'top' });
    expect(top.data.lists[0].items[0].id).toBe(top.item.id);
    expect(() => mod.addItem(base, 'l1', { text: '' })).toThrow(/Type something/);
    expect(() => mod.addItem(base, 'l1', { text: 'x', dueDate: 'tomorrow' })).toThrow(mod.TodoError);
    expect(() => mod.addItem(base, 'l1', { text: 'x', dueDate: '2026-02-30' })).toThrow(/day we recognise/);
    expect(() => mod.addItem(base, 'zz', { text: 'x' })).toThrow(/list is gone/);
  });

  it('caps items per list', () => {
    const full = migrated([list({ items: Array.from({ length: 500 }, (_, i) => ({ id: `i${i}`, text: 'x', completed: false, createdAt: 'x' })) })]);
    expect(() => mod.addItem(full, 'l1', { text: 'one more' })).toThrow(/500/);
  });

  it('checks off with a timestamp, unchecks clearing it, and edits fields', () => {
    const base = migrated([list({ items: [{ id: 'a', text: 'A', completed: false, createdAt: 'x', dueDate: '2026-09-10' }] })]);
    const now = new Date('2026-09-09T12:00:00.000Z');
    const done = mod.updateItem(base, 'l1', 'a', { completed: true }, now);
    expect(done.lists[0].items[0]).toMatchObject({ completed: true, completedAt: now.toISOString() });
    const undone = mod.updateItem(done, 'l1', 'a', { completed: false });
    expect(undone.lists[0].items[0].completedAt).toBeUndefined();
    const edited = mod.updateItem(base, 'l1', 'a', { text: 'Bananas', dueDate: '' });
    expect(edited.lists[0].items[0]).toMatchObject({ text: 'Bananas' });
    expect(edited.lists[0].items[0].dueDate).toBeUndefined();
    expect(mod.updateItem(base, 'l1', 'a', { completed: false })).toBe(base);
    expect(() => mod.updateItem(base, 'l1', 'zz', { completed: true })).toThrow(/item is gone/);
    expect(() => mod.updateItem(base, 'l1', 'a', { completed: 'yes' })).toThrow(mod.TodoError);
  });

  it('deletes an item', () => {
    const base = migrated([list({ items: [{ id: 'a', text: 'A', completed: false, createdAt: 'x' }] })]);
    expect(mod.deleteItem(base, 'l1', 'a').lists[0].items).toEqual([]);
    expect(() => mod.deleteItem(base, 'l1', 'zz')).toThrow(/item is gone/);
  });
});

describe('validateTodoData', () => {
  it('accepts a sound store and names what is wrong with a broken one', () => {
    const good = migrated([list({ items: [{ id: 'a', text: 'A', completed: false, createdAt: 'x', dueDate: '2026-09-10' }] })]);
    expect(mod.validateTodoData(good)).toBeNull();
    expect(mod.validateTodoData([])).toMatch(/lists array/);
    expect(mod.validateTodoData({ lists: {} })).toMatch(/lists array/);
    expect(mod.validateTodoData({ lists: [{ id: 'l1' }] })).toMatch(/list 1 is missing its name/);
    expect(mod.validateTodoData(migrated([list({ repeat: 'hourly' as never })]))).toMatch(/repeat must be/);
    expect(mod.validateTodoData(migrated([list({ items: [{ id: 'a', text: 'A', completed: 'yes' as never, createdAt: 'x' }] })]))).toMatch(/completed must be/);
    expect(mod.validateTodoData(migrated([list({ items: [{ id: 'a', text: 'A', completed: false, createdAt: 'x', dueDate: '2026-02-30' }] })]))).toMatch(/dueDate/);
    expect(mod.validateTodoData(migrated([list(), list()]))).toMatch(/repeats the id/);
    expect(mod.validateTodoData(migrated([list({ repeatTimezone: 'not a zone' })]))).toMatch(/repeatTimezone/);
  });
});

describe('updateTodoData', () => {
  it('serializes concurrent writes so neither is lost', async () => {
    await writeData('todos.json', migrated([list()]));
    await Promise.all([
      mod.updateTodoData((d) => mod.addItem(d, 'l1', { text: 'One' }).data),
      mod.updateTodoData((d) => mod.addItem(d, 'l1', { text: 'Two' }).data),
    ]);
    const data = await mod.readTodoData();
    expect(data.lists[0].items.map((i) => i.text).sort()).toEqual(['One', 'Two']);
  });

  it('propagates a TodoError without advancing the file', async () => {
    await writeData('todos.json', migrated([list()]));
    await expect(mod.updateTodoData((d) => mod.addItem(d, 'l1', { text: '' }).data)).rejects.toThrow(mod.TodoError);
    expect((await readJson<TodoData>('todos.json')).lists[0].items).toEqual([]);
  });
});
