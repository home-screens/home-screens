import { describe, it, expect } from 'vitest';
import {
  describeJoinFailure,
  ipv4Args,
  isOwnProfile,
  isPredecessorProfile,
  isSecuredNetwork,
  wifiProfileName,
  parseAddedConnectionUuid,
  wifiKeyManagement,
  wifiSecurityArgs,
  buildAddProfileArgs,
  buildModifyProfileArgs,
  buildUpArgs,
  WIFI_PROFILE_PRIORITY,
  WIFI_UP_WAIT_SECONDS,
} from '@/lib/wifi-profile';

const UUID = '3dedc095-8d54-4c45-aba4-486c1d87c9a2';

describe('wifiProfileName', () => {
  it('names the profile after the network and the adapter', () => {
    expect(wifiProfileName('HomeNet', 'wlan1')).toBe('HomeNet (wlan1)');
  });

  it('keeps spaces and punctuation in the SSID as typed', () => {
    expect(wifiProfileName("Kim's Café 5G", 'wlan0')).toBe("Kim's Café 5G (wlan0)");
  });
});

describe('parseAddedConnectionUuid', () => {
  it("reads the UUID from nmcli's success line", () => {
    expect(
      parseAddedConnectionUuid(`Connection 'HomeNet (wlan1)' (${UUID}) successfully added.\n`),
    ).toBe(UUID);
  });

  it('is not fooled by parentheses inside the profile name', () => {
    expect(
      parseAddedConnectionUuid(`Connection 'Guest (upstairs) (wlan0)' (${UUID}) successfully added.`),
    ).toBe(UUID);
  });

  it('returns null for anything else', () => {
    expect(parseAddedConnectionUuid('')).toBeNull();
    expect(parseAddedConnectionUuid('Error: failed to add connection')).toBeNull();
    expect(parseAddedConnectionUuid(`Connection 'x' (${UUID}) successfully deleted.`)).toBeNull();
  });
});

describe('wifiKeyManagement', () => {
  it.each([
    ['', undefined, 'open'],
    ['Open', undefined, 'open'],
    ['WPA2', undefined, 'open'],
    ['WPA2', 'password1', 'wpa-psk'],
    ['WPA1 WPA2', 'password1', 'wpa-psk'],
    ['WPA2 WPA3', 'password1', 'wpa-psk'],
    ['WPA3', 'password1', 'sae'],
    ['wpa3', 'password1', 'sae'],
    [undefined, 'password1', 'wpa-psk'],
    ['WEP', 'password1', 'wpa-psk'],
  ] as const)('security %j with password %j is %s', (security, password, expected) => {
    expect(wifiKeyManagement(security, password)).toBe(expected);
  });
});

describe('wifiSecurityArgs', () => {
  it('is empty for an open network', () => {
    expect(wifiSecurityArgs('open', undefined)).toEqual([]);
    expect(wifiSecurityArgs('wpa-psk', undefined)).toEqual([]);
  });

  it('sets key management and the password together', () => {
    expect(wifiSecurityArgs('wpa-psk', 'password1')).toEqual(['wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', 'password1']);
    expect(wifiSecurityArgs('sae', 'password1')).toEqual(['wifi-sec.key-mgmt', 'sae', 'wifi-sec.psk', 'password1']);
  });
});

describe('buildAddProfileArgs', () => {
  it('creates a pinned, prioritised WPA2 profile', () => {
    expect(buildAddProfileArgs({ ssid: 'HomeNet', iface: 'wlan1', password: 'password1', security: 'WPA2' })).toEqual([
      'connection', 'add',
      'type', 'wifi',
      'ifname', 'wlan1',
      'con-name', 'HomeNet (wlan1)',
      'ssid', 'HomeNet',
      'connection.autoconnect-priority', String(WIFI_PROFILE_PRIORITY),
      'wifi-sec.key-mgmt', 'wpa-psk',
      'wifi-sec.psk', 'password1',
    ]);
  });

  it('omits security for an open network', () => {
    const args = buildAddProfileArgs({ ssid: 'OpenCafe', iface: 'wlan0', security: 'Open' });
    expect(args).not.toContain('wifi-sec.key-mgmt');
    expect(args).not.toContain('wifi-sec.psk');
  });

  it('marks a hidden network so NetworkManager probes for it', () => {
    const args = buildAddProfileArgs({ ssid: 'Secret', iface: 'wlan0', password: 'password1', hidden: true });
    expect(args.slice(-2)).toEqual(['802-11-wireless.hidden', 'yes']);
    expect(args).toContain('wpa-psk');
  });

  it('never uses `device wifi connect`', () => {
    const args = buildAddProfileArgs({ ssid: 'HomeNet', iface: 'wlan0', password: 'password1' });
    expect(args.join(' ')).not.toMatch(/device wifi connect/);
  });
});

