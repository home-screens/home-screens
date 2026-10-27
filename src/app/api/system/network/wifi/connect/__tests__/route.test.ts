/**
 * Route-level tests for `POST /api/system/network/wifi/connect`.
 *
 * The nmcli / rollback / watchdog plumbing lives in `network-commands` and is
 * mocked; the real `network-validation` validators and the real
 * `wifi-profile` argument builders run, so what is asserted here is the exact
 * nmcli command shape the Pi will see. `child_process` is stubbed for the
 * best-effort cloud-init drop-in write. Auth is stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The route asks for passwordless sudo before touching the system; ready by
// default here, and a test can flip it to exercise the 409 that opens the
// editor's password prompt.
const { sudoState } = vi.hoisted(() => ({ sudoState: { ready: true } }));
vi.mock('@/lib/sudo-grant', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireSudo: async () =>
      sudoState.ready
        ? null
        : NextResponse.json({ ok: false, error: 'needs password', needsSudoPassword: true }, { status: 409 }),
  };
});

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => ''),
  nmcliSudo: vi.fn(async () => ''),
  listWifiProfiles: vi.fn(async () => []),
  getManagementInterface: vi.fn(async () => 'eth0'),
  getOtherReachableAddress: vi.fn(async () => null),
  inhibitWatchdog: vi.fn(async () => {}),
  uninhibitWatchdog: vi.fn(async () => {}),
  scheduleRollback: vi.fn(() => 'rollback-id-1'),
  hasActiveRollback: vi.fn(() => false),
  ensureSourceRouting: vi.fn(async () => {}),
  isPotentiallyManagementInterface: vi.fn(() => false),
  readConnectionIpv4Settings: vi.fn(async () => ({ method: 'auto' })),
}));

// The cloud-init drop-in uses execFile callback form with a stdin pipe.
vi.mock('child_process', () => ({
  execFile: () => ({
    stdin: { write: vi.fn(), end: vi.fn() },
    on: (event: string, handler: () => void) => {
      if (event === 'close') queueMicrotask(handler);
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import {
  nmcliSudo,
  listWifiProfiles,
  getOtherReachableAddress,
  isPotentiallyManagementInterface,
  hasActiveRollback,
} from '@/lib/network-commands';

const mockNmcliSudo = vi.mocked(nmcliSudo);
const mockListProfiles = vi.mocked(listWifiProfiles);
const mockOtherAddress = vi.mocked(getOtherReachableAddress);
const mockIsManagement = vi.mocked(isPotentiallyManagementInterface);
const mockHasActiveRollback = vi.mocked(hasActiveRollback);

const NEW_UUID = '11111111-2222-3333-4444-555555555555';
const EXISTING_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ADDED_LINE = `Connection 'HomeNet (wlan0)' (${NEW_UUID}) successfully added.\n`;
const UP_LINE = 'Connection successfully activated (D-Bus active path: /org/freedesktop/NetworkManager/ActiveConnection/7)\n';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/wifi/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Every nmcli invocation, in order, as space-joined strings. */
function sudoCalls(): string[] {
  return mockNmcliSudo.mock.calls.map(([args]) => args.join(' '));
}

/** nmcli answers the add with its success line and everything else with the activation line. */
function answerNmcli() {
  mockNmcliSudo.mockImplementation(async (args: string[]) =>
    args[0] === 'connection' && args[1] === 'add' ? ADDED_LINE : UP_LINE,
  );
}

