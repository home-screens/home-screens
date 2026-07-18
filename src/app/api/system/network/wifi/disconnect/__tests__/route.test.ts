/**
 * Route-level tests for `POST /api/system/network/wifi/disconnect`.
 *
 * Mocks `network-commands` (active-connection lookup + `connection down`); the
 * real UUID validator runs. Covers the validation gate, the management-interface
 * confirmation gate, the fail-closed path when the active-connection lookup
 * throws, and the nmcli failure → 500 mapping. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => ''),
  nmcliSudo: vi.fn(async () => ''),
  getManagementInterface: vi.fn(async () => 'eth0'),
  isPotentiallyManagementInterface: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { nmcli, nmcliSudo, isPotentiallyManagementInterface } from '@/lib/network-commands';

const mockNmcli = vi.mocked(nmcli);
const mockNmcliSudo = vi.mocked(nmcliSudo);
const mockIsManagement = vi.mocked(isPotentiallyManagementInterface);

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/wifi/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/system/network/wifi/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagement.mockReturnValue(false);
    mockNmcli.mockResolvedValue('');
    mockNmcliSudo.mockResolvedValue('');
  });

  it('rejects an invalid connection UUID with 400', async () => {
    const res = await POST(postRequest({ connectionId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/UUID/);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('disconnects a non-management connection and returns ok', async () => {
    // Active on wlan0, not the management interface.
    mockNmcli.mockResolvedValue(`${VALID_UUID}:wlan0:activated`);
    mockIsManagement.mockReturnValue(false);
    const res = await POST(postRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockNmcliSudo).toHaveBeenCalledWith(['connection', 'down', VALID_UUID]);
  });

  it('asks for confirmation before disconnecting the management interface', async () => {
    mockNmcli.mockResolvedValue(`${VALID_UUID}:eth0:activated`);
    mockIsManagement.mockReturnValue(true);
    const res = await POST(postRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('fails closed and requires confirmation when the active lookup throws', async () => {
    mockNmcli.mockRejectedValue(new Error('nmcli unavailable'));
    const res = await POST(postRequest({ connectionId: VALID_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('maps an nmcli disconnect failure to a 500 with its stderr', async () => {
    mockNmcli.mockResolvedValue(`${VALID_UUID}:wlan0:activated`);
    mockNmcliSudo.mockRejectedValueOnce(Object.assign(new Error('x'), { stderr: 'connection down failed' }));
    const res = await POST(postRequest({ connectionId: VALID_UUID, confirmed: true }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/connection down failed/);
  });
});
