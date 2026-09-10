import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScreenConfiguration, ChoreDefinition } from '@/types/config';
import { planFamilyRestore, type FamilyRestoreContent } from '../family-import';
import { commitDataTransaction, withDataTransaction } from '../data-transaction';

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string, name = id) => ({ id, name, color: '#60a5fa', createdAt: now, updatedAt: now });
const chore = (id: string, assigneeIds: string[]): ChoreDefinition => ({
  id, name: id, emoji: '', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', rotation: 'fixed', assigneeIds,
});
let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'));
const config = () => ({ version: 13, screens: [], settings: { calendar: {} } }) as unknown as ScreenConfiguration;
const restore = (body: FamilyRestoreContent) => withDataTransaction(async () => {
  const plan = await planFamilyRestore(body);
  await commitDataTransaction({ kind: 'test-restore', changes: plan.changes, evidence: plan.evidence, rollbackOnError: true });
  return plan;
});

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-family-import-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: [member('a', 'Alex renamed')], migrated: true });
  await put('config.json', config());
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

describe('family restore final state', () => {
  it('reconciles renamed ids and preserves distinct same-name chore identities', async () => {
    await put('rewards.json', { rewards: [], balances: { a: 8 }, redemptions: [] });
    await restore({ chores: {
      members: [{ id: 'a', name: 'Alex', color: '#60a5fa' }, { id: 'b', name: 'Alex', color: '#4ade80' }],
      chores: [chore('dishes', ['a']), chore('laundry', ['b'])],
    } });
    const family = await read('family.json');
    expect(family.members.map((person: { id: string; name: string }) => [person.id, person.name])).toEqual([['a', 'Alex renamed'], ['b', 'Alex']]);
    expect(family.members[0].createdAt).toBe(now);
    expect((await read('rewards.json')).balances).toEqual({ a: 8 });
    expect(await read('chores.json')).not.toHaveProperty('members');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it('retains aliases and source ownership through a later legacy fold', async () => {
    await put('family.json', { members: [member('a', 'Alex renamed')], migrated: true, aliasIds: { old: 'a' } });
    const incoming = config();
    incoming.settings.calendar = { ...incoming.settings.calendar, personSources: { a: ['work'] }, people: [{ id: 'old', name: 'Alex before rename', color: '#60a5fa', sourceIds: ['school'] }] };
    await restore({ config: incoming });
    expect((await read('family.json')).members).toHaveLength(1);
    expect((await read('config.json')).settings.calendar.personSources).toEqual({ a: ['work', 'school'] });
  });

  it.each([
    ['chores.json', { chores: [chore('job', ['a'])] }],
    ['chores.json', { chores: [{ ...chore('job', []), schedule: { a: [1] } }] }],
  ])('refuses a family-only replacement that would orphan retained %s', async (file, content) => {
    await put(file as string, content);
    const before = await fs.readFile(path.join(root, 'data', file as string), 'utf8');
    await expect(restore({ family: { members: [member('b')], migrated: true } })).rejects.toThrow('missing from the restored family');
    expect(await fs.readFile(path.join(root, 'data', file as string), 'utf8')).toBe(before);
    expect((await read('family.json')).members[0].id).toBe('a');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it.each(['incoming', 'retained'] as const)('preserves %s historical orphan ledgers and records immutable evidence', async (source) => {
    const choreCompletions = { completions: [{ choreId: 'old-job', memberId: 'deleted-before-family-feature', date: '2024-01-01' }] };
    const rewards = { rewards: [], balances: { 'deleted-before-family-feature': 4 }, redemptions: [] };
    if (source === 'retained') {
      await put('chore-completions.json', choreCompletions);
      await put('rewards.json', rewards);
    }
    const plan = await restore(source === 'incoming' ? { choreCompletions, rewards } : { config: config() });
    expect(await read('chore-completions.json')).toEqual(choreCompletions);
    expect(await read('rewards.json')).toEqual(rewards);
    expect((await read('family.json')).members.map((person: { id: string }) => person.id)).toEqual(['a']);
    const evidence = JSON.parse(plan.evidence!.contents);
    expect(evidence.historicalOrphans).toEqual({ policy: 'preserve-ledger-entries-without-creating-members', completions: choreCompletions.completions, balances: rewards.balances });
    expect(await fs.readFile(path.join(root, plan.evidence!.path), 'utf8')).toBe(plan.evidence!.contents);
    const repeated = await restore({ config: config() });
    expect(repeated.evidence!.path).not.toBe(plan.evidence!.path);
    expect(await fs.readFile(path.join(root, plan.evidence!.path), 'utf8')).toBe(plan.evidence!.contents);
  });

  it('keeps historical ledgers when a family-only restore replaces their former person', async () => {
    await put('chore-completions.json', { completions: [{ memberId: 'a' }] });
    await put('rewards.json', { rewards: [], balances: { a: 5 }, redemptions: [] });
    const plan = await restore({ family: { members: [member('b')], migrated: true } });
    expect((await read('chore-completions.json')).completions).toEqual([{ memberId: 'a' }]);
    expect((await read('rewards.json')).balances).toEqual({ a: 5 });
    expect(JSON.parse(plan.evidence!.contents).historicalOrphans.balances).toEqual({ a: 5 });
  });

  it.each(['incoming', 'retained'] as const)('repairs %s reward eligibility left by a failed legacy deletion without widening access', async (source) => {
    const original = {
      rewards: [
        { id: 'mixed', name: 'Movie', memberIds: ['a', 'deleted'], enabled: true, cost: 2 },
        { id: 'orphan', name: 'Ice cream', memberIds: ['deleted'], enabled: true, cost: 3 },
        { id: 'everyone', name: 'Game', memberIds: [], enabled: true, cost: 1 },
      ],
      balances: { a: 2, deleted: 5 },
      redemptions: [{ memberId: 'deleted', rewardName: 'Movie' }],
    };
    const originalBytes = JSON.stringify(original);
    if (source === 'retained') await put('rewards.json', original);
    const planned = await withDataTransaction(() => planFamilyRestore(source === 'incoming' ? { rewards: original } : { config: config() }));
    // Repair planning cannot mutate the uploaded object or persist any image.
    expect(JSON.stringify(original)).toBe(originalBytes);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
    if (source === 'retained') expect(await read('rewards.json')).toEqual(original);
    else await expect(fs.access(path.join(root, 'data/rewards.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await withDataTransaction(() => commitDataTransaction({ kind: 'test-restore', changes: planned.changes, evidence: planned.evidence, rollbackOnError: true }));
    expect(await read('rewards.json')).toEqual({
      ...original,
      rewards: [
        { ...original.rewards[0], memberIds: ['a'] },
        { ...original.rewards[1], memberIds: [], enabled: false },
        original.rewards[2],
      ],
    });
    const evidence = JSON.parse(planned.evidence!.contents);
    expect(evidence.rewardAssignmentRepairs).toEqual({
      policy: 'remove-missing-members-disable-if-none-remain',
      records: [
        { before: original.rewards[0], removedMemberIds: ['deleted'], disabled: false },
        { before: original.rewards[1], removedMemberIds: ['deleted'], disabled: true },
      ],
    });
    expect(evidence.historicalOrphans.balances).toEqual({ deleted: 5 });
    expect(await fs.readFile(path.join(root, planned.evidence!.path), 'utf8')).toBe(planned.evidence!.contents);
    expect((await read('family.json')).members.map((person: { id: string }) => person.id)).toEqual(['a']);
  });

  it('journals reward cleanup during a family-only replacement even without orphan balances', async () => {
    const reward = { id: 'r1', name: 'Movie', memberIds: ['a'], enabled: true };
    await put('rewards.json', { rewards: [reward], balances: {}, redemptions: [] });
    const planned = await restore({ family: { members: [member('b')], migrated: true } });
    expect((await read('rewards.json')).rewards).toEqual([{ ...reward, memberIds: [], enabled: false }]);
    expect(JSON.parse(planned.evidence!.contents).rewardAssignmentRepairs.records[0].before).toEqual(reward);
  });

  it('rolls repaired reward eligibility and config back together after a publication failure', async () => {
    await put('rewards.json', { rewards: [{ id: 'r1', name: 'Movie', memberIds: ['deleted'], enabled: true }], balances: { deleted: 5 }, redemptions: [] });
    const files = ['config.json', 'family.json', 'rewards.json'];
    const before = await Promise.all(files.map((file) => fs.readFile(path.join(root, 'data', file), 'utf8')));
    const rename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (!failed && String(to) === path.join(root, 'data/rewards.json')) {
        failed = true;
        throw Object.assign(new Error('Injected failure after reward publication'), { code: 'EIO' });
      }
    });
    const incoming = config();
    incoming.version = 12;
    incoming.settings.rotationIntervalMs = 10000;
    await expect(restore({ config: incoming })).rejects.toThrow('Injected failure after reward publication');
    expect(failed).toBe(true);
    expect(await Promise.all(files.map((file) => fs.readFile(path.join(root, 'data', file), 'utf8')))).toEqual(before);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it('reports all missing chore and schedule identities without publishing an already planned reward repair', async () => {
    const rewards = { rewards: [{ id: 'r1', name: 'Movie', memberIds: ['deleted'], enabled: true }], balances: { deleted: 5 }, redemptions: [] };
    await put('rewards.json', rewards);
    await put('chores.json', { chores: [
      { ...chore('dishes', ['lost-a', 'lost-b']), name: 'Wash dishes' },
      { ...chore('laundry', ['a']), name: 'Fold clothes', schedule: { 'lost-c': [1] } },
    ] });
    const restoring = restore({ config: config() });
    await expect(restoring).rejects.toMatchObject({ status: 400, message: expect.stringContaining('data/chores.json, chores[0] "Wash dishes" (id "dishes"), assigneeIds: "lost-a", "lost-b"') });
    await expect(restoring).rejects.toThrow('chores[1] "Fold clothes" (id "laundry"), schedule: "lost-c"');
    expect(await read('rewards.json')).toEqual(rewards);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-migration.json');
  });

  it.each([null, '__proto__', 3])('refuses malformed reward person ID %s with its record location', async (id) => {
    await expect(restore({ rewards: { rewards: [{ id: 'movie', name: 'Movie night', memberIds: [id] }], balances: {}, redemptions: [] } }))
      .rejects.toThrow('data/rewards.json, rewards[0] "Movie night" (id "movie"), memberIds contains invalid person IDs');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it.each([null, '', 3, '__proto__'])('rejects malformed historical completion member ids %s', async (memberId) => {
    await expect(restore({ choreCompletions: { completions: [{ memberId }] } })).rejects.toThrow('valid member identity');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it('replaces the modern roster with matching stores and preserves historical redemptions', async () => {
    const redemptions = [{ id: 'old', memberId: 'removed', memberName: 'Someone formerly in the household', rewardId: 'movie', rewardName: 'Movie', cost: 2, redeemedAt: now }];
    await restore({
      family: { members: [member('b')], migrated: true },
      chores: { chores: [chore('job', ['b'])] },
      choreCompletions: { completions: [{ choreId: 'job', memberId: 'b', date: '2026-09-09' }] },
      rewards: { rewards: [], balances: { b: 4 }, redemptions },
    });
    expect((await read('family.json')).members.map((person: { id: string }) => person.id)).toEqual(['b']);
    expect((await read('rewards.json')).redemptions).toEqual(redemptions);
  });

  it('does not rewrite untouched config or add empty calendar mappings', async () => {
    const before = await fs.readFile(path.join(root, 'data/config.json'), 'utf8');
    const planned = await restore({ family: { members: [member('a', 'Edited')], migrated: true } });
    expect(planned.changes.some((change) => change.path === 'data/config.json')).toBe(false);
    expect(await fs.readFile(path.join(root, 'data/config.json'), 'utf8')).toBe(before);
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('backups');
  });

  it.each(['schema', 'family'] as const)('backs up the incoming config before its %s transformation', async (kind) => {
    const incoming = config();
    if (kind === 'schema') incoming.version = 12;
    else incoming.settings.calendar!.people = [{ id: 'legacy', name: 'Alex renamed', color: '#60a5fa', sourceIds: ['school'] }];
    const original = JSON.stringify(incoming, null, 2);
    const plan = await restore({ config: incoming });
    const backup = plan.changes[0];
    expect(backup.path).toMatch(/^data\/backups\/config-v/);
    expect(backup).toMatchObject({ before: null, after: original, mode: 0o600 });
    expect(await fs.readFile(path.join(root, backup.path), 'utf8')).toBe(original);
    expect((await read('config.json')).version).toBe(13);
    if (kind === 'family') expect((await read('config.json')).settings.calendar).toEqual({ personSources: { a: ['school'] } });
  });

  it('backs up exact retained config bytes before migrating them during a partial restore', async () => {
    const raw = '{ "version": 12, "settings": {}, "screens": [] }\n';
    await fs.writeFile(path.join(root, 'data/config.json'), raw);
    const plan = await restore({ family: { members: [member('a')], migrated: true } });
    expect(plan.changes[0].after).toBe(raw);
    expect(await fs.readFile(path.join(root, plan.changes[0].path), 'utf8')).toBe(raw);
    expect((await read('config.json')).version).toBe(13);
  });

  it('does not publish a planned migration backup when a restore fails validation', async () => {
    const incoming = config();
    incoming.version = 12;
    const before = await fs.readFile(path.join(root, 'data/config.json'), 'utf8');
    await expect(restore({ config: incoming, chores: { chores: [chore('job', ['missing'])] } })).rejects.toThrow('missing from the restored family');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('backups');
    expect(await fs.readFile(path.join(root, 'data/config.json'), 'utf8')).toBe(before);
  });

  it.each([
    { rewards: [], balances: [], redemptions: [] },
    { rewards: [], balances: { a: '5' }, redemptions: [] },
    { rewards: [{ memberIds: 'a' }], balances: {}, redemptions: [] },
    { rewards: [], balances: {}, redemptions: {} },
  ])('refuses malformed retained reward state before journaling', async (rewards) => {
    await put('rewards.json', rewards);
    await expect(restore({ family: { members: [member('a')], migrated: true } })).rejects.toThrow();
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it('repairs corrupt replaced files from a complete modern backup', async () => {
    for (const file of ['family.json', 'config.json', 'chores.json']) await fs.writeFile(path.join(root, 'data', file), '{broken');
    await restore({ family: { members: [member('b')], migrated: true }, config: config(), chores: { chores: [chore('job', ['b'])] } });
    expect((await read('family.json')).members[0].id).toBe('b');
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual(['b']);
    expect((await read('config.json')).version).toBe(13);
  });

  it('refuses a partial restore that would retain corrupt source data', async () => {
    await fs.writeFile(path.join(root, 'data/chores.json'), '{broken');
    await expect(restore({ family: { members: [member('b')], migrated: true } })).rejects.toThrow('corrupt');
    expect((await read('family.json')).members[0].id).toBe('a');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

  it('folds retained legacy chore identities before a partial restore', async () => {
    await put('chores.json', { members: [{ id: 'b', name: 'Blair', color: '#4ade80' }], chores: [chore('job', ['b'])] });
    await restore({ config: config() });
    expect((await read('family.json')).members.map((person: { id: string }) => person.id)).toEqual(['a', 'b']);
    expect(await read('chores.json')).not.toHaveProperty('members');
  });

  it('keeps current calendar ownership during an older config-only import', async () => {
    await put('config.json', { ...config(), settings: { calendar: { personSources: { a: ['new-work'] } } } });
    const incoming = config();
    incoming.settings.calendar = { ...incoming.settings.calendar, people: [{ id: 'legacy', name: 'Alex renamed', color: '#60a5fa', sourceIds: ['old-school'] }] };
    await restore({ config: incoming });
    expect((await read('config.json')).settings.calendar.personSources).toEqual({ a: ['new-work', 'old-school'] });
  });

  it.each(['{broken', JSON.stringify({ settings: { calendar: { personSources: { missing: ['lost-source'] } } }, screens: [] })])('repairs an unreadable replaced config during legacy import with its before-image in evidence', async (before) => {
    await fs.writeFile(path.join(root, 'data/config.json'), before);
    const incoming = config();
    incoming.settings.calendar = { ...incoming.settings.calendar, people: [{ id: 'legacy', name: 'Alex renamed', color: '#60a5fa', sourceIds: ['school'] }] };
    const plan = await restore({ config: incoming });
    expect(plan.changes.find((change) => change.path === 'data/config.json')?.before).toBe(before);
    expect((await read('config.json')).settings.calendar.personSources).toEqual({ a: ['school'] });
    expect(JSON.parse(plan.evidence!.contents).replacedConfig).toEqual({ before, warning: expect.any(String) });
  });


  it('preserves legacy rosters over the authoring cap and long names', async () => {
    const members = Array.from({ length: 70 }, (_, index) => ({ id: `legacy-${index}`, name: index === 0 ? 'Long name '.repeat(8) : `Member ${index}`, color: '#60a5fa' }));
    await restore({ chores: { members, chores: [chore('job', ['legacy-69'])] } });
    const family = await read('family.json');
    expect(family.members).toHaveLength(71);
    expect(family.members[1].name).toBe(members[0].name);
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual(['legacy-69']);
  });

  it('checks retained future to-do assignees against a modern replacement', async () => {
    await put('todos.json', { migratedFromConfig: true, lists: [{
      id: 'list', name: 'List', slug: 'list', repeat: 'never', createdAt: now, updatedAt: now,
      items: [{ id: 'item', text: 'Task', completed: false, createdAt: now, assigneeIds: ['a'] }],
    }] });
    await expect(restore({ family: { members: [member('b')], migrated: true } })).rejects.toThrow('missing from the restored family');
    expect(await fs.readdir(path.join(root, 'data'))).not.toContain('family-transaction.json');
  });

});
