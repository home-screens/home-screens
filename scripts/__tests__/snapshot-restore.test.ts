import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let bundleDirectory: string;
let directory: string;
beforeAll(() => {
  bundleDirectory = mkdtempSync(path.join(tmpdir(), 'hs-snapshot-bundle-'));
  buildSync({ entryPoints: [path.join(repo, 'scripts/restore-snapshot.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(bundleDirectory, 'restore-snapshot.cjs'), tsconfig: path.join(repo, 'tsconfig.json') });
});
afterAll(() => { rmSync(bundleDirectory, { recursive: true, force: true }); });
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hs-snapshot-restore-'));
  mkdirSync(path.join(directory, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(directory, 'data/backups'), { recursive: true });
  for (const filename of ['upgrade.sh', 'lib/common.sh', 'restore-snapshot.mjs', 'restore-ownership.mjs']) copyFileSync(path.join(repo, 'scripts', filename), path.join(directory, 'scripts', filename));
  copyFileSync(path.join(bundleDirectory, 'restore-snapshot.cjs'), path.join(directory, 'scripts/restore-snapshot.cjs'));
  put('config.json', { version: 13, screens: [], settings: {}, marker: 'current' });
  put('backups/last-stable-config.json', { version: 13, screens: [], settings: {}, marker: 'saved' });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
const put = (filename: string, value: unknown) => writeFileSync(path.join(directory, 'data', filename), JSON.stringify(value));
const read = (filename: string) => JSON.parse(readFileSync(path.join(directory, 'data', filename), 'utf8'));
function restore(name = 'last-stable-config.json', options: { serviceActive?: boolean } = {}) {
  const env = { ...process.env };
  if (options.serviceActive !== undefined) {
    // Stand in for systemctl so this never consults the real machine.
    const bin = path.join(directory, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh\nexit ${options.serviceActive ? 0 : 3}\n`, { mode: 0o755 });
    env.PATH = `${bin}:${process.env.PATH}`;
  }
  return spawnSync('bash', [path.join(directory, 'scripts/upgrade.sh'), 'restore-backup', name], { cwd: tmpdir(), encoding: 'utf8', timeout: 40_000, env });
}

describe('offline restore while the app is running', () => {
  // Nothing locks these files across processes. The app is a single process
  // that serializes its own writes, so a restore only has to be sure it is not
  // running alongside one; that check is the whole of what keeps them apart.
  it('refuses while the service is up, and changes nothing', () => {
    const result = restore('last-stable-config.json', { serviceActive: true });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('sudo systemctl stop home-screens');
    expect(read('config.json').marker).toBe('current');
    expect(existsSync(path.join(directory, 'data/family.json'))).toBe(false);
  });

  it('proceeds once the service is stopped', () => {
    const result = restore('last-stable-config.json', { serviceActive: false });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('config.json').marker).toBe('saved');
  });
});

describe('offline snapshot restore', () => {
  it('restores from the shipped bundle without a server or source tree', () => {
    expect(existsSync(path.join(directory, 'src'))).toBe(false);
    expect(existsSync(path.join(directory, 'scripts/restore-snapshot.ts'))).toBe(false);
    const result = restore();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, restored: 'last-stable-config.json' });
    expect(read('config.json').marker).toBe('saved');
    expect(read('family.json')).toMatchObject({ members: [], migrated: true });
    expect(existsSync(path.join(directory, 'data/family-transaction.json'))).toBe(false);
  });

  it('accepts permanent migration snapshot names from prerelease builds', () => {
    const name = 'config-v1.12.3-rc.1.migration.12.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-20260909-180000.json';
    put(`backups/${name}`, { version: 12, screens: [], settings: {}, marker: 'migration-original' });
    const result = restore(name);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('config.json').marker).toBe('migration-original');
    expect(read(`backups/${name}`).version).toBe(12);
  });

  it('repairs corrupt current config while merging legacy people and preserving history', () => {
    writeFileSync(path.join(directory, 'data/config.json'), '{broken');
    put('chores.json', { members: [{ id: 'alex', name: 'Alex', color: '#60a5fa' }], chores: [{ id: 'job', assigneeIds: ['alex'] }] });
    const completions = { completions: [{ id: 'old', memberId: 'deleted-person' }] };
    put('chore-completions.json', completions);
    put('backups/last-stable-config.json', { version: 12, screens: [], settings: { calendar: { people: [{ id: 'calendar-alex', name: 'Alex', color: '#60a5fa', sourceIds: ['school'] }] } } });
    const result = restore();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('family.json').members.map((member: { id: string }) => member.id)).toEqual(['alex']);
    expect(read('config.json').settings.calendar).toEqual({ personSources: { alex: ['school'] } });
    expect(read('chores.json')).toEqual({ chores: [{ id: 'job', assigneeIds: ['alex'] }] });
    expect(read('chore-completions.json')).toEqual(completions);
    expect(read('family-migration.json').replacedConfig.before).toBe('{broken');
  });

  it('folds inline lists with their new config references in the same restore', () => {
    put('backups/last-stable-config.json', { version: 12, screens: [{ id: 'screen', name: 'Home', modules: [{ id: 'todo', type: 'todo', config: { title: 'Groceries', items: [{ id: 'milk', text: 'Milk', completed: true }] } }] }], settings: {} });
    const result = restore();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const list = read('todos.json').lists[0];
    expect(list.name).toBe('Groceries');
    expect(list.items[0]).toMatchObject({ id: 'milk', text: 'Milk', completed: true });
    expect(read('config.json').screens[0].modules[0].config).toEqual({ title: 'Groceries', listId: list.id });
    expect(existsSync(path.join(directory, 'data/family-transaction.json'))).toBe(false);
  });

  it.each(['../config.json', '/tmp/config.json', 'other.json'])('rejects an unsafe or unsupported snapshot name %s', (name) => {
    const before = readFileSync(path.join(directory, 'data/config.json'), 'utf8');
    const result = restore(name);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('Use:');
    expect(readFileSync(path.join(directory, 'data/config.json'), 'utf8')).toBe(before);
  });

  it.each(['{broken', '{"screens":[],"settings":null}', '{"screens":[],"settings":{},"displays":{}}'])('rejects malformed snapshots without publishing data: %s', (snapshot) => {
    writeFileSync(path.join(directory, 'data/backups/last-stable-config.json'), snapshot);
    const result = restore();
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(read('config.json').marker).toBe('current');
    expect(existsSync(path.join(directory, 'data/family.json'))).toBe(false);
  });

  it('fails closed when a pending journal cannot be recovered', () => {
    put('family-transaction.json', { corrupt: true });
    const result = restore();
    expect(result.status).toBe(1);
    expect(read('config.json').marker).toBe('current');
    expect(read('family-transaction.json')).toEqual({ corrupt: true });
  });

  it('recovers an interrupted family migration before restoring the snapshot', () => {
    put('config.json', { version: 12, screens: [], settings: { calendar: { people: [{ id: 'sam', name: 'Sam', color: '#4ade80', sourceIds: ['school'] }] } } });
    put('chores.json', { members: [{ id: 'alex', name: 'Alex', color: '#60a5fa' }], chores: [] });
    const crash = spawnSync(process.execPath, ['--import', 'tsx', path.join(repo, 'src/lib/__tests__/fixtures/family-process.ts'), directory, 'crash', 'config'], { cwd: repo, encoding: 'utf8', timeout: 10_000 });
    expect(crash.signal, crash.stderr).toBe('SIGKILL');
    expect(existsSync(path.join(directory, 'data/family-transaction.json'))).toBe(true);
    const result = restore();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('config.json').marker).toBe('saved');
    expect(read('family.json').members.map((member: { id: string }) => member.id)).toEqual(['alex', 'sam']);
    expect(existsSync(path.join(directory, 'data/family-transaction.json'))).toBe(false);
  }, 45_000);

});

/** UID injection is confined to a child process: no sudo, account changes or
 * chown on the developer machine. */
describe('offline restore account ownership', () => {
  const name = 'last-stable-config.json';
  type Entry = 'bundle' | 'source' | 'bundled-launcher' | 'source-launcher';
  function command(entry: Entry, uid?: number, effectiveUid = uid) {
    const preload = path.join(directory, 'uid-preload.cjs');
    if (uid !== undefined) writeFileSync(preload, `process.getuid = () => ${uid}; process.geteuid = () => ${effectiveUid};`);
    if (entry === 'source-launcher') {
      rmSync(path.join(directory, 'scripts/restore-snapshot.cjs'));
      copyFileSync(path.join(repo, 'scripts/restore-snapshot.ts'), path.join(directory, 'scripts/restore-snapshot.ts'));
      mkdirSync(path.join(directory, 'node_modules/.bin'), { recursive: true });
      symlinkSync(path.join(repo, 'node_modules/.bin/tsx'), path.join(directory, 'node_modules/.bin/tsx'));
    }
    const args = uid === undefined ? [] : ['--require', preload];
    if (entry === 'source') args.push('--import', path.join(repo, 'node_modules/tsx/dist/loader.mjs'), path.join(repo, 'scripts/restore-snapshot.ts'));
    else args.push(path.join(directory, 'scripts', entry === 'bundle' ? 'restore-snapshot.cjs' : 'restore-snapshot.mjs'));
    return spawnSync(process.execPath, [...args, name], { cwd: directory, encoding: 'utf8', timeout: 10_000, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(repo, 'tsconfig.json') } });
  }
  function dataState() {
    const state: Record<string, unknown> = {};
    for (const relative of ['', 'backups', 'config.json', `backups/${name}`, 'family-transaction.json']) {
      const file = path.join(directory, 'data', relative);
      if (!existsSync(file)) continue;
      const stat = statSync(file);
      state[relative] = { uid: stat.uid, mode: stat.mode, content: stat.isFile() ? readFileSync(file, 'utf8') : readdirSync(file).sort() };
    }
    return state;
  }

  it.each(['bundle', 'source', 'bundled-launcher', 'source-launcher'] as const)('refuses root through %s before lock creation or journal recovery', (entry) => {
    put('family-transaction.json', { corrupt: 'must not be opened for recovery' });
    const before = dataState();
    const result = command(entry, 0);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('without sudo as root');
    expect(JSON.parse(result.stdout).error).toContain(`sudo -u '#${statSync(path.join(directory, 'data')).uid}'`);
    expect(dataState()).toEqual(before);
  });

  it.each(['bundle', 'source', 'bundled-launcher', 'source-launcher'] as const)('refuses a different non-root owner through %s without changing file ownership', (entry) => {
    const before = dataState();
    const wrongUid = statSync(path.join(directory, 'data')).uid + 1;
    const result = command(entry, wrongUid);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('Home Screens account');
    expect(dataState()).toEqual(before);
  });

  it.each(['bundle', 'source'] as const)('uses the app owner without creating missing data through %s', (entry) => {
    rmSync(path.join(directory, 'data'), { recursive: true });
    const result = command(entry, 0);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('without sudo as root');
    expect(existsSync(path.join(directory, 'data'))).toBe(false);
  });

  it('refuses effective root even when the real UID matches the data owner', () => {
    const result = command('bundle', statSync(path.join(directory, 'data')).uid, 0);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('without sudo as root');
  });

  it('refuses sudo-style shell invocation before sourcing saved kiosk settings', () => {
    const preload = path.join(directory, 'root-preload.cjs');
    writeFileSync(preload, 'process.getuid = () => 0; process.geteuid = () => 0;');
    const sourced = path.join(directory, 'kiosk-was-sourced');
    writeFileSync(path.join(directory, 'data/kiosk.conf'), `touch "${sourced}"`);
    const result = spawnSync('bash', [path.join(directory, 'scripts/upgrade.sh'), 'restore-backup', name], { cwd: directory, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--require=${preload}` } });
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('without sudo as root');
    expect(existsSync(sourced)).toBe(false);
  });

  it('lets the data owner restore from the direct source entry', () => {
    const result = command('source');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(read('config.json').marker).toBe('saved');
    expect(statSync(path.join(directory, 'data/config.json')).uid).toBe(process.geteuid!());
    expect(statSync(path.join(directory, 'data/family.json')).uid).toBe(process.geteuid!());
  });
});
