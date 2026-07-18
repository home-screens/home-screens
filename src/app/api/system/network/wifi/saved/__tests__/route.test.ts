/**
 * Route-level tests for `/api/system/network/wifi/saved` (GET list + DELETE).
 *
 * Mocks `network-commands` (connection listing + secret reads) and
 * `isAuthEnabled`; the real UUID validator runs on DELETE. Covers the
 * empty-on-nmcli-failure GET, the wifi-only filtering, the password-reveal
 * branch, and the DELETE validation / success / failure paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
  isAuthEnabled: vi.fn(async () => false),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => ''),
  nmcliSudo: vi.fn(async () => ''),
}));

import { NextRequest } from 'next/server';
import { GET, DELETE } from '../route';
import { nmcli, nmcliSudo } from '@/lib/network-commands';
import { isAuthEnabled } from '@/lib/auth';

const mockNmcli = vi.mocked(nmcli);
const mockNmcliSudo = vi.mocked(nmcliSudo);
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
    mockNmcli.mockRejectedValue(new Error('nmcli unavailable'));
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists only wifi connections, mapping autoconnect and last-used', async () => {
    // NAME:UUID:TYPE:AUTOCONNECT:TIMESTAMP — one wifi, one ethernet (filtered out).
    mockNmcli.mockResolvedValue(
      `HomeNet:${VALID_UUID}:802-11-wireless:yes:1700000000\n` +
        `Wired connection 1:aaaa:802-3-ethernet:yes:1700000001`,
    );
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: VALID_UUID, name: 'HomeNet', ssid: 'HomeNet', autoconnect: true });
    expect(body[0].lastUsed).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body[0].password).toBeUndefined();
  });

  it('reveals passwords when requested and auth is enabled', async () => {
    mockNmcli.mockResolvedValue(`HomeNet:${VALID_UUID}:802-11-wireless:yes:1700000000`);
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
  });

  it('rejects an invalid connection UUID with 400', async () => {
    const res = await DELETE(deleteRequest({ connectionId: 'nope' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/UUID/);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('deletes a saved connection and returns ok', async () => {
    const res = await DELETE(deleteRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
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
