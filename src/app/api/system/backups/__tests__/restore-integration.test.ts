import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { withDataTransaction } from '@/lib/data-transaction';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => {}), requireDisplayAuth: vi.fn(async () => {}) }));
// Restoring a named snapshot must never fall back to the old raw shell copy.
vi.mock('child_process', () => ({ execFile: () => { throw new Error('Unexpected shell restore'); } }));

import { POST } from '../route';

const NAME = 'config-v1.2.3-20260909-120000.json';
const now = '2026-09-09T12:00:00.000Z';
const member = { id: 'chore-person', name: 'Renamed Alex', color: '#60a5fa', createdAt: now, updatedAt: now };
const current = { version: 13, screens: [], settings: { calendar: { personSources: { 'chore-person': ['new-calendar'] } } } };
const write = (file: string, value: unknown) => fs.writeFile(path.join(process.cwd(), 'data', file), JSON.stringify(value, null, 2));
const read = async (file: string) => JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', file), 'utf8'));
const request = () => new NextRequest('http://localhost/api/system/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NAME }) });
const snapshotDataFiles = async () => {
  const directory = path.join(process.cwd(), 'data');
  const entries = (await fs.readdir(directory, { recursive: true })).sort();
  return Object.fromEntries(await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry);
    return [entry, (await fs.stat(file)).isFile() ? await fs.readFile(file, 'utf8') : null];
  })));
};

beforeEach(async () => {
  await fs.rm(path.join(process.cwd(), 'data'), { recursive: true, force: true });
  await fs.mkdir(path.join(process.cwd(), 'data/backups'), { recursive: true });
  await write('config.json', current);
  await write('family.json', { members: [member], migrated: true, aliasIds: { 'calendar-person': member.id } });
  await write('chores.json', { chores: [{ id: 'job', assigneeIds: [member.id], schedule: { [member.id]: [1] } }] });
  await write('rewards.json', { balances: { [member.id]: 7 }, rewards: [], redemptions: [] });
  await write('chore-completions.json', { completions: [{ choreId: 'job', memberId: member.id, date: '2026-09-09' }] });
});

