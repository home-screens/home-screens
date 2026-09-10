import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { bootId, stillOwnedForTests } from '../../src/lib/data-lock';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let current: string;
const children = new Set<ChildProcess>();
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
  for (const child of children) child.kill('SIGKILL');
  children.clear();
  rmSync(directory, { recursive: true, force: true });
});
function options(active = false) {
  return { cwd: directory, encoding: 'utf8' as const, timeout: 10_000, env: { ...process.env, PATH: `${path.join(directory, 'bin')}:${process.env.PATH}`, DEPLOY_TEST_ACTIVE: active ? '1' : '0' } };
}
/** Holds the release's data lock through the app's own lock, so this test
 * cannot drift from the protocol the shell has to match. */
function hold() {
  return spawn(process.execPath, ['--import', 'tsx', '-e', `
    import(process.argv[2]).then(async (lock) => {
      await lock.acquireDataLock(process.argv[1] + '.data.lock', { waitMs: 5000 });
      process.stdout.write('locked\\n');
      setInterval(() => {}, 1000);
    }).catch((error) => { process.stderr.write(String(error)); process.exit(1); });
  `, current, path.join(repo, 'src/lib/data-lock.ts')], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
}
const lockedSeen = new WeakSet<ChildProcess>();
function takerLocked(child: ChildProcess) { return lockedSeen.has(child); }
function finish(child: ChildProcess) {
  child.stdout!.on('data', (data: Buffer) => { if (data.toString().includes('locked')) lockedSeen.add(child); });
  children.add(child);
  let output = '';
  child.stdout!.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr!.on('data', (data: Buffer) => { output += data.toString(); });
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => { children.delete(child); resolve({ code, output }); });
  });
}

/** The shell and src/lib/data-lock.ts must agree on who still owns a lock.
 * Where they disagree, a deploy and the server can both believe it is theirs. */
describe('the shell agrees with the app about who owns a lock', () => {
  const record = (over: Record<string, string | number> = {}) => {
    const base: Record<string, string | number> = { token: 'someone', pid: process.ppid, boot: bootId(), host: os.hostname(), at: Date.now() };
    return Object.entries({ ...base, ...over }).map(([k, v]) => `${k}=${String(v)}`).join('\n') + '\n';
  };
  /** Runs one deploy against a lock holding this record; it either waits the
   * owner out (still owned) or takes it over (finished with). */
  function shellTreatsAsOwned(contents: string) {
    writeFileSync(`${current}.data.lock`, contents);
    spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], { ...options(), timeout: 8_000 });
    // Taking it over gets as far as the swap; waiting never does.
    return readFileSync(path.join(current, 'release'), 'utf8') === 'old';
  }

  const cases: Array<[string, Record<string, string | number>, boolean]> = [
    ['a live owner on this machine', {}, true],
    ['an owner whose process is gone', { pid: 2147483646 }, false],
    ['an owner from before this boot', { boot: 'a-previous-boot' }, false],
    ['an owner on another machine', { host: 'some-other-box' }, true],
    ['an owner on another machine from long ago', { host: 'some-other-box', at: Date.now() - 30 * 24 * 60 * 60 * 1000 }, true],
    ['a long-held lock on this machine', { at: Date.now() - 30 * 24 * 60 * 60 * 1000 }, true],
  ];
  for (const [name, over, owned] of cases) {
    it(`treats ${name} the same way the app does`, () => {
      const contents = record(over);
      expect(stillOwnedForTests(contents)).toBe(owned);
      expect(shellTreatsAsOwned(contents)).toBe(owned);
    }, 20_000);
  }

  it('treats a record nobody can be identified from the same way the app does', () => {
    expect(stillOwnedForTests('garbage')).toBe(false);
    expect(shellTreatsAsOwned('garbage')).toBe(false);
  }, 20_000);
});

