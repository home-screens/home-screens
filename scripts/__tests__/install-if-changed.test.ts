import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * hs_install_if_changed and hs_render_template in lib/common.sh: how
 * setup-system puts a system file in place.
 *
 * Every step of setup-system runs on every update, so the helper has to
 * leave an identical file untouched (a rewritten unit file is a reload and a
 * restart prompt for nothing) and say when it did write, so the step can run
 * what a new file needs. The functions run here exactly as common.sh defines
 * them, with a sudo that drops its own name: the files land in a temp tree.
 */

const COMMON = path.join(process.cwd(), 'scripts', 'lib', 'common.sh');

let root: string;
let bin: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'install-if-changed-'));
  bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'sudo'), '#!/usr/bin/env bash\nexec "$@"\n');
  chmodSync(path.join(bin, 'sudo'), 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run a snippet with common.sh sourced, the way upgrade.sh has it. */
function run(snippet: string, input = ''): string {
  return execFileSync('bash', ['-c', `set -euo pipefail\nsource "${COMMON}"\n${snippet}`], {
    encoding: 'utf-8',
    input,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_DIR: root },
  });
}

describe('hs_install_if_changed', () => {
  it('writes a missing file with the mode asked for, creating its directory, and prints the tag', () => {
    const target = path.join(root, 'etc', 'sysctl.d', '99-home-screens.conf');
    const out = run(`hs_install_if_changed "${target}" 0644 sysctl-inotify`, 'fs.inotify.max_user_watches=524288\n');
    expect(out).toBe('sysctl-inotify\n');
    expect(readFileSync(target, 'utf-8')).toBe('fs.inotify.max_user_watches=524288\n');
    expect(statSync(target).mode & 0o777).toBe(0o644);
  });

  it('rewrites a file that holds something else', () => {
    const target = path.join(root, 'wifi-watchdog.sh');
    writeFileSync(target, '#!/bin/bash\nold\n');
    const out = run(`hs_install_if_changed "${target}" 0755 wifi-watchdog`, '#!/bin/bash\nnew\n');
    expect(out).toBe('wifi-watchdog\n');
    expect(readFileSync(target, 'utf-8')).toBe('#!/bin/bash\nnew\n');
    expect(statSync(target).mode & 0o777).toBe(0o755);
  });

  it('leaves an identical file alone, its mtime included, and prints nothing', () => {
    const target = path.join(root, 'home-screens.conf');
    writeFileSync(target, '[Journal]\nStorage=volatile\n');
    const old = new Date('2020-01-02T03:04:05Z');
    utimesSync(target, old, old);
    const out = run(`hs_install_if_changed "${target}" 0644 journald`, '[Journal]\nStorage=volatile\n');
    expect(out).toBe('');
    expect(statSync(target).mtime.getTime()).toBe(old.getTime());
  });

  it('writes exactly one trailing newline, however the content ends, as the steps always did', () => {
    const target = path.join(root, 'one.conf');
    run(`hs_install_if_changed "${target}" 0644 one`, 'preserve_hostname: true');
    expect(readFileSync(target, 'utf-8')).toBe('preserve_hostname: true\n');
    const again = run(`hs_install_if_changed "${target}" 0644 one`, 'preserve_hostname: true\n\n\n');
    expect(again).toBe('');
  });

  it('is usable as a condition for what a new file needs', () => {
    const target = path.join(root, 'unit.service');
    const out = run([
      `if [ -n "$(hs_install_if_changed "${target}" 0644 service <<< "[Unit]")" ]; then echo reloaded; fi`,
      `if [ -n "$(hs_install_if_changed "${target}" 0644 service <<< "[Unit]")" ]; then echo reloaded; fi`,
    ].join('\n'));
    expect(out).toBe('reloaded\n');
  });
});

describe('hs_render_template', () => {
  it('replaces every {{NAME}} and nothing else', () => {
    const template = path.join(root, 'autologin.conf');
    writeFileSync(template, '[Service]\nExecStart=\nExecStart=-/sbin/agetty --autologin {{USER}} --noclear %I $TERM\n');
    const out = run(`hs_render_template "${template}" USER=hs`);
    expect(out).toBe('[Service]\nExecStart=\nExecStart=-/sbin/agetty --autologin hs --noclear %I $TERM\n');
  });

  it('takes several names, repeats and values with spaces, slashes, dollars and ampersands', () => {
    const template = path.join(root, 'unit.service');
    writeFileSync(template, 'User={{USER}}\nWorkingDirectory=-{{DIR}}\nExecStart={{EXEC}}\nExecStartPre=[ -d {{DIR}} ] || mv {{DIR}}.rollback {{DIR}}\n');
    const out = run(`hs_render_template "${template}" USER=hs "DIR=/opt/home & screens/cu\\$rrent" "EXEC=/usr/bin/node /opt/x/server.js"`);
    expect(out).toBe([
      'User=hs',
      'WorkingDirectory=-/opt/home & screens/cu$rrent',
      'ExecStart=/usr/bin/node /opt/x/server.js',
      'ExecStartPre=[ -d /opt/home & screens/cu$rrent ] || mv /opt/home & screens/cu$rrent.rollback /opt/home & screens/cu$rrent',
      '',
    ].join('\n'));
  });

  it('leaves a placeholder it was not given a value for as it is', () => {
    const template = path.join(root, 'limits.conf');
    writeFileSync(template, '{{USER}} soft nofile {{LIMIT}}\n');
    expect(run(`hs_render_template "${template}" USER=hs`)).toBe('hs soft nofile {{LIMIT}}\n');
  });

  it('renders every shipped template that carries a placeholder', () => {
    const dir = path.join(process.cwd(), 'scripts', 'system-files');
    expect(existsSync(dir)).toBe(true);
    const out = run(`for f in "${dir}"/*; do hs_render_template "$f" USER=hs WORKING_DIR=/opt/hs APP_DIR=/opt/hs "EXEC_START=/usr/bin/node /opt/hs/server.js" PORT=3000; done`);
    expect(out).not.toContain('{{');
  });
});