describe('named snapshot restoration', () => {
  it('folds legacy people into the current family with preserved identity, mappings and references', async () => {
    const snapshot = { version: 12, screens: [], settings: { calendar: { people: [{ id: 'calendar-person', name: 'Alex', color: '#fbbf24', sourceIds: ['old-calendar'] }] } } };
    await write(`backups/${NAME}`, snapshot);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, restored: NAME });
    expect((await read('family.json')).members).toEqual([member]);
    expect((await read('config.json')).settings.calendar).toEqual({ personSources: { [member.id]: ['new-calendar', 'old-calendar'] } });
    expect((await read('rewards.json')).balances[member.id]).toBe(7);
    expect((await read('chore-completions.json')).completions[0].memberId).toBe(member.id);
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual([member.id]);
    expect(await read(`backups/${NAME}`)).toEqual(snapshot);
    expect((await read('family-migration.json')).kind).toBe('import');
    await expect(fs.access(path.join(process.cwd(), 'data/family-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('repairs a corrupt live config using a valid modern snapshot', async () => {
    await write(`backups/${NAME}`, current);
    await fs.writeFile(path.join(process.cwd(), 'data/config.json'), '{broken');
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await read('config.json')).toEqual(current);
    expect((await read('family.json')).members).toEqual([member]);
  });

  it('repairs reward assignments left by a failed legacy deletion while preserving ledgers', async () => {
    const snapshot = { version: 12, screens: [], settings: { calendar: { people: [{ id: 'calendar-person', name: 'Alex', color: '#fbbf24', sourceIds: ['old-calendar'] }] } } };
    await write(`backups/${NAME}`, snapshot);
    const sharedReward = { id: 'movie', name: 'Movie night', cost: 4, emoji: '🎬', memberIds: [member.id, 'deleted-alex'], enabled: true };
    const formerReward = { id: 'arcade', name: 'Arcade trip', cost: 8, emoji: '🎮', memberIds: ['deleted-blair', 'deleted-casey'], enabled: true };
    const everyoneReward = { id: 'walk', name: 'Choose the walk', cost: 1, emoji: '🌳', memberIds: [], enabled: true };
    const balances = { [member.id]: 7, 'deleted-alex': 3, 'deleted-blair': 9 };
    const redemptions = [{ id: 'old-redemption', memberId: 'deleted-blair', memberName: 'Blair', rewardId: 'arcade', rewardName: 'Arcade trip', cost: 8, redeemedAt: now }];
    const completions = [{ choreId: 'old-job', memberId: 'deleted-alex', date: '2024-01-01' }];
    await write('rewards.json', { rewards: [sharedReward, formerReward, everyoneReward], balances, redemptions });
    await write('chore-completions.json', { completions });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, restored: NAME });
    expect(await read('rewards.json')).toEqual({
      rewards: [{ ...sharedReward, memberIds: [member.id] }, { ...formerReward, memberIds: [], enabled: false }, everyoneReward],
      balances, redemptions,
    });
    expect(await read('chore-completions.json')).toEqual({ completions });
    expect((await read('family.json')).members).toEqual([member]);
    const evidence = await read('family-migration.json');
    expect(evidence.rewardAssignmentRepairs).toEqual({
      policy: 'remove-missing-members-disable-if-none-remain',
      records: [
        { before: sharedReward, removedMemberIds: ['deleted-alex'], disabled: false },
        { before: formerReward, removedMemberIds: ['deleted-blair', 'deleted-casey'], disabled: true },
      ],
    });
    expect(await read(`backups/${NAME}`)).toEqual(snapshot);
    await expect(fs.access(path.join(process.cwd(), 'data/family-transaction.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('returns all named missing chore and to-do references in the visible error without changing disk', async () => {
    await write(`backups/${NAME}`, { version: 12, screens: [], settings: {} });
    await write('chores.json', { chores: [
      { id: 'job-dog', name: 'Feed the dog', assigneeIds: ['missing-alex', 'missing-ben'] },
      { id: 'job-plants', name: 'Water the plants', assigneeIds: [member.id], schedule: { [member.id]: [1], 'missing-casey': [2] } },
    ] });
    await write('todos.json', { migratedFromConfig: true, lists: [{
      id: 'list-school', name: 'School morning', slug: 'school-morning', repeat: 'never', createdAt: now, updatedAt: now,
      items: [{ id: 'item-backpack', text: 'Pack backpack', completed: false, createdAt: now, assigneeIds: ['missing-drew', 'missing-alex'] }],
    }] });
    // An otherwise repairable reward must also remain byte-for-byte intact
    // when active assignments elsewhere make the whole restore invalid.
    await write('rewards.json', { rewards: [{ id: 'movie', name: 'Movie night', memberIds: ['deleted-person'], enabled: true }], balances: {}, redemptions: [] });
    const before = await snapshotDataFiles();

    const response = await POST(request());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).not.toHaveProperty('detail');
    expect(body.error).not.toBe('Restore failed');
    for (const text of ['chores.json', 'chores[0]', 'Feed the dog', 'job-dog', 'assigneeIds', 'chores[1]', 'Water the plants', 'job-plants', 'schedule', 'todos.json', 'lists[0]', 'School morning', 'list-school', 'items[0]', 'Pack backpack', 'item-backpack', 'missing-alex', 'missing-ben', 'missing-casey', 'missing-drew']) {
      expect(body.error).toContain(text);
    }
    expect(body.error).toMatch(/repair|reassign|remove/i);
    expect(await snapshotDataFiles()).toEqual(before);
  });

  it('waits for a participating writer before planning and publishing the restore', async () => {
    const snapshot = { ...current, settings: { ...current.settings, rotationIntervalMs: 10000 } };
    await write(`backups/${NAME}`, snapshot);
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const blocker = withDataTransaction(async () => { entered(); await gate; });
    await ready;
    const restoring = POST(request());
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await read('config.json')).toEqual(current);
    release();
    await blocker;
    expect((await restoring).status).toBe(200);
    expect(await read('config.json')).toEqual(snapshot);
  });
});
