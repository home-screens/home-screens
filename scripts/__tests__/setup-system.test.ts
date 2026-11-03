import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import os from 'os';
import path from 'path';
import { buildKioskConf } from '@/lib/kiosk';
import type { ScreenConfiguration } from '@/types/config';

/**
 * `upgrade.sh setup-system` end to end: every step of lib/setup-system.sh
 * run as one, against a tree copied from the repo and stubs for every
 * privileged and system command. The sudo stub logs what it was asked to run
 * and keeps whatever was piped into tee, so what the steps would have put in
 * /etc is checked against the templates in scripts/system-files/ without
 * touching this machine. What lands in the tree itself (the launcher,
 * kiosk.conf, the labwc config, .bash_profile) is written for real, into
 * the temp copy.
 */

const REPO = process.cwd();
const SYSTEM_FILES = path.join(REPO, 'scripts', 'system-files');
const template = (name: string) => readFileSync(path.join(SYSTEM_FILES, name), 'utf-8');

const CONFIG = {
  settings: { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal', piVariant: 'lite' },
  displays: [{ id: 'main', name: 'Main', displayTransform: '90', touchMatrix: [0, -1, 1, 1, 0, 0] }],
};

let root: string;
let app: string;
let home: string;
let sudoLog: string;
let output: { status: number | null; stdout: string; stderr: string };
/** Every `sudo tee <path>` (and `tee -a`) with the content it received. */
let written: Map<string, string>;
let sudoCalls: string[];

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'setup-system-'));
  app = path.join(root, 'app');
  home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  sudoLog = path.join(root, 'sudo.log');
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(home);
  mkdirSync(bin);
  // dereference: the sandboxed cwd reaches scripts/ through a symlink, and a
  // copied link would send the launcher this run writes into the real tree.
  cpSync(path.join(REPO, 'scripts'), path.join(app, 'scripts'), { recursive: true, dereference: true });
  // A tarball install: the service runs node server.js directly.
  writeFileSync(path.join(app, 'server.js'), '');
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version: '1.15.0' }));
  writeFileSync(path.join(app, 'data', 'config.json'), JSON.stringify(CONFIG));
  writeFileSync(sudoLog, '');

  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  };
  // sudo: reads and compares for real, keeps what tee is given, logs the rest.
  stub('sudo', [
    'case "$1" in',
    '  cat) shift; exec cat "$@" ;;',
    '  cmp) shift; exec cmp "$@" ;;',
    `  tee) echo "sudo tee \${*:2}" >> "${sudoLog}"; echo "<<<" >> "${sudoLog}"; cat >> "${sudoLog}"; echo ">>>" >> "${sudoLog}"; exit 0 ;;`,
    `  env) shift; while [[ "\${1:-}" == *=* ]]; do shift; done; echo "sudo $*" >> "${sudoLog}"; exit 0 ;;`,
    `  *) echo "sudo $*" >> "${sudoLog}"; exit 0 ;;`,
    'esac',
  ].join('\n'));
  // Nothing installed, so the packages step and the boot splash both install.
  stub('dpkg', 'exit 1');
  stub('apt-get', 'exit 0');
  // A Pi fresh from a desktop image: graphical boot, everything enabled.
  stub('systemctl', 'case "$1" in get-default) echo graphical.target ;; is-enabled) echo enabled ;; *) exit 0 ;; esac');
  stub('getent', 'exit 0');
  stub('usermod', 'exit 0');
  stub('nmcli', 'exit 0');
  stub('fc-cache', 'exit 0');
  // An SD card.
  stub('findmnt', 'echo /dev/mmcblk0p2');
  stub('lsblk', 'echo mmcblk0');
  // No kiosk session running: nothing to put on a screen, no restart marker.
  stub('pgrep', 'exit 1');
  stub('pkill', 'exit 0');
  stub('wlr-randr', 'exit 0');
  stub('kanshi', 'exit 0');
  stub('kanshictl', 'exit 0');
  stub('wtype', 'exit 0');
  stub('labwc', 'echo "labwc 0.8.4"');

  output = spawnSync('bash', [path.join(app, 'scripts', 'upgrade.sh'), 'setup-system'], {
    cwd: app,
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, USER: 'hs', PATH: `${bin}:${process.env.PATH}` },
  });

  written = new Map();
  sudoCalls = [];
  const lines = readFileSync(sudoLog, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const tee = lines[i].match(/^sudo tee (?:-a )?(.+)$/);
    if (tee && lines[i + 1] === '<<<') {
      const end = lines.indexOf('>>>', i + 2);
      written.set(tee[1], lines.slice(i + 2, end).join('\n') + '\n');
      i = end;
      continue;
    }
    if (lines[i].startsWith('sudo ')) sudoCalls.push(lines[i]);
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The change names reported, without the ones that depend on this machine. */
function reported(): string[] {
  const last = output.stdout.trim().split('\n').at(-1) ?? '';
  const changed = (JSON.parse(last) as { changed: string | null }).changed ?? '';
  // /etc/cloud exists on some hosts and not others, and so does a Plymouth
  // theme setter; what those steps do is covered by the files they write.
  return changed.split(',').filter((name) => !name.startsWith('cloud-init-') && name !== 'plymouth');
}

describe('upgrade.sh setup-system', () => {
  it('runs every step and reports what changed on one JSON line', () => {
    expect(output.status, output.stderr).toBe(0);
    expect(reported()).toEqual([
      'packages', 'session-packages', 'fontconfig', 'emoji-font', 'service', 'reporter', 'boot-target',
      'lightdm', 'gdm3', 'sddm', 'legacy-kiosk', 'autologin', 'kiosk-conf', 'launcher', 'labwc-rc', 'bash-profile',
      'plymouth-packages', 'plymouth-delay', 'brcmfmac-modprobe', 'wifi-memory', 'wifi-nm-conf', 'mask-suspend',
      'wifi-watchdog', 'wifi-watchdog-service', 'wifi-watchdog-timer', 'journald', 'zram-sysctl',
      'disable-services', 'mask-services', 'disable-fstrim.timer', 'disable-e2scrub_all.timer', 'fd-limits',
      'tmpfs-mounts', 'wifi-dispatcher', 'disable-systemd-networkd-wait-online.service',
      'disable-NetworkManager-wait-online.service', 'disable-dhcpcd', 'sysctl-inotify',
    ]);
  });

  it.each([
    ['/etc/fonts/conf.d/01-emoji.conf', 'fontconfig-01-emoji.conf'],
    ['/etc/modprobe.d/brcmfmac.conf', 'modprobe-brcmfmac.conf'],
    ['/etc/sysctl.d/98-wifi-memory.conf', 'sysctl-98-wifi-memory.conf'],
    ['/etc/NetworkManager/conf.d/wifi-powersave.conf', 'networkmanager-wifi-powersave.conf'],
    ['/usr/local/bin/wifi-watchdog.sh', 'wifi-watchdog.sh'],
    ['/etc/systemd/system/wifi-watchdog.service', 'wifi-watchdog.service'],
    ['/etc/systemd/system/wifi-watchdog.timer', 'wifi-watchdog.timer'],
    ['/etc/systemd/journald.conf.d/home-screens.conf', 'journald-home-screens.conf'],
    ['/etc/sysctl.d/99-home-screens-zram.conf', 'sysctl-99-home-screens-zram.conf'],
    ['/etc/fstab', 'fstab-tmpfs'],
    ['/etc/NetworkManager/dispatcher.d/99-wifi-autoconnect', 'networkmanager-99-wifi-autoconnect'],
    ['/etc/sysctl.d/99-home-screens.conf', 'sysctl-99-home-screens.conf'],
  ])('writes %s from the template %s', (target, name) => {
    expect(written.get(target)).toBe(template(name));
  });

  it('fills the service unit in for this tree', () => {
    const node = execFileSync('which', ['node'], { encoding: 'utf-8' }).trim();
    expect(written.get('/etc/systemd/system/home-screens.service')).toBe(
      template('home-screens.service')
        .replaceAll('{{USER}}', 'hs')
        .replaceAll('{{WORKING_DIR}}', app)
        .replaceAll('{{APP_DIR}}', app)
        .replaceAll('{{EXEC_START}}', `${node} ${app}/server.js`)
        .replaceAll('{{PORT}}', '3000'),
    );
    expect(sudoCalls).toContain('sudo systemctl enable home-screens.service');
  });

  it('fills the account into autologin and the descriptor limits', () => {
    expect(written.get('/etc/systemd/system/getty@tty1.service.d/autologin.conf')).toBe(
      '[Service]\nExecStart=\nExecStart=-/sbin/agetty --autologin hs --noclear %I $TERM\n',
    );
    expect(written.get('/etc/security/limits.d/99-home-screens.conf')).toBe('hs soft nofile 65536\nhs hard nofile 65536\n');
  });

  it('keeps the cloud-init drop-ins as one line each', () => {
    expect(template('cloud-init-hostname.cfg')).toBe('preserve_hostname: true\n');
    expect(template('cloud-init-network.cfg')).toBe('network: {config: disabled}\n');
  });

  it('makes the scripts it installs executable and the rest plain files', () => {
    expect(sudoCalls).toContain('sudo chmod 0755 /usr/local/bin/wifi-watchdog.sh');
    expect(sudoCalls).toContain('sudo chmod 0755 /etc/NetworkManager/dispatcher.d/99-wifi-autoconnect');
    expect(sudoCalls).toContain('sudo chmod 0644 /etc/systemd/system/wifi-watchdog.timer');
    expect(sudoCalls).toContain('sudo systemctl enable wifi-watchdog.timer');
  });

  it('installs the hub launcher as kiosk-launcher.sh, executable and unchanged', () => {
    const launcher = path.join(app, 'scripts', 'kiosk-launcher.sh');
    expect(readFileSync(launcher, 'utf-8')).toBe(readFileSync(path.join(REPO, 'scripts', 'kiosk-launcher-hub.sh'), 'utf-8'));
    expect(statSync(launcher).mode & 0o111).not.toBe(0);
  });

  it('writes kiosk.conf the way the app writes it', () => {
    expect(readFileSync(path.join(app, 'data', 'kiosk.conf'), 'utf-8')).toBe(buildKioskConf(CONFIG as unknown as ScreenConfiguration));
  });

  it('points the autologin shell at the launcher, for the variant kiosk.conf names', () => {
    const profile = readFileSync(path.join(home, '.bash_profile'), 'utf-8');
    expect(profile).toContain(`exec dbus-run-session -- labwc --session ${app}/scripts/kiosk-launcher.sh`);
  });

  it('installs the reporter files from the tree', () => {
    expect(sudoCalls).toContain(`sudo install -m 0755 ${app}/scripts/reporter.sh /usr/local/bin/home-screens-reporter.sh`);
  });
});