describe('buildModifyProfileArgs', () => {
  it('refreshes the password, hidden flag and priority in one modify', () => {
    expect(buildModifyProfileArgs(UUID, { ssid: 'HomeNet', iface: 'wlan1', password: 'newpass12', security: 'WPA2' })).toEqual([
      [
        'connection', 'modify', UUID,
        'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', 'newpass12',
        '802-11-wireless.hidden', 'no',
        'connection.autoconnect-priority', String(WIFI_PROFILE_PRIORITY),
      ],
    ]);
  });

  it('removes the whole security setting when the network is open, never an empty key-mgmt', () => {
    const calls = buildModifyProfileArgs(UUID, { ssid: 'OpenCafe', iface: 'wlan0', security: 'Open' });
    expect(calls[0]).toEqual(['connection', 'modify', UUID, 'remove', '802-11-wireless-security']);
    expect(calls[1]).not.toContain('wifi-sec.key-mgmt');
    for (const call of calls) expect(call).not.toContain('');
  });

  it('switches to SAE for a WPA3-only network', () => {
    const [call] = buildModifyProfileArgs(UUID, { ssid: 'New', iface: 'wlan0', password: 'password1', security: 'WPA3' });
    expect(call).toContain('sae');
  });
});

describe('isSecuredNetwork', () => {
  it('treats empty and Open as open, anything else as secured', () => {
    expect(isSecuredNetwork('')).toBe(false);
    expect(isSecuredNetwork(undefined)).toBe(false);
    expect(isSecuredNetwork('Open')).toBe(false);
    expect(isSecuredNetwork('WPA2')).toBe(true);
    expect(isSecuredNetwork('WPA1 WPA2')).toBe(true);
    expect(isSecuredNetwork('WPA3')).toBe(true);
  });
});

describe('buildModifyProfileArgs with keepSecurity', () => {
  it('leaves the saved password alone and never removes the security setting', () => {
    const calls = buildModifyProfileArgs(UUID, { ssid: 'HomeNet', iface: 'wlan0', security: 'WPA2' }, { keepSecurity: true });
    expect(calls).toEqual([
      ['connection', 'modify', UUID, '802-11-wireless.hidden', 'no', 'connection.autoconnect-priority', String(WIFI_PROFILE_PRIORITY)],
    ]);
    for (const call of calls) {
      expect(call).not.toContain('remove');
      expect(call).not.toContain('wifi-sec.key-mgmt');
    }
  });
});

describe('ipv4Args', () => {
  it('is empty for DHCP or nothing', () => {
    expect(ipv4Args(null)).toEqual([]);
    expect(ipv4Args(undefined)).toEqual([]);
    expect(ipv4Args({ method: 'auto' })).toEqual([]);
    expect(ipv4Args({ method: 'manual' })).toEqual([]);
  });

  it('copies a static address with its gateway and DNS', () => {
    expect(ipv4Args({ method: 'manual', addresses: '192.168.1.50/24', gateway: '192.168.1.1', dns: '1.1.1.1,8.8.8.8' })).toEqual([
      'ipv4.method', 'manual', 'ipv4.addresses', '192.168.1.50/24', 'ipv4.gateway', '192.168.1.1', 'ipv4.dns', '1.1.1.1,8.8.8.8',
    ]);
    expect(ipv4Args({ method: 'manual', addresses: '192.168.1.50/24' })).toEqual(['ipv4.method', 'manual', 'ipv4.addresses', '192.168.1.50/24']);
  });

  it('lands at the end of the add arguments', () => {
    const args = buildAddProfileArgs({ ssid: 'HomeNet', iface: 'wlan0', password: 'password1' }, { method: 'manual', addresses: '10.0.0.5/24' });
    expect(args.slice(-4)).toEqual(['ipv4.method', 'manual', 'ipv4.addresses', '10.0.0.5/24']);
  });
});

