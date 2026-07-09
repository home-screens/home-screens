/**
 * Route-level tests for `GET /api/system/network` (network overview).
 *
 * Mocks `network-commands` (nmcli / management-interface detection) and
 * `child_process` (the readlink used for driver detection) so nothing shells
 * out. `parseTerseFields` / `parseDeviceShow` run for real — they're the parse
 * logic the overview shape depends on. Auth is stubbed at `requireSession` so
 * the real `withAuth` wrapper (and its error-catch) stays in the path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { nmcliMock, getManagementInterfaceMock } = vi.hoisted(() => ({
  nmcliMock: vi.fn(),
  getManagementInterfaceMock: vi.fn(async () => 'eth0'),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: nmcliMock,
  getManagementInterface: getManagementInterfaceMock,
}));

// detectDriver promisifies execFile('readlink', ...). Reject so driver is null.
vi.mock('child_process', () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (err: unknown) => void) => {
    cb(new Error('no readlink here'));
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/network', { method: 'GET' });
}

const DEVICE_STATUS =
  'eth0:ethernet:connected:Wired connection 1\nlo:loopback:unmanaged:';
const DEVICE_SHOW = [
  'GENERAL.HWADDR:AA:BB:CC:DD:EE:FF',
  'GENERAL.CONNECTION:Wired connection 1',
  'IP4.ADDRESS[1]:192.168.1.50/24',
  'IP4.GATEWAY:192.168.1.1',
  'IP4.DNS[1]:8.8.8.8',
].join('\n');

function wireHappyNmcli() {
  nmcliMock.mockImplementation(async (args: string[]) => {
    const j = args.join(' ');
    if (j === 'general status') return '';
    if (j.includes('-f DEVICE,TYPE,STATE,CONNECTION')) return DEVICE_STATUS;
    if (j.includes('-f UUID,DEVICE') && j.includes('--active')) return 'abc123:eth0';
    if (j.includes('device show eth0')) return DEVICE_SHOW;
    if (j.includes('ipv4.method')) return 'ipv4.method:auto';
    return '';
  });
}

describe('GET /api/system/network', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getManagementInterfaceMock.mockResolvedValue('eth0');
  });

  it('reports NetworkManager not found when nmcli is missing (ENOENT)', async () => {
    nmcliMock.mockRejectedValueOnce(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe('NetworkManager not found');
  });

  it('reports NetworkManager not available on a non-ENOENT probe failure', async () => {
    nmcliMock.mockRejectedValueOnce(new Error('dbus error'));
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe('NetworkManager not available');
  });

  it('reports a device-status query failure', async () => {
    nmcliMock.mockImplementation(async (args: string[]) => {
      const j = args.join(' ');
      if (j === 'general status') return '';
      throw new Error('device status boom');
    });
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe('Failed to query device status');
  });

  it('builds an overview with interface details on success', async () => {
    wireHappyNmcli();
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(typeof body.hostname).toBe('string');
    // loopback filtered out — only eth0 remains
    expect(body.interfaces).toHaveLength(1);
    const iface = body.interfaces[0];
    expect(iface.device).toBe('eth0');
    expect(iface.hwAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(iface.connectionUuid).toBe('abc123');
    expect(iface.isManagementInterface).toBe(true);
    expect(iface.ipv4).toEqual({
      address: '192.168.1.50',
      prefix: 24,
      gateway: '192.168.1.1',
      dns: ['8.8.8.8'],
      method: 'auto',
    });
  });
});
