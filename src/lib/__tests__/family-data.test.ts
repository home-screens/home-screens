import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { familyRevision, readFamilyData, replaceFamilyMembers, settleFamilyMigration, type ReplaceFamilyInput } from '../family-data';
import { withDataTransaction, commitDataTransaction, readTransactionFile, DataTransactionError } from '../data-transaction';
const now = '2026-09-09T12:00:00.000Z';
const member = (id: string, name = id) => ({ id, name, color: '#60a5fa', emoji: '🙂', createdAt: now, updatedAt: now });
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-family-')); await fs.mkdir(path.join(root, 'data')); vi.spyOn(process, 'cwd').mockReturnValue(root); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

describe('family migration and revisions', () => {
  it('folds full files durably, preserves references and evidence, and runs byte-identically twice', async () => {
    await put('chores.json', { members: [{ id: 'c', name: 'Chris', color: '#60a5fa', emoji: '🙂' }], chores: [{ id: 'job', assigneeIds: ['c'], schedule: { c: [1] } }] });
    await put('config.json', { version: 12, settings: { calendar: { people: [{ id: 'cal', name: 'Chris', color: '#60a5fa', sourceIds: ['work'] }] } }, screens: [] });
    await put('rewards.json', { balances: { c: 8 }, rewards: [], redemptions: [] });
    await settleFamilyMigration();
    const first = await fs.readFile(path.join(root, 'data/family.json'), 'utf8');
    expect(await read('family.json')).toMatchObject({ migrated: true, aliasIds: { cal: 'c' } });
    expect(await read('chores.json')).toEqual({ chores: [{ id: 'job', assigneeIds: ['c'], schedule: { c: [1] } }] });
    expect((await read('config.json')).settings.calendar).toEqual({ personSources: { c: ['work'] } });
    expect((await read('rewards.json')).balances.c).toBe(8);
    expect((await read('family-migration.json')).sources.chores).toContain('Chris');
    await settleFamilyMigration();
    expect(await fs.readFile(path.join(root, 'data/family.json'), 'utf8')).toBe(first);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });
  it('creates an empty migrated roster without evidence', async () => {
    expect(await readFamilyData()).toEqual({ members: [], aliasIds: {}, migrated: true });
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-migration.json');
  });
  it('does not rewrite a current calendar config merely to add empty mappings', async () => {
    const saved = { version: 13, settings: { calendar: { sources: [] } }, screens: [] };
    await put('config.json', saved);
    const before = await fs.readFile(path.join(root, 'data/config.json'), 'utf8');
    const rename = vi.spyOn(fs, 'rename');
    await settleFamilyMigration();
    expect(await fs.readFile(path.join(root, 'data/config.json'), 'utf8')).toBe(before);
    expect(rename.mock.calls.some(([, destination]) => String(destination).endsWith('/config.json'))).toBe(false);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('backups');
  });
  it('backs up raw config before schema migration even without legacy family records', async () => {
    const raw = '{ "version": 12, "settings": { "calendar": {} }, "screens": [] }\n';
    await fs.writeFile(path.join(root, 'data/config.json'), raw);
    const rename = vi.spyOn(fs, 'rename');
    await settleFamilyMigration();
    const backups = await fs.readdir(path.join(root, 'data/backups'));
    expect(backups).toHaveLength(1);
    expect(await fs.readFile(path.join(root, 'data/backups', backups[0]), 'utf8')).toBe(raw);
    expect((await fs.stat(path.join(root, 'data/backups', backups[0]))).mode & 0o777).toBe(0o600);
    expect((await read('config.json')).version).toBe(13);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-migration.json');
    const published = rename.mock.calls.map(([, destination]) => String(destination)).filter((destination) => !destination.endsWith('/family-transaction.json'));
    expect(published[0]).toBe(path.join(root, 'data/backups', backups[0]));
    await settleFamilyMigration();
    expect(await fs.readdir(path.join(root, 'data/backups'))).toEqual(backups);
  });
  it('uses a settled fast path after stable validation and invalidates it after a commit', async () => {
    await put('family.json', { members: [member('a')], migrated: true });
    await put('chores.json', { chores: [] });
    await put('config.json', { version: 13, settings: {}, screens: [] });
    await settleFamilyMigration();
    const reads = vi.spyOn(fs, 'readFile');
    await settleFamilyMigration();
    const sources = () => reads.mock.calls.filter(([file]) => /\/(family|chores|config)\.json$/.test(String(file)));
    expect(sources()).toEqual([]);
    // Journal recovery remains active even when family sources are cached.
    expect(reads.mock.calls.some(([file]) => String(file).endsWith('/family-transaction.json'))).toBe(true);
    await withDataTransaction(() => commitDataTransaction({ kind: 'external-store-update', changes: [{ path: 'data/other.json', before: null, after: '{}' }] }));
    await settleFamilyMigration();
    expect(sources()).toHaveLength(3);
  });
  it('detects legacy content written by another process after sources were settled', async () => {
    await put('family.json', { members: [member('a')], migrated: true });
    await put('chores.json', { chores: [] });
    await settleFamilyMigration();
    execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2])', path.join(root, 'data/chores.json'), JSON.stringify({ members: [{ id: 'b', name: 'B', color: '#60a5fa' }], chores: [] })]);
    await settleFamilyMigration();
    expect((await read('family.json')).members.map((person: { id: string }) => person.id)).toEqual(['a', 'b']);
    expect(await read('chores.json')).not.toHaveProperty('members');
  });
  it('detects corrupt disk changes and retries immediately after an out-of-process repair', async () => {
    await put('family.json', { members: [member('a')], migrated: true });
    await put('chores.json', { chores: [] });
    await settleFamilyMigration();
    await fs.writeFile(path.join(root, 'data/chores.json'), '{bad');
    await expect(settleFamilyMigration()).rejects.toThrow('corrupt');
    await expect(settleFamilyMigration()).rejects.toMatchObject({ status: 503 });
    await put('chores.json', { chores: [] });
    await expect(settleFamilyMigration()).resolves.toBeUndefined();
  });
  it('detects an in-place edit even when file size and modification time are preserved', async () => {
    await put('family.json', { members: [member('a')], migrated: true });
    await settleFamilyMigration();
    const file = path.join(root, 'data/family.json');
    const before = await fs.stat(file);
    const contents = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, contents.replace('"migrated": true', '"migrated": null'));
    await fs.utimes(file, before.atime, before.mtime);
    expect((await fs.stat(file)).size).toBe(before.size);
    await expect(settleFamilyMigration()).rejects.toThrow('Invalid family data');
  });
  it('fails closed on corrupt sources before journaling', async () => {
    await fs.writeFile(path.join(root, 'data/config.json'), '{bad');
    await expect(readFamilyData()).rejects.toThrow('corrupt');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });
  it('backs off corrupt migration sources and lets an explicit repair transaction clear the failure', async () => {
    await fs.writeFile(path.join(root, 'data/chores.json'), '{bad');
    await expect(readFamilyData()).rejects.toThrow('corrupt');
    await expect(readFamilyData()).rejects.toMatchObject({ status: 503 });
    await withDataTransaction(async () => commitDataTransaction({ kind: 'restore-repair', changes: [
      { path: 'data/chores.json', before: await readTransactionFile('data/chores.json'), after: '{"chores":[]}' },
    ] }));
    await expect(readFamilyData()).resolves.toMatchObject({ migrated: true, members: [] });
  });
  it('rejects stale writers and unconfirmed deletes before touching dependent files', async () => {
    await put('family.json', { members: [member('one')], migrated: true });
    const first = await readFamilyData();
    const saved = await replaceFamilyMembers({ members: [...first.members, { name: 'New', color: '#60a5fa' }], revision: familyRevision(first), removedIds: [] });
    expect(saved.members).toHaveLength(2);
    await expect(replaceFamilyMembers({ members: first.members, revision: familyRevision(first), removedIds: [] })).rejects.toMatchObject({ status: 409, current: saved });
    await expect(replaceFamilyMembers({ members: [saved.members[0]], revision: saved.revision, removedIds: [] })).rejects.toThrow('Confirm exactly');
    expect((await readFamilyData()).members).toEqual(saved.members);
  });
  it('cascades a confirmed deletion across all references and keeps redemption history', async () => {
    await put('family.json', { members: [member('a'), member('b')], aliasIds: { old: 'a' }, migrated: true });
    await put('config.json', { version: 13, settings: { calendar: { personSources: { a: ['source'], b: ['shared'] } } }, screens: [] });
    await put('chores.json', { chores: [{ id: 'c', assigneeIds: ['a', 'b'], schedule: { a: [1], b: [2] } }] });
    await put('chore-completions.json', { completions: [{ memberId: 'a' }, { memberId: 'b' }] });
    await put('rewards.json', { balances: { a: 3, b: 4 }, rewards: [{ memberIds: ['a', 'b'] }], redemptions: [{ memberId: 'a', memberName: 'a' }] });
    await put('todos.json', { lists: [{ items: [{ assigneeIds: ['a', 'b'] }] }] });
    const data = await readFamilyData();
    await replaceFamilyMembers({ members: [data.members[1]], revision: familyRevision(data), removedIds: ['a'] });
    expect((await read('family.json')).aliasIds).toEqual({});
    expect((await read('chores.json')).chores[0]).toMatchObject({ assigneeIds: ['b'], schedule: { b: [2] } });
    expect((await read('chore-completions.json')).completions).toEqual([{ memberId: 'b' }]);
    expect((await read('rewards.json')).balances).toEqual({ b: 4 });
    expect((await read('rewards.json')).redemptions).toHaveLength(1);
    expect((await read('config.json')).settings.calendar.personSources).toEqual({ b: ['shared'] });
    expect((await read('todos.json')).lists[0].items[0].assigneeIds).toEqual(['b']);
  });
  it('removes chores with no assignees and normalizes surviving schedules after a batch deletion', async () => {
    await put('family.json', { members: ['a', 'b', 'c', 'd'].map((id) => member(id)), migrated: true });
    await put('chores.json', { chores: [
      { id: 'removed', assigneeIds: ['a', 'b'] },
      { id: 'one-left', assigneeIds: ['a', 'c'], rotation: 'schedule', daysOfWeek: [1, 2, 3], schedule: { a: [1], c: [2, 3] } },
      { id: 'several-left', assigneeIds: ['a', 'b', 'c', 'd'], rotation: 'schedule', daysOfWeek: [1, 2, 3, 4], schedule: { a: [1], b: [2], c: [3], d: [4, 3] } },
      { id: 'empty-schedule', assigneeIds: ['a', 'c'], rotation: 'schedule', daysOfWeek: [1], schedule: { a: [1] } },
    ] });
    const data = await readFamilyData();
    await replaceFamilyMembers({ members: data.members.slice(2), revision: familyRevision(data), removedIds: ['a', 'b'] });
    expect((await read('chores.json')).chores).toEqual([
      { id: 'one-left', assigneeIds: ['c'], rotation: 'fixed', daysOfWeek: [2, 3] },
      { id: 'several-left', assigneeIds: ['c', 'd'], rotation: 'schedule', daysOfWeek: [3, 4], schedule: { c: [3], d: [4, 3] } },
      { id: 'empty-schedule', assigneeIds: ['c'], rotation: 'fixed', daysOfWeek: [1] },
    ]);
  });
  it('rejects malformed retained schedules before deleting any family data', async () => {
    await put('family.json', { members: [member('a'), member('b')], migrated: true });
    await put('chores.json', { chores: [{ id: 'bad', assigneeIds: ['a', 'b'], rotation: 'schedule', schedule: { b: 'Monday' } }] });
    const data = await readFamilyData();
    await expect(replaceFamilyMembers({ members: [data.members[1]], revision: familyRevision(data), removedIds: ['a'] })).rejects.toThrow('schedule is invalid');
    expect((await read('family.json')).members).toHaveLength(2);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });
  it('allows edits of a large imported roster while refusing additional members', async () => {
    await put('family.json', { members: Array.from({ length: 70 }, (_, n) => member(`id${n}`, n === 0 ? 'Long'.repeat(30) : `Name ${n}`)), migrated: true });
    const data = await readFamilyData();
    const edited = await replaceFamilyMembers({ members: data.members.toReversed(), revision: familyRevision(data), removedIds: [] });
    expect(edited.members).toHaveLength(70);
    await expect(replaceFamilyMembers({ members: [...edited.members, { name: 'New', color: '#60a5fa' }], revision: edited.revision, removedIds: [] })).rejects.toThrow('fewer than 64');
  });
});