describe('isOwnProfile', () => {
  it('needs the name, the SSID and the adapter to agree', () => {
    expect(isOwnProfile({ name: 'HomeNet (wlan0)', ssid: 'HomeNet', iface: 'wlan0' }, 'HomeNet', 'wlan0')).toBe(true);
    // Same name, different network: a hand-made profile, not ours
    expect(isOwnProfile({ name: 'HomeNet (wlan0)', ssid: 'Other', iface: 'wlan0' }, 'HomeNet', 'wlan0')).toBe(false);
    // Same name, pinned to another adapter: activating it would touch wlan1
    expect(isOwnProfile({ name: 'HomeNet (wlan0)', ssid: 'HomeNet', iface: 'wlan1' }, 'HomeNet', 'wlan0')).toBe(false);
    expect(isOwnProfile({ name: 'HomeNet (wlan0)', ssid: 'HomeNet' }, 'HomeNet', 'wlan0')).toBe(false);
    expect(isOwnProfile({ name: 'preconfigured', ssid: 'HomeNet', iface: 'wlan0' }, 'HomeNet', 'wlan0')).toBe(false);
  });
});

describe('isPredecessorProfile', () => {
  it('is the same network pinned to this adapter or to none, and never our own', () => {
    expect(isPredecessorProfile({ name: 'preconfigured', ssid: 'HomeNet' }, 'HomeNet', 'wlan0')).toBe(true);
    expect(isPredecessorProfile({ name: 'HomeNet', ssid: 'HomeNet', iface: 'wlan0' }, 'HomeNet', 'wlan0')).toBe(true);
    expect(isPredecessorProfile({ name: 'HomeNet (wlan1)', ssid: 'HomeNet', iface: 'wlan1' }, 'HomeNet', 'wlan0')).toBe(false);
    expect(isPredecessorProfile({ name: 'Other', ssid: 'Other' }, 'HomeNet', 'wlan0')).toBe(false);
    expect(isPredecessorProfile({ name: 'HomeNet (wlan0)', ssid: 'HomeNet', iface: 'wlan0' }, 'HomeNet', 'wlan0')).toBe(false);
  });
});

describe('buildUpArgs', () => {
  it('activates by UUID and waits for the join', () => {
    expect(buildUpArgs(UUID)).toEqual(['--wait', String(WIFI_UP_WAIT_SECONDS), 'connection', 'up', 'uuid', UUID]);
  });
});

describe('describeJoinFailure', () => {
  const NMCLI_WRONG_PASSWORD =
    "Warning: password for '802-11-wireless-security.psk' not given in 'passwd-file' and nmcli cannot ask without '--ask' option.\n" +
    'Error: Connection activation failed: Secrets were required, but not provided\n' +
    "Hint: use 'journalctl -xe NM_CONNECTION=5aac3506-50f4-4866-ad82-7dffb78cb2eb + NM_DEVICE=wlan1' to get more details.";
  const NMCLI_NOT_FOUND =
    'Error: Connection activation failed: The Wi-Fi network could not be found\n' +
    "Hint: use 'journalctl -xe NM_CONNECTION=b6effb6d-2bba-4257-a3c2-a2a714af5c22 + NM_DEVICE=wlan1' to get more details.";

  it('says the password was not accepted', () => {
    expect(describeJoinFailure(NMCLI_WRONG_PASSWORD)).toBe('The password was not accepted. Check it and try again.');
  });

  it('says the network could not be found', () => {
    expect(describeJoinFailure(NMCLI_NOT_FOUND)).toBe('That network could not be found. Check the name and that it is in range.');
  });

  it('names a timeout', () => {
    expect(describeJoinFailure('Error: Timeout expired (45 seconds)')).toMatch(/did not answer in time/);
  });

  it('keeps the first error sentence of anything else and drops the journalctl hint', () => {
    expect(describeJoinFailure("Error: Connection activation failed: Device disconnected by user.\nHint: use 'journalctl -xe' to get more details."))
      .toBe('Connection activation failed: Device disconnected by user.');
    expect(describeJoinFailure('')).toBe('Connection failed');
  });
});
