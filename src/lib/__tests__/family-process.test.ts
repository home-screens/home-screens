import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runner = path.join(repo, 'src/lib/__tests__/fixtures/family-process.ts');
let directory: string;
const children = new Set<ChildProcess>();
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-family-process-')); await fs.mkdir(path.join(directory, 'data')); });
afterEach(async () => { for (const child of children) child.kill('SIGKILL'); children.clear(); await fs.rm(directory, { recursive: true, force: true }); });
function start(action: string, stage = '') {
  const child = spawn(process.execPath, ['--import', 'tsx', runner, directory, action, stage], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  return child;
}
async function finish(child: ChildProcess) {
  let output = '';
  child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr?.on('data', (data: Buffer) => { output += data.toString(); });
  const result = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  children.delete(child);
  return { ...result, output };
}
const put = (filename: string, value: unknown) => fs.writeFile(path.join(directory, 'data', filename), JSON.stringify(value, null, 2));
const read = async (filename: string) => JSON.parse(await fs.readFile(path.join(directory, 'data', filename), 'utf8'));

describe('family transaction process isolation', () => {
  it.each(['journal', 'evidence', 'family-pending', 'config', 'chores', 'family-final', 'remove-journal'])('recovers a SIGKILL after %s using the saved images', async (stage) => {
    await put('chores.json', { members: [{ id: 'a', name: 'Alex', color: '#60a5fa' }, { id: 'b', name: 'Alex', color: '#f472b6' }], chores: [{ id: 'job', assigneeIds: ['a', 'b'] }] });
    await put('config.json', { version: 12, screens: [], settings: { calendar: { people: [{ id: 'calendar', name: 'Sam', color: '#4ade80', sourceIds: ['school'] }] } } });
    const killed = await finish(start('crash', stage));
    expect(killed, killed.output).toMatchObject({ signal: 'SIGKILL' });
    const journal = await read('family-transaction.json');
    const expectedFamily = journal.changes.find((change: { path: string }) => change.path === 'data/family.json').after;
    const recovered = await finish(start('recover'));
    expect(recovered, recovered.output).toMatchObject({ code: 0 });
    expect(await fs.readFile(path.join(directory, 'data/family.json'), 'utf8')).toBe(expectedFamily);
    expect((await read('family.json')).members.map((member: { id: string }) => member.id)).toEqual(['a', 'b', 'calendar']);
    expect((await read('config.json')).settings.calendar).toEqual({ personSources: { calendar: ['school'] } });
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual(['a', 'b']);
    expect(await fs.readdir(path.join(directory, 'data'))).not.toContain('family-transaction.json');
    const again = await finish(start('recover'));
    expect(again.code).toBe(0);
    expect(await fs.readFile(path.join(directory, 'data/family.json'), 'utf8')).toBe(expectedFamily);
  }, 45_000);

  it.each(['rollback-decision', 'rollback-write'])('resumes the durable rollback after a SIGKILL at %s', async (stage) => {
    await put('a.json', { original: 'a' });
    await put('b.json', { original: 'b' });
    const killed = await finish(start('restore-crash', stage));
    expect(killed, killed.output).toMatchObject({ signal: 'SIGKILL' });
    expect((await read('family-transaction.json')).decision).toBe('rollback');
    const result = await finish(start('recover-raw'));
    expect(result, result.output).toMatchObject({ code: 0 });
    expect(await read('a.json')).toEqual({ original: 'a' });
    expect(await read('b.json')).toEqual({ original: 'b' });
    expect(await fs.readdir(path.join(directory, 'data'))).not.toContain('c.json');
    expect(await fs.readdir(path.join(directory, 'data'))).not.toContain('family-transaction.json');
  }, 45_000);

  it('finishes a deletion cascade after its roster was already published', async () => {
    const now = '2026-09-09T12:00:00.000Z';
    await put('family.json', { members: ['a', 'b'].map((id) => ({ id, name: id, color: '#60a5fa', createdAt: now, updatedAt: now })), migrated: true });
    await put('config.json', { version: 13, screens: [], settings: { calendar: { personSources: { a: ['school'], b: ['work'] } } } });
    await put('chores.json', { chores: [{ id: 'job', assigneeIds: ['a', 'b'], schedule: { a: [1], b: [2] } }] });
    await put('rewards.json', { rewards: [{ memberIds: ['a', 'b'] }], balances: { a: 2, b: 4 }, redemptions: [] });
    expect(await finish(start('delete-crash', 'config'))).toMatchObject({ signal: 'SIGKILL' });
    expect((await read('family.json')).members.map((member: { id: string }) => member.id)).toEqual(['b']);
    expect((await read('chores.json')).chores[0].assigneeIds).toEqual(['a', 'b']);
    expect(await finish(start('recover'))).toMatchObject({ code: 0 });
    expect((await read('chores.json')).chores[0]).toMatchObject({ assigneeIds: ['b'], schedule: { b: [2] } });
    expect((await read('rewards.json')).balances).toEqual({ b: 4 });
  }, 45_000);

});
