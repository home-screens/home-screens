/**
 * Route-level tests for `/api/system/upgrade`.
 *
 * `runUpgrade` / `cancelUpgrade` / `isDeploying` are unit-tested in
 * `src/lib/__tests__/upgrade.test.ts`; here we only cover the route wrappers:
 * the POST kickoff (busy guard + tag parsing) and the DELETE cancel gate
 * (not-running → 404, mid-deploy → 409, otherwise cancel).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/upgrade', () => ({
  runUpgrade: vi.fn(async () => {}),
  isUpgradeRunning: vi.fn(() => false),
  isDeploying: vi.fn(() => false),
  cancelUpgrade: vi.fn(() => true),
}));

import { NextRequest } from 'next/server';
import { POST, DELETE } from '../route';
import { runUpgrade, isUpgradeRunning, isDeploying, cancelUpgrade } from '@/lib/upgrade';

const mockRunUpgrade = vi.mocked(runUpgrade);
const mockIsRunning = vi.mocked(isUpgradeRunning);
const mockIsDeploying = vi.mocked(isDeploying);
const mockCancel = vi.mocked(cancelUpgrade);

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/upgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/upgrade', { method: 'DELETE' });
}

describe('POST /api/system/upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning.mockReturnValue(false);
  });

  it('returns 409 when an upgrade is already running', async () => {
    mockIsRunning.mockReturnValue(true);
    const res = await POST(postRequest({ tag: 'v2.0.0' }));
    expect(res.status).toBe(409);
    expect(mockRunUpgrade).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed tag', async () => {
    const res = await POST(postRequest({ tag: 'not-a-version' }));
    expect(res.status).toBe(400);
    expect(mockRunUpgrade).not.toHaveBeenCalled();
  });

  it('kicks off the upgrade and returns the started message', async () => {
    const res = await POST(postRequest({ tag: 'v2.0.0' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'Upgrade to v2.0.0 started' });
    expect(mockRunUpgrade).toHaveBeenCalledWith('v2.0.0');
  });
});

describe('DELETE /api/system/upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning.mockReturnValue(true);
    mockIsDeploying.mockReturnValue(false);
    mockCancel.mockReturnValue(true);
  });

  it('returns 404 when no upgrade is running', async () => {
    mockIsRunning.mockReturnValue(false);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/No upgrade/);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('returns 409 and refuses to cancel while deploying', async () => {
    mockIsDeploying.mockReturnValue(true);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/deploy/i);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('cancels a running, non-deploying upgrade', async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('reflects a cancel that returned false', async () => {
    mockCancel.mockReturnValue(false);
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });
});
