/**
 * Route-level tests for `/api/system/network/confirm`.
 *
 * Mocks the `network-commands` state machine (rollback registry + watchdog)
 * so we exercise only the route wrapper: status shaping on GET and the
 * validate → confirm → uninhibit sequence on POST.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/network-commands', () => ({
  getPendingRollback: vi.fn(),
  confirmRollback: vi.fn(),
  uninhibitWatchdog: vi.fn(async () => {}),
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import {
  getPendingRollback,
  confirmRollback,
  uninhibitWatchdog,
} from '@/lib/network-commands';

const mockGetPending = vi.mocked(getPendingRollback);
const mockConfirm = vi.mocked(confirmRollback);
const mockUninhibit = vi.mocked(uninhibitWatchdog);

const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/network/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/system/network/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports no pending rollback', async () => {
    mockGetPending.mockReturnValue(null);
    const res = await GET(new NextRequest('http://localhost/api/system/network/confirm'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pending: false });
  });

  it('reports a pending rollback with id and remaining time', async () => {
    mockGetPending.mockReturnValue({ id: VALID_UUID, timeoutMs: 42000 });
    const res = await GET(new NextRequest('http://localhost/api/system/network/confirm'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pending: true,
      rollbackId: VALID_UUID,
      remainingMs: 42000,
    });
  });
});

describe('POST /api/system/network/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an invalid rollback id with 400 and never confirms', async () => {
    const res = await POST(postRequest({ rollbackId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/UUID/);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockUninhibit).not.toHaveBeenCalled();
  });

  it('returns 404 when no pending rollback matches the id', async () => {
    mockConfirm.mockReturnValue(false);
    const res = await POST(postRequest({ rollbackId: VALID_UUID }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: 'No matching pending rollback' });
    expect(mockUninhibit).not.toHaveBeenCalled();
  });

  it('confirms the rollback and uninhibits the watchdog on success', async () => {
    mockConfirm.mockReturnValue(true);
    const res = await POST(postRequest({ rollbackId: VALID_UUID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockConfirm).toHaveBeenCalledWith(VALID_UUID);
    expect(mockUninhibit).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on a malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/system/network/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
