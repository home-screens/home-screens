import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hs backup rotation '));
  mkdirSync(path.join(directory, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(directory, 'data/backups'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/upgrade.sh'), path.join(directory, 'scripts/upgrade.sh'));
  copyFileSync(path.join(repo, 'scripts/lib/common.sh'), path.join(directory, 'scripts/lib/common.sh'));
  writeFileSync(path.join(directory, 'package.json'), '{"version":"1.12.2"}');
  writeFileSync(path.join(directory, 'data/config.json'), '{"current":true}');
});
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
function save(name: string, timestamp: number) {
  const filename = path.join(directory, 'data/backups', name);
  writeFileSync(filename, `original ${name}`);
  utimesSync(filename, timestamp, timestamp);
}

describe('upgrade backup rotation', () => {
  it('keeps all migration originals and the stable pin while retaining six ordinary snapshots', () => {
    const backups = path.join(directory, 'data/backups');
    const migrationNames = [
      'config-v1.12.2-migration.12.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-20260101-000000.json',
      'config-v1.12.3-rc.1.migration.13.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-20260102-000000.json',
    ];
    for (const name of [...migrationNames, 'last-stable-config.json']) save(name, 1);
    const regular = Array.from({ length: 8 }, (_, n) => `config-v1.12.2-20260901-00000${n}.json`);
    regular.forEach((name, n) => save(name, 100 + n));
    const result = spawnSync('bash', [path.join(directory, 'scripts/upgrade.sh'), 'backup'], { cwd: directory, encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const remaining = readdirSync(backups);
    for (const name of [...migrationNames, 'last-stable-config.json']) {
      expect(remaining).toContain(name);
      expect(readFileSync(path.join(backups, name), 'utf8')).toBe(`original ${name}`);
    }
    expect(remaining.filter((name) => name.startsWith('config-') && !name.includes('migration.'))).toHaveLength(6);
    for (const name of regular.slice(0, 3)) expect(remaining).not.toContain(name);
    for (const name of regular.slice(3)) expect(remaining).toContain(name);
    expect(readFileSync(path.join(backups, JSON.parse(result.stdout).file), 'utf8')).toBe('{"current":true}');
  });
});

describe('upgrade backup times', () => {
  const run = (action: string, tz: string) => spawnSync('bash', [path.join(directory, 'scripts/upgrade.sh'), action], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, TZ: tz },
  });

  it('lists each backup with a real instant, whatever zone the Pi is in', () => {
    // 3 am in Chicago, 08:00 UTC.
    const instant = Date.parse('2026-09-24T08:00:00Z') / 1000;
    save('config-v1.12.2-20260924-080000.json', instant);
    for (const tz of ['UTC', 'America/Chicago', 'Europe/Berlin']) {
      const result = run('list-backups', tz);
      expect(result.status, result.stderr).toBe(0);
      const [entry] = JSON.parse(result.stdout) as { name: string; modified: string }[];
      expect(entry.modified).toBe('2026-09-24T08:00:00Z');
      expect(Date.parse(entry.modified)).toBe(instant * 1000);
    }
  });

  it('names a new snapshot in UTC, not the Pi zone', () => {
    const before = Math.floor(Date.now() / 1000) * 1000;
    const result = run('backup', 'America/Chicago');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const file = JSON.parse(result.stdout).file as string;
    const [, d, t] = /-(\d{8})-(\d{6})\.json$/.exec(file)!;
    const stamped = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}Z`);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(Date.now());
  });
});
