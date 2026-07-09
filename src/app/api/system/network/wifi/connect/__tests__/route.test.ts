/**
 * Route-level tests for `POST /api/system/network/wifi/connect`.
 *
 * The nmcli / rollback / watchdog plumbing lives in `network-commands` and is
 * mocked; the real `network-validation` validators run so the input ladder
 * (SSID → password → interface) is exercised for real. `child_process` is
 * stubbed for the best-effort cloud-init drop-in write. Auth is stubbed at
 * `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => ''),
  nmcliSudo: vi.fn(async () => 'Device successfully activated'),
  getManagementInterface: vi.fn(async () => 'eth0'),
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
  isPotentiallyManagementInterface,
  hasActiveRollback,
} from '@/lib/network-commands';

const mockNmcliSudo = vi.mocked(nmcliSudo);
const mockIsManagement = vi.mocked(isPotentiallyManagementInterface);
const mockHasActiveRollback = vi.mocked(hasActiveRollback);

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/wifi/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/system/network/wifi/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagement.mockReturnValue(false);
    mockHasActiveRollback.mockReturnValue(false);
    mockNmcliSudo.mockResolvedValue('Device successfully activated');
  });

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

  it('returns 409 when a rollback is already pending on the management interface', async () => {
    mockIsManagement.mockReturnValue(true);
    mockHasActiveRollback.mockReturnValue(true);
    const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already pending/);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('asks for confirmation before touching the management interface', async () => {
    mockIsManagement.mockReturnValue(true);
    const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('connects a non-management interface and returns ok', async () => {
    const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.connection).toBe('Device successfully activated');
    expect(mockNmcliSudo).toHaveBeenCalledWith(
      expect.arrayContaining(['device', 'wifi', 'connect', 'HomeNet', 'password', 'password1', 'ifname', 'wlan0']),
    );
  });

  it('maps an nmcli connect failure to a 500 with its stderr', async () => {
    mockNmcliSudo.mockRejectedValueOnce(Object.assign(new Error('x'), { stderr: 'No network with SSID' }));
    const res = await POST(postRequest({ ssid: 'HomeNet', password: 'password1', iface: 'wlan0' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/No network with SSID/);
  });
});
