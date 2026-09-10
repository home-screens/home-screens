import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let current: string;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hs-deploy-lock-'));
  current = path.join(directory, 'current');
  mkdirSync(path.join(current, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(current, 'data'));
  mkdirSync(`${current}.staging`);
  mkdirSync(path.join(directory, 'bin'));
  copyFileSync(path.join(repo, 'scripts/upgrade.sh'), path.join(current, 'scripts/upgrade.sh'));
  writeFileSync(path.join(current, 'scripts/lib/common.sh'), '# no shared helpers needed for these paths\n');
  writeFileSync(path.join(directory, 'bin/systemctl'), '#!/bin/sh\n[ "$DEPLOY_TEST_ACTIVE" = 1 ]\n', { mode: 0o755 });
  writeFileSync(path.join(current, 'data/config.json'), '{"saved":true}');
  writeFileSync(path.join(current, 'release'), 'old');
  writeFileSync(path.join(`${current}.staging`, 'release'), 'new');
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function options(active = false) {
  return { cwd: directory, encoding: 'utf8' as const, timeout: 10_000, env: { ...process.env, PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`, DEPLOY_TEST_ACTIVE: active ? '1' : '0' } };
}

describe('deployment data protection', () => {

  it('prepares a deploy without copying or swapping data', () => {
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'prepare-deploy'], options(true));
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
    expect(existsSync(path.join(`${current}.staging`, 'data'))).toBe(false);
  });

  it('refuses a manual swap while the service is active, before taking the lock', () => {
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], options(true));
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error).toContain('sudo systemctl stop home-screens');
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
  });

  it('lets the coordinated web path swap without reacquiring its parent lock', () => {
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy', '--runtime-ready'], options(true));
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('new');
    expect(readFileSync(path.join(current, 'data/config.json'), 'utf8')).toBe('{"saved":true}');
  });

});