describe('POST /api/system/network/wifi/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagement.mockReturnValue(false);
    mockHasActiveRollback.mockReturnValue(false);
    mockListProfiles.mockResolvedValue([]);
    mockOtherAddress.mockResolvedValue(null);
    answerNmcli();
  });

  describe('validation ladder', () => {
    it('rejects an empty SSID with 400', async () => {
      const res = await POST(postRequest({ ssid: '', iface: 'wlan0' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/SSID/);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('rejects a too-short password with 400', async () => {
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'short', iface: 'wlan0' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/at least 8/);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('rejects an invalid interface name with 400', async () => {
      const res = await POST(postRequest({ ssid: 'HomeNet', iface: 'bad iface!' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Interface name/);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('rejects a security hint that is not a short string', async () => {
      const res = await POST(postRequest({ ssid: 'HomeNet', iface: 'wlan0', security: 'x'.repeat(65) }));
      expect(res.status).toBe(400);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });
  });

  describe('management interface guards', () => {
    it('returns 409 when a rollback is already pending on the management interface', async () => {
      mockIsManagement.mockReturnValue(true);
      mockHasActiveRollback.mockReturnValue(true);
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/already pending/);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('asks for confirmation before touching the management interface, naming the kind', async () => {
      mockIsManagement.mockReturnValue(true);
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.requiresConfirmation).toBe(true);
      expect(body.warningKind).toBe('connect');
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('schedules a rollback and reports its id when the management join is confirmed', async () => {
      mockIsManagement.mockReturnValue(true);
      const { nmcli } = await import('@/lib/network-commands');
      vi.mocked(nmcli).mockResolvedValue(`${EXISTING_UUID}:wlan0:802-11-wireless\n`);
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', confirmed: true }));
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.rollbackId).toBe('rollback-id-1');
    });
  });

  describe('profile sequence', () => {
    it('adds a pinned profile and brings it up by UUID when none exists', async () => {
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security: 'WPA2' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.profileId).toBe(NEW_UUID);
      expect(body.connection).toMatch(/successfully activated/);

      expect(mockNmcliSudo.mock.calls[0][0]).toEqual([
        'connection', 'add', 'type', 'wifi', 'ifname', 'wlan0', 'con-name', 'HomeNet (wlan0)', 'ssid', 'HomeNet',
        'connection.autoconnect-priority', '10', 'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', 'password1',
      ]);
      expect(mockNmcliSudo.mock.calls[1][0]).toEqual(['--wait', '45', 'connection', 'up', 'uuid', NEW_UUID]);
      // The activation gets a longer exec timeout than the 15 s default so nmcli's own wait wins.
      expect(mockNmcliSudo.mock.calls[1][1]).toEqual({ timeoutMs: 55_000 });
    });

    it('modifies the existing Home Screens profile instead of adding a second one', async () => {
      mockListProfiles.mockResolvedValue([
        { name: 'HomeNet', uuid: 'ffffffff-0000-0000-0000-000000000000', ssid: 'HomeNet', autoconnect: true, timestamp: 0 },
        { name: 'HomeNet (wlan0)', uuid: EXISTING_UUID, ssid: 'HomeNet', iface: 'wlan0', autoconnect: true, timestamp: 1 },
      ]);
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'newpass12', iface: 'wlan0', security: 'WPA2' }));
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.profileId).toBe(EXISTING_UUID);

      const calls = sudoCalls();
      expect(calls.some((c) => c.startsWith('connection add'))).toBe(false);
      expect(calls.some((c) => c.startsWith('connection delete'))).toBe(false);
      expect(mockNmcliSudo.mock.calls[0][0]).toEqual([
        'connection', 'modify', EXISTING_UUID,
        'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', 'newpass12',
        '802-11-wireless.hidden', 'no',
        'connection.autoconnect-priority', '10',
      ]);
      expect(mockNmcliSudo.mock.calls[1][0]).toEqual(['--wait', '45', 'connection', 'up', 'uuid', EXISTING_UUID]);
    });

    it('matches the profile by adapter, so wlan1 gets its own profile for a network wlan0 already has', async () => {
      mockListProfiles.mockResolvedValue([
        { name: 'HomeNet (wlan0)', uuid: EXISTING_UUID, ssid: 'HomeNet', iface: 'wlan0', autoconnect: true, timestamp: 1 },
      ]);
      mockNmcliSudo.mockImplementation(async (args: string[]) =>
        args[1] === 'add' ? `Connection 'HomeNet (wlan1)' (${NEW_UUID}) successfully added.` : UP_LINE,
      );
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan1', security: 'WPA2' }));
      expect((await res.json()).profileId).toBe(NEW_UUID);
      expect(mockNmcliSudo.mock.calls[0][0]).toContain('HomeNet (wlan1)');
      expect(mockNmcliSudo.mock.calls[0][0]).toEqual(expect.arrayContaining(['ifname', 'wlan1']));
    });

    it.each([
      ['WPA2', 'wpa-psk'],
      ['WPA1 WPA2', 'wpa-psk'],
      ['WPA2 WPA3', 'wpa-psk'],
      ['WPA3', 'sae'],
    ])('maps scan security %j to key management %s', async (security, keyMgmt) => {
      await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security }));
      const add = mockNmcliSudo.mock.calls[0][0];
      expect(add[add.indexOf('wifi-sec.key-mgmt') + 1]).toBe(keyMgmt);
    });

    it('omits every security argument for an open network', async () => {
      await POST(postRequest({ ssid: 'OpenCafe', iface: 'wlan0', security: 'Open' }));
      const add = mockNmcliSudo.mock.calls[0][0];
      expect(add).not.toContain('wifi-sec.key-mgmt');
      expect(add).not.toContain('wifi-sec.psk');
      expect(add.join(' ')).not.toMatch(/password/);
    });

    it('strips security from an existing profile when the network is now open', async () => {
      mockListProfiles.mockResolvedValue([
        { name: 'OpenCafe (wlan0)', uuid: EXISTING_UUID, ssid: 'OpenCafe', iface: 'wlan0', autoconnect: true, timestamp: 1 },
      ]);
      await POST(postRequest({ ssid: 'OpenCafe', iface: 'wlan0', security: 'Open' }));
      expect(mockNmcliSudo.mock.calls[0][0]).toEqual(['connection', 'modify', EXISTING_UUID, 'remove', '802-11-wireless-security']);
      expect(mockNmcliSudo.mock.calls[1][0]).not.toContain('wifi-sec.key-mgmt');
    });

    it('keeps the saved password when a secured network is rejoined with the field empty', async () => {
      mockListProfiles.mockResolvedValue([
        { name: 'HomeNet (wlan0)', uuid: EXISTING_UUID, ssid: 'HomeNet', iface: 'wlan0', autoconnect: true, timestamp: 1 },
      ]);
      const res = await POST(postRequest({ ssid: 'HomeNet', iface: 'wlan0', security: 'WPA2' }));
      expect((await res.json()).ok).toBe(true);
      const calls = sudoCalls();
      expect(calls.some((c) => c.includes('remove 802-11-wireless-security'))).toBe(false);
      expect(calls.some((c) => c.includes('wifi-sec'))).toBe(false);
      expect(mockNmcliSudo.mock.calls[0][0]).toEqual([
        'connection', 'modify', EXISTING_UUID, '802-11-wireless.hidden', 'no', 'connection.autoconnect-priority', '10',
      ]);
    });

    it('refuses a secured network with no password and nothing saved, before touching nmcli', async () => {
      const res = await POST(postRequest({ ssid: 'HomeNet', iface: 'wlan0', security: 'WPA2' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/needs a password/);
      expect(mockNmcliSudo).not.toHaveBeenCalled();
    });

    it('does not reuse a same-named profile for another network or adapter', async () => {
      mockListProfiles.mockResolvedValue([
        { name: 'HomeNet (wlan0)', uuid: EXISTING_UUID, ssid: 'Neighbor', iface: 'wlan0', autoconnect: true, timestamp: 1 },
        { name: 'HomeNet (wlan0)', uuid: 'cccccccc-0000-0000-0000-000000000000', ssid: 'HomeNet', iface: 'wlan1', autoconnect: true, timestamp: 1 },
      ]);
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security: 'WPA2' }));
      expect((await res.json()).profileId).toBe(NEW_UUID);
      expect(mockNmcliSudo.mock.calls[0][0].slice(0, 2)).toEqual(['connection', 'add']);
      expect(sudoCalls().some((c) => c.includes(EXISTING_UUID) || c.includes('cccccccc'))).toBe(false);
    });

    it('carries a static address over from the profile it replaces', async () => {
      const { readConnectionIpv4Settings } = await import('@/lib/network-commands');
      mockListProfiles.mockResolvedValue([
        { name: 'preconfigured', uuid: EXISTING_UUID, ssid: 'HomeNet', autoconnect: true, timestamp: 1 },
      ]);
      vi.mocked(readConnectionIpv4Settings).mockResolvedValueOnce({
        method: 'manual', addresses: '192.168.1.50/24', gateway: '192.168.1.1', dns: '192.168.1.1',
      });
      await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security: 'WPA2' }));
      expect(vi.mocked(readConnectionIpv4Settings)).toHaveBeenCalledWith(EXISTING_UUID);
      const add = mockNmcliSudo.mock.calls[0][0];
      expect(add.slice(-8)).toEqual([
        'ipv4.method', 'manual', 'ipv4.addresses', '192.168.1.50/24', 'ipv4.gateway', '192.168.1.1', 'ipv4.dns', '192.168.1.1',
      ]);
    });

    it('leaves a DHCP predecessor alone and ignores one pinned to another adapter', async () => {
      const { readConnectionIpv4Settings } = await import('@/lib/network-commands');
      mockListProfiles.mockResolvedValue([
        { name: 'HomeNet (wlan1)', uuid: 'cccccccc-0000-0000-0000-000000000000', ssid: 'HomeNet', iface: 'wlan1', autoconnect: true, timestamp: 1 },
        { name: 'preconfigured', uuid: EXISTING_UUID, ssid: 'HomeNet', autoconnect: true, timestamp: 1 },
      ]);
      vi.mocked(readConnectionIpv4Settings).mockResolvedValueOnce({ method: 'auto' });
      await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security: 'WPA2' }));
      expect(vi.mocked(readConnectionIpv4Settings)).toHaveBeenCalledWith(EXISTING_UUID);
      expect(mockNmcliSudo.mock.calls[0][0]).not.toContain('ipv4.method');
    });

    it('flags a typed-in network as hidden', async () => {
      await POST(postRequest({ ssid: 'Secret', password: 'password1', iface: 'wlan0', hidden: true }));
      const add = mockNmcliSudo.mock.calls[0][0];
      expect(add.slice(-2)).toEqual(['802-11-wireless.hidden', 'yes']);
    });

    it('never runs `device wifi connect`', async () => {
      await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0', security: 'WPA2' }));
      for (const call of sudoCalls()) expect(call).not.toMatch(/device wifi connect/);
    });

    it('fails with 500 when nmcli does not report the new profile id', async () => {
      mockNmcliSudo.mockResolvedValue('');
      const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
      expect(res.status).toBe(500);
      expect((await res.json()).ok).toBe(false);
      // Nothing was brought up on a profile we could not identify.
      expect(sudoCalls().some((c) => c.includes('connection up'))).toBe(false);
    });
  });

  it('maps an nmcli activation failure to a 500 with its stderr', async () => {
    mockNmcliSudo.mockImplementation(async (args: string[]) => {
      if (args[1] === 'add') return ADDED_LINE;
      throw Object.assign(new Error('x'), { stderr: 'Error: Connection activation failed: Secrets were required, but not provided.' });
    });
    const res = await POST(postRequest({ ssid: 'HomeNet', password: 'wrongpass1', iface: 'wlan0' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // The page gets a sentence a parent can act on; nmcli's own text rides along for the log
    expect(body.error).toBe('The password was not accepted. Check it and try again.');
    expect(body.detail).toMatch(/Secrets were required/);
  });
});
