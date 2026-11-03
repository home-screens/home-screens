import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseSetupSystemChanges, restartNeededFor, RESTART_NEEDED_CHANGES } from '../restart-needed';

/**
 * Which setup-system changes a running wall only picks up after a restart.
 * The list is judged per change name, so every name setup-system can report
 * is sorted into one side or the other below: a new change added to the
 * script without a decision here fails the last test.
 */

/** Every change name setup-system can print, sorted by whether the wall needs a restart for it. */
const NEEDS_RESTART = ['launcher', 'bash-profile', 'labwc-autostart', 'legacy-kiosk', 'session-packages'];
const NO_NOTICE = [
  // Only matter at the next boot, and nothing on the wall looks wrong until then.
  'cmdline', 'config-txt', 'plymouth', 'plymouth-packages', 'plymouth-delay', 'boot-target', 'autologin',
  'brcmfmac-modprobe', 'tmpfs-mounts', 'purge-dphys-swapfile', 'purge-zram-tools', 'remove-swapfile', 'zram-sysctl',
  // Live already, or for the service rather than the kiosk session.
  // `packages` is any install at all; the ones a session runs are reported
  // again as `session-packages`.
  // setup-system puts a changed kiosk.conf on the screen itself.
  'packages', 'kiosk-conf', 'labwc-rc', 'fontconfig', 'emoji-font', 'sysctl-inotify', 'journald', 'fd-limits', 'service', 'reporter',
  'wifi-connection', 'wifi-dispatcher', 'wifi-memory', 'wifi-nm-conf', 'wifi-watchdog', 'wifi-watchdog-service',
  'wifi-watchdog-timer', 'mask-services', 'mask-suspend', 'disable-services', 'disable-dhcpcd',
  'cloud-init-hostname', 'cloud-init-network',
];

describe('the shell copy of the list', () => {
  // `upgrade.sh restart` decides the kiosk cycle of a scheduled install from
  // the restart note itself, with its own copy of these names.
  it('upgrade.sh names the same changes as RESTART_NEEDED_CHANGES', () => {
    const upgrade = readFileSync(path.join(process.cwd(), 'scripts', 'upgrade.sh'), 'utf-8');
    const match = upgrade.match(/const needs = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const names = match![1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    expect(names).toEqual([...RESTART_NEEDED_CHANGES]);
  });
});

describe('parseSetupSystemChanges', () => {
  it('reads the change names off the last line', () => {
    const output = [
      'Reading package lists...',
      '{"ok":true,"changed":"packages,launcher,labwc-rc"}',
    ].join('\n');
    expect(parseSetupSystemChanges(output)).toEqual(['packages', 'launcher', 'labwc-rc']);
  });

  it.each([
    ['nothing changed', '{"ok":true,"changed":null}'],
    ['an empty report', ''],
    ['output that is not JSON', 'setup-system: permission denied'],
    ['JSON without a change list', '{"ok":false,"error":"no sudo"}'],
    ['a change list that is not text', '{"ok":true,"changed":["launcher"]}'],
    ['JSON that is not an object', '42'],
  ])('reads %s as no changes', (_label, output) => {
    expect(parseSetupSystemChanges(output)).toEqual([]);
  });

  it('ignores stray commas and spaces', () => {
    expect(parseSetupSystemChanges('{"ok":true,"changed":"launcher,, packages ,"}')).toEqual(['launcher', 'packages']);
  });
});

describe('restartNeededFor', () => {
  it('keeps only what the running wall cannot pick up, in order, once each', () => {
    expect(restartNeededFor(['labwc-rc', 'packages', 'session-packages', 'cmdline', 'launcher', 'session-packages']))
      .toEqual(['session-packages', 'launcher']);
  });

  it('is empty when every change was live already or waits for the next boot anyway', () => {
    expect(restartNeededFor(['labwc-rc', 'brcmfmac-modprobe', 'tmpfs-mounts', 'cmdline'])).toEqual([]);
  });

  it('is empty after an install of packages the kiosk session does not run', () => {
    expect(restartNeededFor(['packages'])).toEqual([]);
  });

  it.each(NEEDS_RESTART)('asks for a restart after %s', (name) => {
    expect(restartNeededFor([name])).toEqual([name]);
  });

  it.each(NO_NOTICE)('does not ask for a restart after %s', (name) => {
    expect(restartNeededFor([name])).toEqual([]);
  });

  it('has setup-system put a changed kiosk.conf on the screen, which is why it needs no restart', () => {
    const source = readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'setup-system.sh'), 'utf-8');
    const written = source.indexOf('changed="${changed}kiosk-conf,"');
    const applied = source.indexOf('"${SCRIPT_DIR}/kiosk-outputs.sh" apply || true', written);
    const touch = source.indexOf('labwc-rc.sh" --create', written);
    expect(written).toBeGreaterThan(-1);
    // Inside the same branch, and before touch is turned to match.
    expect(applied).toBeGreaterThan(written);
    expect(applied - written).toBeLessThan(700);
    expect(touch).toBeGreaterThan(applied);
  });

  it('has a decision for every change name setup-system can report', () => {
    // The literal names setup-system appends to its change list. Names built
    // from variables (a display manager, a timer) are the disable-/enable-
    // and group families, which only matter at the next boot.
    const source = readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'setup-system.sh'), 'utf-8');
    const literal = [...source.matchAll(/changed="\$\{changed\}([a-z0-9-]+),"/g)].map((m) => m[1]);
    // Whole files installed from templates report the tag on their install line.
    const installed = [...source.matchAll(/hs_install_file \S+ 0[0-7]{3} ([a-z0-9-]+)/g)].map((m) => m[1]);
    const splash = [...readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'common.sh'), 'utf-8')
      .matchAll(/BOOT_SPLASH_CHANGES="\$\{BOOT_SPLASH_CHANGES\}([a-z0-9-]+),"/g)].map((m) => m[1]);
    const reported = [...new Set([...literal, ...installed, ...splash])];
    expect(reported.length).toBeGreaterThan(20);
    const decided = new Set([...NEEDS_RESTART, ...NO_NOTICE]);
    expect(reported.filter((name) => !decided.has(name))).toEqual([]);
    expect([...RESTART_NEEDED_CHANGES].sort()).toEqual([...NEEDS_RESTART].sort());
  });
});
