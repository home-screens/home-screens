import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `finalize-deploy` runs from the new tree after the atomic swap. When the
 * new release never answers, it must put the previous tree back, restart
 * it, and leave a marker naming the version that did not take. These tests
 * stand in `curl`, `sudo` and `systemctl` on PATH so nothing real is
 * touched and the health answer is chosen per test.
 */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let directory: string;
let current: string;
let bin: string;

function placeTree(dir: string, version: string, marker: string) {
  mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(dir, 'data'), { recursive: true });
  copyFileSync(path.join(repo, 'scripts/upgrade.sh'), path.join(dir, 'scripts/upgrade.sh'));
  writeFileSync(path.join(dir, 'scripts/lib/common.sh'), '# no shared helpers needed for these paths\n');
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'home-screens', version }, null, 2));
  writeFileSync(path.join(dir, 'release'), marker);
  writeFileSync(path.join(dir, 'data/config.json'), JSON.stringify({ version: 13, marker }));
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'hs-finalize-'));
  current = path.join(directory, 'current');
  bin = path.join(directory, 'bin');
  mkdirSync(bin);
  // The new tree is APP_DIR; the old tree waits in .rollback.
  placeTree(current, '2.0.0', 'new');
  placeTree(`${current}.rollback`, '1.43.0', 'old');
  writeFileSync(path.join(bin, 'sudo'), '#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n', { mode: 0o755 });
  writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh\necho "$@" >> "${directory}/systemctl.log"\nexit 0\n`, { mode: 0o755 });
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function fakeCurl(httpCode: string) {
  // upgrade.sh asks curl for %{http_code} only; print the chosen answer. Like
  // real curl, a refused connection prints 000 AND exits non-zero (7).
  const exit = httpCode === '000' ? 7 : 0;
  writeFileSync(path.join(bin, 'curl'), `#!/bin/sh\nprintf '%s' '${httpCode}'\nexit ${exit}\n`, { mode: 0o755 });
}

function finalize() {
  return spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'finalize-deploy', '3000'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HS_FINALIZE_ATTEMPTS: '2', HS_FINALIZE_SLEEP: '0' },
  });
}

