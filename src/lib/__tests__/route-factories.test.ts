import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createTagActionRoute } from '@/lib/route-factories';
import { silenceConsole } from '@/test-utils';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

silenceConsole();

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── createTagActionRoute ────────────────────────────────────────────────

describe('createTagActionRoute', () => {
  function postRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 409 when busy check returns true', async () => {
    const actionFn = vi.fn();
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => true,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: '1.0.0' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('An upgrade is already in progress');
    expect(actionFn).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid tag', async () => {
    const actionFn = vi.fn();
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: 'invalid' }));
    expect(res.status).toBe(400);
    expect(actionFn).not.toHaveBeenCalled();
  });

  it('starts action and returns success for valid tag', async () => {
    const actionFn = vi.fn().mockResolvedValue(undefined);
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Upgrade',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: '2.1.0' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toBe('Upgrade to 2.1.0 started');
    expect(actionFn).toHaveBeenCalledWith('2.1.0');
  });

  it('uses the verb in the success message', async () => {
    const actionFn = vi.fn().mockResolvedValue(undefined);
    const handler = createTagActionRoute(actionFn, {
      busyCheck: () => false,
      verb: 'Rollback',
      errorMsg: 'Failed',
    });

    const res = await handler(postRequest({ tag: 'v1.0.0' }));
    const json = await res.json();
    expect(json.message).toBe('Rollback to v1.0.0 started');
  });
});
