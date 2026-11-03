import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * How setup-system records "restart to finish the update".
 *
 * It writes the marker itself because an update runs the pipeline of the
 * release it replaces, which may know nothing about it, while setup-system
 * always comes from the release being installed. Two functions in upgrade.sh
 * do the work, run here exactly as the script defines them:
 *
 * - hs_launcher_changed: a tarball update arrives without the generated
 *   launcher, so "missing here" is not "changed". The tree it replaced
 *   (current.rollback) has the launcher the running session came from.
 * - hs_record_restart_changes: adds this run's changes to the boot's marker,
 *   only while a kiosk session is running to be out of date.
 * - hs_installs_session_package: whether an install brought a program the
 *   kiosk session runs, which is the only kind of package worth a restart.
 */

const UPGRADE = readFileSync(path.join(process.cwd(), 'scripts', 'upgrade.sh'), 'utf-8');

/** A function's whole definition out of upgrade.sh. */
function definition(name: string): string {
  const start = UPGRADE.indexOf(`${name}() {`);
  if (start < 0) throw new Error(`no ${name} in upgrade.sh`);
  const end = UPGRADE.indexOf('\n}\n', start);
  return UPGRADE.slice(start, end + 3);
}

let root: string;
let app: string;
let bin: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'restart-marker-'));
  app = path.join(root, 'current');
  bin = path.join(root, 'bin');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version: '1.14.0' }));
  writeFileSync(path.join(root, 'boot_id'), 'boot-1\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run a snippet with the two functions defined, the way setup-system runs. */
function run(snippet: string, { sessionRunning = true, env = {} }: { sessionRunning?: boolean; env?: Record<string, string> } = {}) {
  // pgrep answers whether labwc (the kiosk session) is running for the user.
  writeFileSync(path.join(bin, 'pgrep'), `#!/usr/bin/env bash\n${sessionRunning ? 'echo 1234; exit 0' : 'exit 1'}\n`);
  chmodSync(path.join(bin, 'pgrep'), 0o755);
  const script = [
    'set -euo pipefail',
    `APP_DIR="${app}"`,
    definition('hs_launcher_changed'),
    definition('hs_installs_session_package'),
    definition('hs_record_restart_changes'),
    snippet,
  ].join('\n');
  return execFileSync('bash', ['-c', script], {
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, USER: 'hs', HS_BOOT_ID_PATH: path.join(root, 'boot_id'), ...env },
  }).trim();
}

const markerFile = () => path.join(app, 'data', 'restart-needed.json');
const readMarker = () => JSON.parse(readFileSync(markerFile(), 'utf-8'));

describe('hs_launcher_changed', () => {
  const ask = (desired: string) =>
    run(`if hs_launcher_changed ${JSON.stringify(desired)} "${app}/scripts/kiosk-launcher.sh" "${app}.rollback/scripts/kiosk-launcher.sh"; then echo changed; else echo same; fi`);

  it('says same when the launcher in place is already the desired one', () => {
    writeFileSync(path.join(app, 'scripts', 'kiosk-launcher.sh'), 'LAUNCHER v1\n');
    expect(ask('LAUNCHER v1')).toBe('same');
  });

  it('says changed when the launcher in place differs', () => {
    writeFileSync(path.join(app, 'scripts', 'kiosk-launcher.sh'), 'LAUNCHER v1\n');
    expect(ask('LAUNCHER v2')).toBe('changed');
  });

  it('says same after a tarball update that brought the same launcher', () => {
    // The new tree has no launcher yet; the tree it replaced has the one the
    // running session started from.
    mkdirSync(path.join(`${app}.rollback`, 'scripts'), { recursive: true });
    writeFileSync(path.join(`${app}.rollback`, 'scripts', 'kiosk-launcher.sh'), 'LAUNCHER v1\n');
    expect(ask('LAUNCHER v1')).toBe('same');
  });

  it('says changed after a tarball update that brought a different launcher', () => {
    mkdirSync(path.join(`${app}.rollback`, 'scripts'), { recursive: true });
    writeFileSync(path.join(`${app}.rollback`, 'scripts', 'kiosk-launcher.sh'), 'LAUNCHER v1\n');
    expect(ask('LAUNCHER v2')).toBe('changed');
  });

  it('says changed on a fresh install, with no launcher anywhere', () => {
    expect(ask('LAUNCHER v1')).toBe('changed');
  });
});

describe('hs_installs_session_package', () => {
  const ask = (packages: string) =>
    run(`if hs_installs_session_package ${packages}; then echo session; else echo other; fi`);

  // Every program the kiosk session runs (SYSTEM_PACKAGES in lib/common.sh),
  // installed or brought to a newer version.
  it.each(['kanshi', 'wlopm', 'chromium', 'labwc', 'wlr-randr', 'wtype', 'vim kanshi fonts-dejavu-core'])('says session for %s', (packages) => {
    expect(ask(packages)).toBe('session');
  });

  it.each(['vim', 'fonts-noto-color-emoji plymouth plymouth-themes', 'libwlroots-0.20', ''])('says other for "%s"', (packages) => {
    expect(ask(packages)).toBe('other');
  });

  it('is what setup-system asks before reporting session-packages', () => {
    const setupSystem = readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'setup-system.sh'), 'utf-8');
    expect(setupSystem).toMatch(/if hs_installs_session_package \$\{missing\}; then\n\s+changed="\$\{changed\}session-packages,"/);
  });
});

describe('hs_record_restart_changes', () => {
  it('records the changes, the boot and the release while the kiosk is running', () => {
    run('hs_record_restart_changes "packages,launcher"');
    const marker = readMarker();
    expect(marker).toMatchObject({ bootId: 'boot-1', changed: ['packages', 'launcher'], version: '1.14.0' });
    expect(Number.isNaN(Date.parse(marker.at))).toBe(false);
    expect(existsSync(`${markerFile()}.tmp`)).toBe(false);
  });

  it('adds a second run to the first on the same boot', () => {
    run('hs_record_restart_changes "packages"');
    run('hs_record_restart_changes "launcher,packages"');
    expect(readMarker().changed).toEqual(['packages', 'launcher']);
  });

  it('starts over on a new boot', () => {
    run('hs_record_restart_changes "packages"');
    writeFileSync(path.join(root, 'boot_id'), 'boot-2\n');
    run('hs_record_restart_changes "launcher"');
    expect(readMarker()).toMatchObject({ bootId: 'boot-2', changed: ['launcher'] });
  });

  it('records nothing with no kiosk session running (first boot, a fresh install)', () => {
    run('hs_record_restart_changes "launcher,packages"', { sessionRunning: false });
    expect(existsSync(markerFile())).toBe(false);
  });

  it('records nothing in the image build', () => {
    run('hs_record_restart_changes "launcher"', { env: { HS_CHROOT: '1' } });
    expect(existsSync(markerFile())).toBe(false);
  });

  it('records nothing where there is no boot id', () => {
    run('hs_record_restart_changes "launcher"', { env: { HS_BOOT_ID_PATH: path.join(root, 'missing') } });
    expect(existsSync(markerFile())).toBe(false);
  });

  it('never fails setup-system, even when the marker cannot be written', () => {
    rmSync(path.join(app, 'data'), { recursive: true, force: true });
    writeFileSync(path.join(app, 'data'), 'not a directory');
    expect(run('hs_record_restart_changes "launcher"; echo still-running')).toBe('still-running');
  });
});
