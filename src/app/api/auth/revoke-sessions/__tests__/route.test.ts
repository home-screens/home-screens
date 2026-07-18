/**
 * Route-level tests for `POST /api/auth/revoke-sessions`.
 *
 * `auth` and `audit` are mocked so we cover only the route: the auth-enabled
 * gate (400 when off) and the revoke + audit sequence when on.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/auth', () => ({
  isAuthEnabled: vi.fn(),
  revokeAllSessions: vi.fn(async () => {}),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { isAuthEnabled, revokeAllSessions } from '@/lib/auth';
import { audit } from '@/lib/audit';

const mockIsEnabled = vi.mocked(isAuthEnabled);
const mockRevoke = vi.mocked(revokeAllSessions);
const mockAudit = vi.mocked(audit);

const req = () => new NextRequest('http://localhost/api/auth/revoke-sessions', { method: 'POST' });

describe('POST /api/auth/revoke-sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when auth is not enabled and revokes nothing', async () => {
    mockIsEnabled.mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not enabled/);
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('revokes all sessions and writes an audit entry when auth is enabled', async () => {
    mockIsEnabled.mockResolvedValue(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockRevoke).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledWith({ action: 'session_revoke_all' });
  });
});