/**
 * Every rejection here must leave the roster and its dependent stores exactly
 * as they were, with no journal: these guards are what stops a buggy or
 * hostile client rewriting identities the server owns.
 */
describe('roster write guards', () => {
  const write = (input: unknown) => replaceFamilyMembers(input as ReplaceFamilyInput);
  let saved: string;
  let revision: string;
  beforeEach(async () => {
    await put('family.json', { members: [member('a', 'Alex'), member('b', 'Bo')], aliasIds: { legacy: 'a' }, migrated: true });
    revision = familyRevision(await readFamilyData());
    saved = await fs.readFile(path.join(root, 'data/family.json'), 'utf8');
  });
  const unchanged = async () => {
    expect(await fs.readFile(path.join(root, 'data/family.json'), 'utf8')).toBe(saved);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  };

  it.each([
    ['no revision', {}],
    ['an empty revision', { revision: '' }],
    ['a non-string revision', { revision: 7 }],
  ])('refuses a save with %s', async (_label, patch) => {
    await expect(write({ members: [member('a', 'Alex')], removedIds: ['b'], ...patch })).rejects.toThrow('A revision is required');
    await unchanged();
  });

  it.each([
    ['members that are not a list', { members: 'everyone' }],
    ['removedIds that are not a list', { removedIds: 'b' }],
    ['an unsafe id in removedIds', { removedIds: ['__proto__'] }],
    ['a repeated id in removedIds', { removedIds: ['b', 'b'] }],
  ])('refuses %s', async (_label, patch) => {
    await expect(write({ members: [member('a', 'Alex')], revision, removedIds: ['b'], ...patch })).rejects.toThrow('Include the updated member list');
    await unchanged();
  });

  it.each([
    ['the same id twice', [member('a', 'Alex'), member('a', 'Alex again')]],
    ['an unsafe member id', [{ ...member('a', 'Alex'), id: '__proto__' }]],
    ['a blank name', [{ ...member('a', 'Alex'), name: '   ' }]],
    ['a non-string name', [{ ...member('a', 'Alex'), name: 42 }]],
    ['a malformed color', [{ ...member('a', 'Alex'), color: 'blue' }]],
    ['an oversized emoji', [{ ...member('a', 'Alex'), emoji: 'x'.repeat(33) }]],
    ['a member that is not a record', ['Alex']],
  ])('refuses a roster containing %s', async (_label, members) => {
    await expect(write({ members, revision, removedIds: ['b'] })).rejects.toThrow('unique identity, name and color');
    await unchanged();
  });

  it('refuses a name over the authoring limit on a new person', async () => {
    await expect(write({ members: [member('a', 'Alex'), member('b', 'Bo'), { name: 'N'.repeat(41), color: '#60a5fa' }], revision, removedIds: [] })).rejects.toThrow('up to 40 characters');
    await unchanged();
  });

  it.each(['createdAt', 'updatedAt'])('refuses a client-supplied %s that differs from the stored one', async (field) => {
    const members = [{ ...member('a', 'Alex'), [field]: '2020-01-01T00:00:00.000Z' }, member('b', 'Bo')];
    await expect(write({ members, revision, removedIds: [] })).rejects.toThrow('timestamps cannot be changed');
    await unchanged();
  });

  it('ignores server-owned metadata sent by a client', async () => {
    const result = await write({
      members: [{ ...member('a', 'Renamed'), createdAt: now, updatedAt: now }, member('b', 'Bo')],
      revision, removedIds: [], aliasIds: { spoofed: 'b' }, migrated: false,
    });
    const stored = await read('family.json');
    expect(stored.aliasIds).toEqual({ legacy: 'a' });
    expect(stored.migrated).toBe(true);
    expect(stored.members[0]).toMatchObject({ id: 'a', name: 'Renamed', createdAt: now });
    expect(stored.members[0].updatedAt).not.toBe(now);
    expect(result.revision).toBe(familyRevision(stored));
  });

  it('mints its own id for a new person instead of trusting the client', async () => {
    const result = await write({ members: [member('a', 'Alex'), member('b', 'Bo'), { id: 'client-chosen', name: 'New', color: '#60a5fa' }], revision, removedIds: [] });
    expect(result.members.map((entry) => entry.id)).not.toContain('client-chosen');
    expect(result.members).toHaveLength(3);
  });
});