describe('deployment data protection', () => {
  it('does not publish once its lock has been taken over mid-copy', async () => {
    // Stall inside the data copy, take the lock away, then let it continue.
    writeFileSync(path.join(directory, 'bin/cp'), '#!/bin/sh\ncase "$*" in *data*) sleep 4 ;; esac\nexec /bin/cp "$@"\n', { mode: 0o755 });
    const deploy = spawn('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], { ...options(), timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const deploying = finish(deploy);
    await expect.poll(() => existsSync(`${current}.data.lock`), { timeout: 15_000 }).toBe(true);
    writeFileSync(`${current}.data.lock`, 'token=somebody-else\npid=1\nboot=x\nhost=x\nat=1\n');
    const result = await deploying;
    expect(result.code).toBe(1);
    // The swap must not have happened.
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
    expect(existsSync(`${current}.rollback`)).toBe(false);
  }, 40_000);

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
    expect(existsSync(`${current}.data.lock`)).toBe(false);
  });

  it('lets the coordinated web path swap without reacquiring its parent lock', () => {
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy', '--runtime-ready'], options(true));
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('new');
    expect(readFileSync(path.join(current, 'data/config.json'), 'utf8')).toBe('{"saved":true}');
    expect(existsSync(`${current}.data.lock`)).toBe(false);
  });

  it('waits for a live writer, then breaks the lock that writer died still holding', async () => {
    const holder = hold();
    const holding = finish(holder);
    await new Promise<void>((resolve, reject) => { holder.stdout!.once('data', () => resolve()); holder.once('error', reject); });
    // Long enough to outlast the staleness wait; the shared 10s cap would
    // signal this deploy before it is ever entitled to break the lock.
    const deploy = spawn('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], { ...options(), timeout: 40_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const deploying = finish(deploy);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(deploy.exitCode).toBeNull();
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
    expect(existsSync(`${current}.rollback`)).toBe(false);
    // A killed writer cannot unlock, so the deploy has to wait out the
    // staleness window before it may take over. This is the power-cut path.
    holder.kill('SIGKILL');
    await holding;
    const result = await deploying;
    expect(result.code, result.output).toBe(0);
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('new');
    expect(readFileSync(path.join(current, 'data/config.json'), 'utf8')).toBe('{"saved":true}');
    // Releasing this lock means removing it, so the next writer can claim it.
    expect(existsSync(`${current}.data.lock`)).toBe(false);
  }, 45_000);

  it('leaves nothing behind that a later writer would trip over', async () => {
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], options());
    expect(result.status, result.stderr).toBe(0);
    // A refresh still in flight as the lock was released must not put a plain
    // file back at that path; the next lock there could never be claimed.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(existsSync(`${current}.data.lock`)).toBe(false);
  }, 20_000);

  it('leaves a killed deploy behind as a lock the next writer can take', async () => {
    // Stall the deploy while it holds the lock, so it can be killed at the one
    // moment that matters. Without this it finishes far too fast to catch.
    writeFileSync(path.join(directory, 'bin/cp'), '#!/bin/sh\ncase "$*" in *data*) sleep 60 ;; esac\nexec /bin/cp "$@"\n', { mode: 0o755 });
    const deploy = spawn('bash', [path.join(current, 'scripts/upgrade.sh'), 'deploy'], { ...options(), timeout: 40_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const deploying = finish(deploy);
    await expect.poll(() => existsSync(`${current}.data.lock`), { timeout: 20_000 }).toBe(true);
    // Killed outright, so its EXIT trap never runs and the lock file stays.
    deploy.kill('SIGKILL');
    await deploying;
    expect(existsSync(`${current}.data.lock`)).toBe(true);
    // Nothing is left running to defend it, and its process is gone, so the
    // next writer takes it over at once rather than waiting anything out.
    const taker = hold();
    const taking = finish(taker);
    await expect.poll(() => taker.exitCode !== null || takerLocked(taker), { timeout: 15_000 }).toBe(true);
    taker.kill('SIGKILL');
    const result = await taking;
    expect(result.output).toContain('locked');
  }, 60_000);
});