function systemctlLog(): string {
  const file = path.join(directory, 'systemctl.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe('finalize-deploy', () => {
  it('drops the rollback tree once the new release answers 200 on /api/health', () => {
    fakeCurl('200');
    const result = finalize();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, healthy: true });
    expect(existsSync(`${current}.rollback`)).toBe(false);
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('new');
    expect(systemctlLog()).toBe('');
  });

  // The probe is the public /api/health route, so a refusal or an error from
  // it means the app is not serving: a bound port alone no longer counts.
  it.each(['401', '500'])('treats a %s from /api/health as not booted and puts the previous tree back', (code) => {
    fakeCurl(code);
    const result = finalize();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, rolledBack: true });
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
    expect(existsSync(`${current}.rollback`)).toBe(false);
  });

  it('puts the previous tree back, restarts it and leaves a marker when the new release never answers', () => {
    fakeCurl('000');
    const result = finalize();
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, rolledBack: true, failedVersion: '2.0.0' });

    // The old tree is APP_DIR again, with its own data.
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
    expect(JSON.parse(readFileSync(path.join(current, 'data/config.json'), 'utf8')).marker).toBe('old');
    expect(existsSync(`${current}.rollback`)).toBe(false);
    // The failed tree is kept for diagnosis.
    expect(readFileSync(path.join(`${current}.failed`, 'release'), 'utf8')).toBe('new');

    const marker = JSON.parse(readFileSync(path.join(current, 'data/upgrade-failed.json'), 'utf8'));
    expect(marker.tag).toBe('v2.0.0');
    expect(marker.reason).toBe('did-not-start');
    expect(marker.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(systemctlLog()).toBe('stop home-screens\nstart home-screens\n');
  });

  it('does nothing when there is no rollback tree to go back to', () => {
    rmSync(`${current}.rollback`, { recursive: true, force: true });
    fakeCurl('000');
    const result = finalize();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, rollback: 'absent' });
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('new');
  });

  it('restart hands the finalize job to a transient unit outside the service cgroup', () => {
    // systemctl reports the service active; systemd-run records how it was called.
    writeFileSync(path.join(bin, 'systemctl'), '#!/bin/sh\n[ "$1" = "is-active" ] && exit 0\nexit 0\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'systemd-run'), `#!/bin/sh\nprintf '%s\\0' "$@" > "${directory}/systemd-run.args"\nexit 0\n`, { mode: 0o755 });
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'restart'], {
      cwd: directory, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, method: 'systemctl' });

    const args = readFileSync(path.join(directory, 'systemd-run.args'), 'utf8').split('\0').filter(Boolean);
    expect(args).toContain('--collect');
    expect(args.some((a) => a.startsWith('--unit=home-screens-finalize-'))).toBe(true);
    expect(args).toContain(`--property=User=${process.env.USER}`);
    // The job is handed over as a file: systemd would expand ${...} in an
    // inline command line before bash ran it.
    expect(args.slice(-2)).toEqual(['bash', `${current}/data/upgrade-finalize-job.sh`]);
    const script = readFileSync(args.at(-1)!, 'utf8');
    // The job restarts, aborts only on an unchanged MainPID, then finalizes.
    expect(script).toContain('sudo systemctl restart home-screens');
    expect(script).toContain('old_pid=$(systemctl show');
    expect(script).toContain('if [ "${new_pid}" != "0" ] && [ "${new_pid}" = "${old_pid}" ]; then');
    expect(script).toContain(`bash '${current}/scripts/upgrade.sh' finalize-deploy '3000'`);
    expect(script).not.toContain('systemctl is-active');
    expect(script).toContain(`exec > '${current}/data/upgrade-finalize.log'`);
  });

  it.each([
    ['8080\n', '8080', 'the saved port'],
    [' 8123 \n', '8123', 'the saved port, spaces trimmed'],
    ['', '3000', 'an empty file'],
    ['eighty\n', '3000', 'a word'],
    ["80'; reboot; '\n", '3000', 'digits with something after them'],
  ])('restart reads port.conf %j for the finalize job as %s (%s)', (content, port) => {
    writeFileSync(path.join(bin, 'systemctl'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'systemd-run'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(path.join(current, 'data/port.conf'), content);
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'restart'], {
      cwd: directory, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.status, result.stderr).toBe(0);
    const script = readFileSync(path.join(current, 'data/upgrade-finalize-job.sh'), 'utf8');
    expect(script).toContain(`bash '${current}/scripts/upgrade.sh' finalize-deploy '${port}'\n`);
  });

  it('the finalize job it writes runs finalize-deploy when the service crash-loops after the restart', () => {
    // MainPID moves from 111 to 0 (crashed), the health poll never answers:
    // the wrapper must reach finalize-deploy, which puts the old tree back.
    writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh\ncase "$1" in is-active) exit 0;; show) if [ -f "${directory}/restarted" ]; then echo 0; else echo 111; fi;; restart) touch "${directory}/restarted";; esac\nexit 0\n`, { mode: 0o755 });
    writeFileSync(path.join(bin, 'systemd-run'), `#!/bin/sh\nprintf '%s\\0' "$@" > "${directory}/systemd-run.args"\nexit 0\n`, { mode: 0o755 });
    fakeCurl('000');
    const restart = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'restart'], {
      cwd: directory, encoding: 'utf8', timeout: 20_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(restart.status).toBe(0);
    const args = readFileSync(path.join(directory, 'systemd-run.args'), 'utf8').split('\0').filter(Boolean);
    const script = readFileSync(args.at(-1)!, 'utf8').replace(/sleep [0-9]+/g, 'true');
    const job = spawnSync('bash', ['-c', script], {
      cwd: directory, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HS_FINALIZE_ATTEMPTS: '2', HS_FINALIZE_SLEEP: '0' },
    });
    expect(job.status).toBe(1);
    // The log was opened in the new tree, so it travels with it into .failed.
    const log = readFileSync(path.join(`${current}.failed`, 'data/upgrade-finalize.log'), 'utf8');
    expect(log).toContain('"rolledBack":true');
    expect(readFileSync(path.join(current, 'release'), 'utf8')).toBe('old');
  });

  // A scheduled install passes --restart-kiosk: once the new release answers,
  // the job ends the kiosk session (the autologin cycle starts it again on
  // the new programs) and drops the restart note. A failed finalize, which
  // put the old tree back, restarts nothing and keeps the job's own status.
  function runRestartJob(flag: boolean, httpCode: string, afterNote?: () => void) {
    writeFileSync(path.join(bin, 'systemctl'), `#!/bin/sh\ncase "$1" in is-active) exit 0;; show) if [ -f "${directory}/restarted" ]; then echo 222; else echo 111; fi;; restart) touch "${directory}/restarted";; esac\nexit 0\n`, { mode: 0o755 });
    writeFileSync(path.join(bin, 'systemd-run'), `#!/bin/sh\nprintf '%s\\0' "$@" > "${directory}/systemd-run.args"\nexit 0\n`, { mode: 0o755 });
    writeFileSync(path.join(bin, 'pkill'), `#!/bin/sh\necho "$@" >> "${directory}/pkill.log"\nexit 0\n`, { mode: 0o755 });
    fakeCurl(httpCode);
    writeFileSync(path.join(current, 'data/restart-needed.json'), '{"bootId":"b","changed":["session-packages"],"version":"2.0.0","at":"now"}');
    afterNote?.();
    rmSync(path.join(directory, 'pkill.log'), { force: true });
    const restart = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'restart', ...(flag ? ['--restart-kiosk'] : [])], {
      cwd: directory, encoding: 'utf8', timeout: 20_000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(restart.status).toBe(0);
    const args = readFileSync(path.join(directory, 'systemd-run.args'), 'utf8').split('\0').filter(Boolean);
    const script = readFileSync(args.at(-1)!, 'utf8').replace(/sleep [0-9]+/g, 'true');
    const job = spawnSync('bash', ['-c', script], {
      cwd: directory, encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HS_FINALIZE_ATTEMPTS: '2', HS_FINALIZE_SLEEP: '0' },
    });
    const pkills = existsSync(path.join(directory, 'pkill.log')) ? readFileSync(path.join(directory, 'pkill.log'), 'utf8').trim() : '';
    return { job, pkills, noteKept: existsSync(path.join(current, 'data/restart-needed.json')) };
  }

  it('restart --restart-kiosk ends the kiosk session and drops the note once the new release answers', () => {
    const { job, pkills, noteKept } = runRestartJob(true, '200');
    expect(job.status).toBe(0);
    expect(pkills).toBe('-TERM chromium');
    expect(noteKept).toBe(false);
  });

  it('restart without the flag leaves the kiosk and the note alone', () => {
    const { job, pkills, noteKept } = runRestartJob(false, '200');
    expect(job.status).toBe(0);
    expect(pkills).toBe('');
    expect(noteKept).toBe(true);
  });

  it('restart --restart-kiosk restarts nothing when the new release never answered', () => {
    const { job, pkills } = runRestartJob(true, '000');
    expect(job.status).toBe(1);
    expect(pkills).toBe('');
  });

  // The server that installs this release is the previous one, which knows
  // no flag. The automatic update's own record on disk says the install was
  // scheduled, and the restart note says what it left, so restart reads both.
  const scheduledState = (tag: string, pending: boolean) =>
    JSON.stringify({ runDate: '2026-10-11', at: '2026-10-11T04:00:00.000Z', result: 'installed', tag, pending });

  it('restart without the flag still cycles the kiosk for a pending automatic install of this version', () => {
    writeFileSync(path.join(current, 'data/auto-update-state.json'), scheduledState('v2.0.0', true));
    const { job, pkills, noteKept } = runRestartJob(false, '200');
    expect(job.status).toBe(0);
    expect(pkills).toBe('-TERM chromium');
    expect(noteKept).toBe(false);
  });

  it('restart without the flag leaves the kiosk alone when the record is settled, names another version, or the note needs no restart', () => {
    writeFileSync(path.join(current, 'data/auto-update-state.json'), scheduledState('v2.0.0', false));
    expect(runRestartJob(false, '200').pkills).toBe('');
    writeFileSync(path.join(current, 'data/auto-update-state.json'), scheduledState('v1.9.0', true));
    expect(runRestartJob(false, '200').pkills).toBe('');
    writeFileSync(path.join(current, 'data/auto-update-state.json'), scheduledState('v2.0.0', true));
    const note = path.join(current, 'data/restart-needed.json');
    const run = runRestartJob(false, '200', () => writeFileSync(note, '{"bootId":"b","changed":["packages","labwc-rc"],"version":"2.0.0","at":"now"}'));
    expect(run.pkills).toBe('');
    expect(run.noteKept).toBe(true);
  });

  it('prepare-deploy clears a failed tree left by an earlier attempt', () => {
    mkdirSync(`${current}.failed`);
    mkdirSync(`${current}.staging`);
    const result = spawnSync('bash', [path.join(current, 'scripts/upgrade.sh'), 'prepare-deploy'], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(`${current}.failed`)).toBe(false);
  });
});
