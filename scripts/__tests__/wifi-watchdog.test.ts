import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * scripts/system-files/wifi-watchdog.sh, which setup-system installs at
 * /usr/local/bin/wifi-watchdog.sh and a timer runs every two minutes.
 *
 * It pings the gateway and, only when that fails, escalates: NetworkManager
 * reconnect, then an interface cycle, then a driver reload. Run here against
 * stubs that log every call and answer the ping as the test says.
 */

const WATCHDOG = path.join(process.cwd(), 'scripts', 'system-files', 'wifi-watchdog.sh');

let root: string;
let bin: string;
let log: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'wifi-watchdog-'));
  bin = path.join(root, 'bin');
  log = path.join(root, 'calls.log');
  mkdirSync(bin);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function stub(name: string, body: string) {
  writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${log}"\n${body}\n`);
  chmodSync(path.join(bin, name), 0o755);
}

/**
 * Run the watchdog. `pings` is what each successive ping answers (true for
 * reachable); once the list runs out the gateway stays unreachable.
 */
function run({ gateway = '192.168.1.1', pings = [] as boolean[], wifi = 'Home' } = {}) {
  const pingFile = path.join(root, 'pings');
  writeFileSync(pingFile, pings.map((ok) => (ok ? '0' : '1')).join('\n') + '\n');
  stub('ip', gateway ? `echo "default via ${gateway} dev wlan0 proto dhcp metric 600"` : 'exit 0');
  // Each ping consumes the next answer from the file.
  stub('ping', `answer=$(head -n 1 "${pingFile}"); tail -n +2 "${pingFile}" > "${pingFile}.next"; mv "${pingFile}.next" "${pingFile}"; exit "\${answer:-1}"`);
  stub('logger', '');
  stub('nmcli', wifi ? `[ "$1" = "-t" ] && printf '%s\\n' "Wired connection 1:802-3-ethernet" "${wifi}:802-11-wireless"; exit 0` : 'exit 0');
  stub('modprobe', '');
  stub('sleep', '');
  const result = spawnSync('bash', [WATCHDOG], { encoding: 'utf-8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } });
  const calls = existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n') : [];
  return { status: result.status, calls, messages: calls.filter((c) => c.startsWith('logger ')).map((c) => c.replace(/^logger -t wifi-watchdog /, '')) };
}

describe('wifi-watchdog.sh', () => {
  it('does nothing without a default route', () => {
    const { status, calls } = run({ gateway: '' });
    expect(status).toBe(0);
    expect(calls).toEqual(['ip route show default']);
  });

  it('is quiet while the gateway answers', () => {
    const { status, calls, messages } = run({ pings: [true] });
    expect(status).toBe(0);
    expect(calls).toEqual(['ip route show default', 'ping -c 3 -W 5 192.168.1.1']);
    expect(messages).toEqual([]);
  });

  it('reconnects through NetworkManager first', () => {
    const { status, calls, messages } = run({ pings: [false, true] });
    expect(status).toBe(0);
    expect(calls).toContain('nmcli connection up Home');
    expect(calls).not.toContain('nmcli device disconnect wlan0');
    expect(messages).toEqual(['Gateway unreachable, attempting NM reconnect', 'Reconnected via NM']);
  });

  it('gives up with an error when there is no WiFi connection to bring up', () => {
    const { status, calls } = run({ pings: [false], wifi: '' });
    expect(status).toBe(1);
    expect(calls.filter((c) => c.startsWith('nmcli connection up'))).toEqual([]);
  });

  it('cycles the interface when the reconnect did not help', () => {
    const { status, calls, messages } = run({ pings: [false, false, true] });
    expect(status).toBe(0);
    expect(calls).toContain('nmcli device disconnect wlan0');
    expect(calls).toContain('nmcli device connect wlan0');
    expect(calls.filter((c) => c.startsWith('modprobe'))).toEqual([]);
    expect(messages.at(-1)).toBe('Reconnected via interface cycle');
  });

  it('reloads the driver as the last resort and brings the connection up again', () => {
    const { calls, messages } = run({ pings: [false, false, false] });
    expect(calls).toContain('modprobe -r brcmfmac');
    expect(calls).toContain('modprobe brcmfmac');
    expect(calls.filter((c) => c === 'nmcli connection up Home')).toHaveLength(2);
    expect(messages).toEqual([
      'Gateway unreachable, attempting NM reconnect',
      'NM reconnect failed, cycling wlan0',
      'Interface cycle failed, reloading brcmfmac',
      'Driver reloaded, connection attempt sent',
    ]);
  });
});
