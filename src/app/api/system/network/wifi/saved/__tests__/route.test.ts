/**
 * Route-level tests for `/api/system/network/wifi/saved` (GET list + DELETE).
 *
 * Mocks `network-commands` (profile listing, active lookup, secret reads) and
 * `isAuthEnabled`; the real UUID validator runs on DELETE. Covers the
 * empty-on-nmcli-failure GET, the real-SSID and adapter fields, the
 * password-reveal branch, and the DELETE validation, management gate,
 * confirmed bypass, success and failure paths.
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
  isAuthEnabled: vi.fn(async () => false),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcliSudo: vi.fn(async () => ''),
  listWifiProfiles: vi.fn(async () => []),
  findActiveDevice: vi.fn(async () => null),
  getManagementInterface: vi.fn(async () => 'wlan0'),
  getOtherReachableAddress: vi.fn(async () => null),
  isPotentiallyManagementInterface: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { GET, DELETE } from '../route';
import {
  nmcliSudo,
  listWifiProfiles,
  findActiveDevice,
  getOtherReachableAddress,
  isPotentiallyManagementInterface,
} from '@/lib/network-commands';
import { isAuthEnabled } from '@/lib/auth';

const mockNmcliSudo = vi.mocked(nmcliSudo);
const mockListProfiles = vi.mocked(listWifiProfiles);
const mockFindActive = vi.mocked(findActiveDevice);
const mockOtherAddress = vi.mocked(getOtherReachableAddress);
const mockIsManagement = vi.mocked(isPotentiallyManagementInterface);
const mockIsAuthEnabled = vi.mocked(isAuthEnabled);

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

function getRequest(showPasswords = false): NextRequest {
  const url = showPasswords
    ? 'http://localhost/api/system/network/wifi/saved?showPasswords=true'
    : 'http://localhost/api/system/network/wifi/saved';
  return new NextRequest(url, { method: 'GET' });
}

function deleteRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/wifi/saved', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/system/network/wifi/saved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthEnabled.mockResolvedValue(false);
  });

  it('returns an empty list when nmcli fails', async () => {
    mockListProfiles.mockRejectedValue(new Error('nmcli unavailable'));
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists profiles with their real SSID, pinned adapter, autoconnect and last-used', async () => {
    mockListProfiles.mockResolvedValue([
      { name: 'HomeNet (wlan1)', uuid: VALID_UUID, ssid: 'HomeNet', iface: 'wlan1', autoconnect: true, timestamp: 1700000000 },
      { name: 'preconfigured', uuid: 'aaaaaaaa-0000-0000-0000-000000000000', ssid: 'HomeNet', autoconnect: true, timestamp: 0 },
    ]);
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: VALID_UUID, name: 'HomeNet (wlan1)', ssid: 'HomeNet', iface: 'wlan1', autoconnect: true });
    expect(body[0].lastUsed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body[0].password).toBeUndefined();
    expect(body[1]).toMatchObject({ name: 'preconfigured', ssid: 'HomeNet', lastUsed: 'never' });
    expect(body[1].iface).toBeUndefined();
  });

  it('reveals passwords when requested and auth is enabled', async () => {
    mockListProfiles.mockResolvedValue([
      { name: 'HomeNet', uuid: VALID_UUID, ssid: 'HomeNet', autoconnect: true, timestamp: 1700000000 },
    ]);
    mockIsAuthEnabled.mockResolvedValue(true);
    mockNmcliSudo.mockResolvedValue('802-11-wireless-security.psk:supersecret');
    const res = await GET(getRequest(true));
    const body = await res.json();
    expect(body[0].password).toBe('supersecret');
    expect(mockNmcliSudo).toHaveBeenCalled();
  });
});

describe('DELETE /api/system/network/wifi/saved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNmcliSudo.mockResolvedValue('');
    mockFindActive.mockResolvedValue(null);
    mockOtherAddress.mockResolvedValue(null);
    mockIsManagement.mockReturnValue(false);
  });

  it('rejects an invalid connection UUID with 400', async () => {
    const res = await DELETE(deleteRequest({ connectionId: 'nope' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/UUID/);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('deletes a profile that is not active without asking', async () => {
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockNmcliSudo).toHaveBeenCalledWith(['connection', 'delete', VALID_UUID]);
  });

  it('deletes a profile active on another adapter without asking', async () => {
    mockFindActive.mockResolvedValue('wlan1');
    mockIsManagement.mockReturnValue(false);
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockIsManagement).toHaveBeenCalledWith('wlan0', 'wlan1');
  });

  it('asks before forgetting the network the page is served over, naming the other address', async () => {
    mockFindActive.mockResolvedValue('wlan0');
    mockIsManagement.mockReturnValue(true);
    mockOtherAddress.mockResolvedValue('192.168.0.56');
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ requiresConfirmation: true, warningKind: 'forget', otherAddress: '192.168.0.56' });
    expect(mockOtherAddress).toHaveBeenCalledWith('wlan0');
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('leaves the address out when no other adapter has one', async () => {
    mockFindActive.mockResolvedValue('wlan0');
    mockIsManagement.mockReturnValue(true);
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.otherAddress).toBeUndefined();
  });

  it('fails closed when the active lookup throws', async () => {
    mockFindActive.mockRejectedValue(new Error('nmcli unavailable'));
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    const body = await res.json();
    expect(body).toMatchObject({ requiresConfirmation: true, warningKind: 'unknown' });
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('deletes the management profile once confirmed, without looking again', async () => {
    mockFindActive.mockResolvedValue('wlan0');
    mockIsManagement.mockReturnValue(true);
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID, confirmed: true }));
    expect(await res.json()).toEqual({ ok: true });
    expect(mockFindActive).not.toHaveBeenCalled();
    expect(mockNmcliSudo).toHaveBeenCalledWith(['connection', 'delete', VALID_UUID]);
  });

  it('maps a delete failure to a 500 with its stderr', async () => {
    mockNmcliSudo.mockRejectedValueOnce(Object.assign(new Error('x'), { stderr: 'unknown connection' }));
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/unknown connection/);
  });
});
