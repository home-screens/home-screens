/**
 * Route-level tests for `POST /api/system/rollback`.
 *
 * The rollback pipeline itself (`runRollback`) is unit-tested in
 * `src/lib/__tests__/upgrade.test.ts`; this only covers what the thin
 * `createTagActionRoute` wrapper adds: the busy guard, tag parsing, and the
 * fire-and-forget kickoff response.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, withAuth: (handler: unknown) => handler };
});

vi.mock('@/lib/upgrade', () => ({
  runRollback: vi.fn(async () => {}),
  isUpgradeRunning: vi.fn(() => false),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { runRollback, isUpgradeRunning } from '@/lib/upgrade';

const mockRunRollback = vi.mocked(runRollback);
const mockIsRunning = vi.mocked(isUpgradeRunning);

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/system/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/system/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRunning.mockReturnValue(false);
  });

  it('returns 409 when an upgrade is already in progress', async () => {
    mockIsRunning.mockReturnValue(true);
    const res = await POST(postRequest({ tag: 'v1.2.3' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already in progress/);
    expect(mockRunRollback).not.toHaveBeenCalled();
  });

  it('returns 400 when the tag is missing', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing "tag"/);
    expect(mockRunRollback).not.toHaveBeenCalled();
  });

  it('returns 400 when the tag format is invalid', async () => {
    const res = await POST(postRequest({ tag: 'latest' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid tag format/);
    expect(mockRunRollback).not.toHaveBeenCalled();
  });

  it('kicks off the rollback and returns the started message', async () => {
    const res = await POST(postRequest({ tag: 'v1.2.3' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'Rollback to v1.2.3 started' });
    expect(mockRunRollback).toHaveBeenCalledWith('v1.2.3');
  });
});
