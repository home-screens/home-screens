/**
 * Route-level tests for `PUT /api/system/network/ip`.
 *
 * The heavy nmcli / rollback plumbing lives in `network-commands` and is
 * mocked here. These tests cover the route's own responsibilities: the
 * validation ladder (uuid → method → manual fields), the management-interface
 * confirmation gate, and the non-management apply path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/network-commands', () => ({
  nmcli: vi.fn(async () => 'eth0'),
  nmcliSudo: vi.fn(async () => ''),
  getManagementInterface: vi.fn(async () => 'eth0'),
  inhibitWatchdog: vi.fn(async () => {}),
  uninhibitWatchdog: vi.fn(async () => {}),
  scheduleRollback: vi.fn(() => 'rollback-id-123'),
  hasActiveRollback: vi.fn(() => false),
  ensureSourceRouting: vi.fn(async () => {}),
  isPotentiallyManagementInterface: vi.fn(() => false),
  readConnectionIpv4Settings: vi.fn(async () => ({ method: 'auto' })),
}));

import { NextRequest } from 'next/server';
import { PUT } from '../route';
import {
  nmcliSudo,
  isPotentiallyManagementInterface,
  hasActiveRollback,
  scheduleRollback,
} from '@/lib/network-commands';

const mockNmcliSudo = vi.mocked(nmcliSudo);
const mockIsManagement = vi.mocked(isPotentiallyManagementInterface);
const mockHasActiveRollback = vi.mocked(hasActiveRollback);
const mockScheduleRollback = vi.mocked(scheduleRollback);

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

function putRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/ip', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/system/network/ip — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagement.mockReturnValue(false);
    mockHasActiveRollback.mockReturnValue(false);
  });

  it('rejects an invalid connection id with 400', async () => {
    const res = await PUT(putRequest({ connectionId: 'nope', method: 'auto' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/UUID/);
  });

  it('rejects an unknown method with 400', async () => {
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'dhcp' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/method/);
  });

  it('requires an address in manual mode', async () => {
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'manual' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/address is required/);
  });

  it('rejects an invalid IPv4 address in manual mode', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '999.1.1.1', prefix: 24, gateway: '192.168.1.1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/address:/);
  });

  it('rejects an out-of-range CIDR prefix in manual mode', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '192.168.1.5', prefix: 40, gateway: '192.168.1.1' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/prefix:/);
  });

  it('requires a gateway in manual mode', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '192.168.1.5', prefix: 24 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/gateway is required/);
  });

  it('rejects a non-array dns field', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '192.168.1.5', prefix: 24, gateway: '192.168.1.1', dns: '8.8.8.8' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/dns must be an array/);
  });

  it('rejects an invalid dns entry, reporting its index', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '192.168.1.5', prefix: 24, gateway: '192.168.1.1', dns: ['8.8.8.8', 'bad'] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/dns\[1\]:/);
  });
});

describe('PUT /api/system/network/ip — management gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 409 when a rollback is already pending on the management interface', async () => {
    mockIsManagement.mockReturnValue(true);
    mockHasActiveRollback.mockReturnValue(true);
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already pending/);
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('asks for confirmation before changing the management interface', async () => {
    mockIsManagement.mockReturnValue(true);
    mockHasActiveRollback.mockReturnValue(false);
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.warning).toMatch(/disconnect/i);
    // No change applied while confirmation is still pending.
    expect(mockNmcliSudo).not.toHaveBeenCalled();
  });

  it('schedules a rollback when a confirmed management change is applied', async () => {
    mockIsManagement.mockReturnValue(true);
    mockHasActiveRollback.mockReturnValue(false);
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto', confirmed: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rollbackId: 'rollback-id-123' });
    expect(mockScheduleRollback).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/system/network/ip — non-management apply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsManagement.mockReturnValue(false);
    mockHasActiveRollback.mockReturnValue(false);
  });

  it('applies an auto change and returns ok with no rollbackId', async () => {
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockScheduleRollback).not.toHaveBeenCalled();
    // modify + down + up were issued.
    expect(mockNmcliSudo).toHaveBeenCalled();
  });

  it('builds the manual modify args from the supplied address/gateway/dns', async () => {
    const res = await PUT(
      putRequest({ connectionId: VALID_UUID, method: 'manual', address: '192.168.1.50', prefix: 24, gateway: '192.168.1.1', dns: ['8.8.8.8', '1.1.1.1'] }),
    );
    expect(res.status).toBe(200);
    const modifyCall = mockNmcliSudo.mock.calls.find((c) => c[0].includes('modify'));
    expect(modifyCall?.[0]).toEqual(
      expect.arrayContaining(['ipv4.method', 'manual', 'ipv4.addresses', '192.168.1.50/24', 'ipv4.gateway', '192.168.1.1', 'ipv4.dns', '8.8.8.8 1.1.1.1']),
    );
  });

  it('maps an nmcli modify failure to a 500', async () => {
    mockNmcliSudo.mockRejectedValueOnce(Object.assign(new Error('x'), { stderr: 'nmcli exploded' }));
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/nmcli exploded/);
  });

  it('maps a failure cycling the connection (down/up) to a 500', async () => {
    // Step 9 (modify) succeeds; step 10 (connection down) rejects.
    mockNmcliSudo
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(Object.assign(new Error('x'), { stderr: 'link down failed' }));
    const res = await PUT(putRequest({ connectionId: VALID_UUID, method: 'auto' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/link down failed/);
  });
});