describe('transaction recovery', () => {
  it('blocks partial access during backoff, then replays saved images', async () => {
    await put('a.json', { old: true });
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('/b.json')) throw new Error('disk full');
      return rename(from, to);
    });
    await expect(withDataTransaction(async () => commitDataTransaction({ kind: 'test', changes: [
      { path: 'data/a.json', before: await readTransactionFile('data/a.json'), after: '{"new":true}' },
      { path: 'data/b.json', before: null, after: '{"saved":true}' },
    ] }))).rejects.toThrow('disk full');
    spy.mockRestore();
    await expect(withDataTransaction(() => readTransactionFile('data/a.json'))).rejects.toBeInstanceOf(DataTransactionError);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await expect(withDataTransaction(() => readTransactionFile('data/b.json'))).resolves.toBe('{"saved":true}');
    clock.mockRestore();
  });
  it('rejects a journal whose saved after-image changed after it was written', async () => {
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('/b.json')) throw new Error('disk full');
      return rename(from, to);
    });
    await expect(withDataTransaction(() => commitDataTransaction({ kind: 'test', changes: [
      { path: 'data/a.json', before: null, after: '{}' }, { path: 'data/b.json', before: null, after: '{}' },
    ] }))).rejects.toThrow('disk full');
    spy.mockRestore();
    const journal = await read('family-transaction.json');
    journal.changes[1].after = '{"unexpected":true}';
    await put('family-transaction.json', journal);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await expect(withDataTransaction(() => {})).rejects.toThrow('integrity check');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('b.json');
  });
  it('refuses replay over an unexpected external edit', async () => {
    const rename = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('/b.json')) throw new Error('disk full');
      return rename(from, to);
    });
    await expect(withDataTransaction(() => commitDataTransaction({ kind: 'test', changes: [
      { path: 'data/a.json', before: null, after: '{}' }, { path: 'data/b.json', before: null, after: '{}' },
    ] }))).rejects.toThrow('disk full');
    spy.mockRestore();
    await put('a.json', { external: true });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
    await expect(withDataTransaction(() => {})).rejects.toThrow('changed outside');
    expect(await read('a.json')).toEqual({ external: true });
  });
  it('durably rolls back a handled restore failure, including originally absent files', async () => {
    await put('a.json', { before: true });
    const rename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('/c.json') && !failed) { failed = true; throw new Error('write failed'); }
      return rename(from, to);
    });
    await expect(withDataTransaction(async () => commitDataTransaction({ kind: 'restore', rollbackOnError: true, changes: [
      { path: 'data/a.json', before: await readTransactionFile('data/a.json'), after: '{}' },
      { path: 'data/b.json', before: null, after: '{}' }, { path: 'data/c.json', before: null, after: '{}' },
    ] }))).rejects.toThrow('write failed');
    expect(await read('a.json')).toEqual({ before: true });
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('b.json');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });
});
