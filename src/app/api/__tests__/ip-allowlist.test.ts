import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/* ─── Mock @/lib/auth ────────────────────────── */

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  getIpAllowlistConfig: vi.fn(),
  setIpAllowlistConfig: vi.fn(),
  isAuthEnabled: vi.fn(async () => true),
}));

/* ─── Mock the walls registry ───────────────── */

const walls = vi.hoisted(() => ({ list: [] as { status: 'in' | 'waiting'; address: string }[] }));
vi.mock('@/lib/display-walls', () => ({
  readWalls: vi.fn(async () => ({ windowStartedAt: null, windowAdmissions: {}, walls: walls.list })),
}));

/* ─── Mock @/lib/audit ──────────────────────── */

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

import { requireSession, getIpAllowlistConfig, setIpAllowlistConfig } from '@/lib/auth';
import { audit } from '@/lib/audit';

/* ─── Import route (after mocks) ─────────────── */

const ipAllowlistRoute = await import('@/app/api/auth/ip-allowlist/route');

/* ─── Helpers ────────────────────────────────── */

function makeGetRequest(ip = '192.168.1.50'): NextRequest {
  return new NextRequest('http://localhost/api/auth/ip-allowlist', {
    method: 'GET',
    headers: { 'x-hs-client-ip': ip },
  });
}

function makePutRequest(body: unknown, ip = '192.168.1.50'): NextRequest {
  return new NextRequest('http://localhost/api/auth/ip-allowlist', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-hs-client-ip': ip,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  walls.list = [];
  // Default: auth is not required (withAuth's requireSession is a no-op)
  vi.mocked(requireSession).mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════
// GET /api/auth/ip-allowlist
// ═══════════════════════════════════════════════

describe('GET /api/auth/ip-allowlist', () => {
  it('returns current config plus caller IP', async () => {
    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
      bypassAuth: true,
      restrictAccess: false,
    });

    const res = await ipAllowlistRoute.GET(makeGetRequest('192.168.1.42'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
      bypassAuth: true,
      restrictAccess: false,
      callerIp: '192.168.1.42',
      hubScreenLeftOut: false,
      hubScreenAddress: '127.0.0.1',
    });
  });

  it('says when the saved list already turns away the screen plugged into the hub', async () => {
    walls.list = [{ status: 'in', address: '127.0.0.1' }];
    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: ['192.168.1.0/24'],
      bypassAuth: false,
      restrictAccess: true,
    });
    expect((await (await ipAllowlistRoute.GET(makeGetRequest())).json()).hubScreenLeftOut).toBe(true);

    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: ['192.168.1.0/24', '127.0.0.1'],
      bypassAuth: false,
      restrictAccess: true,
    });
    expect((await (await ipAllowlistRoute.GET(makeGetRequest())).json()).hubScreenLeftOut).toBe(false);
  });

  it('returns empty defaults when no config exists', async () => {
    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: [],
      bypassAuth: false,
      restrictAccess: false,
    });

    const res = await ipAllowlistRoute.GET(makeGetRequest('192.168.1.42'));
    const json = await res.json();

    expect(json.allowlist).toEqual([]);
    expect(json.bypassAuth).toBe(false);
    expect(json.restrictAccess).toBe(false);
    expect(json.callerIp).toBe('192.168.1.42');
  });

  it('normalizes IPv4-mapped IPv6 callerIp before returning', async () => {
    // The UI displays callerIp in the "Your IP" field and uses it to decide
    // whether the "IPv6 only" warning applies. We must normalize ::ffff:X to
    // plain IPv4 so users don't see the mapped form and panic.
    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: [],
      bypassAuth: false,
      restrictAccess: false,
    });

    const res = await ipAllowlistRoute.GET(makeGetRequest('::ffff:127.0.0.1'));
    const json = await res.json();

    expect(json.callerIp).toBe('127.0.0.1');
  });

  it('returns true IPv6 addresses unchanged (so warning applies correctly)', async () => {
    vi.mocked(getIpAllowlistConfig).mockResolvedValue({
      allowlist: [],
      bypassAuth: false,
      restrictAccess: false,
    });

    const res = await ipAllowlistRoute.GET(makeGetRequest('::1'));
    const json = await res.json();

    expect(json.callerIp).toBe('::1');
  });

  it('returns 401 when session auth fails', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    );

    const res = await ipAllowlistRoute.GET(makeGetRequest());
    expect(res.status).toBe(401);
    // getIpAllowlistConfig should never have been called on auth failure
    expect(getIpAllowlistConfig).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// PUT /api/auth/ip-allowlist — validation
// ═══════════════════════════════════════════════

describe('PUT /api/auth/ip-allowlist — validation', () => {
  it('rejects non-array allowlist with 400', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: 'not-an-array', bypassAuth: false, restrictAccess: false }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid request body');
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('rejects non-boolean bypassAuth with 400', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: [], bypassAuth: 'true', restrictAccess: false }),
    );
    expect(res.status).toBe(400);
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('rejects non-boolean restrictAccess with 400', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: [], bypassAuth: false, restrictAccess: 1 }),
    );
    expect(res.status).toBe(400);
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('rejects non-string entries in allowlist with 400', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: ['192.168.1.0/24', 12345], bypassAuth: false, restrictAccess: false }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe('Allowlist entries must be strings');
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid CIDR with specific error message', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: ['not-a-cidr'], bypassAuth: false, restrictAccess: false }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('Invalid entry "not-a-cidr"');
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('rejects out-of-range prefix with specific error message', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: ['192.168.1.0/33'], bypassAuth: false, restrictAccess: false }),
    );
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain('192.168.1.0/33');
    expect(json.error).toContain('0-32');
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// PUT /api/auth/ip-allowlist — lockout pre-check
// ═══════════════════════════════════════════════

describe('PUT /api/auth/ip-allowlist — lockout pre-check', () => {
  it('returns 409 without saving when caller IP is excluded by restriction', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: ['10.0.0.0/8'],
          bypassAuth: false,
          restrictAccess: true,
        },
        '192.168.1.42', // caller IP is NOT in 10.0.0.0/8
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.reason).toBe('your_ip_not_in_allowlist');
    expect(json.callerIp).toBe('192.168.1.42');
    // Critical: the config was NOT saved
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('does NOT return 409 when caller IP is in the new allowlist', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: ['192.168.1.0/24'],
          bypassAuth: false,
          restrictAccess: true,
        },
        '192.168.1.42', // in the /24
      ),
    );

    expect(res.status).toBe(200);
    expect(setIpAllowlistConfig).toHaveBeenCalled();
  });

  it('does NOT return 409 when restrictAccess is false (even if caller excluded)', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: ['10.0.0.0/8'],
          bypassAuth: true,
          restrictAccess: false, // no restriction = no lockout risk
        },
        '192.168.1.42',
      ),
    );

    expect(res.status).toBe(200);
    expect(setIpAllowlistConfig).toHaveBeenCalled();
  });

  it('does NOT return 409 when allowlist is empty (feature is off)', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: [],
          bypassAuth: false,
          restrictAccess: true,
        },
        '192.168.1.42',
      ),
    );

    expect(res.status).toBe(200);
    expect(setIpAllowlistConfig).toHaveBeenCalled();
  });

  it('accepts force:true and saves despite lockout risk', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: ['10.0.0.0/8'],
          bypassAuth: false,
          restrictAccess: true,
          force: true, // explicit override
        },
        '192.168.1.42', // not in allowlist
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.saved).toBe(true);
    expect(setIpAllowlistConfig).toHaveBeenCalledWith({
      allowlist: ['10.0.0.0/8'],
      bypassAuth: false,
      restrictAccess: true,
    });
  });
});

// ═══════════════════════════════════════════════
// PUT /api/auth/ip-allowlist — the screen plugged into the hub
// ═══════════════════════════════════════════════

describe('PUT /api/auth/ip-allowlist — the hub\'s own screen', () => {
  const restrict = (allowlist: string[], extra: Record<string, unknown> = {}) =>
    ipAllowlistRoute.PUT(makePutRequest({ allowlist, bypassAuth: false, restrictAccess: true, ...extra }, '192.168.1.42'));

  it('returns 409 without saving when the list leaves out 127.0.0.1 and the hub has its own screen', async () => {
    walls.list = [{ status: 'in', address: '127.0.0.1' }];
    const res = await restrict(['192.168.1.0/24']);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'hub_screen_not_in_allowlist', hubScreenAddress: '127.0.0.1' });
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('counts a screen that opened the wall over ::1, and only one that was let in', async () => {
    walls.list = [{ status: 'waiting', address: '127.0.0.1' }];
    expect((await restrict(['192.168.1.0/24'])).status).toBe(200);
    vi.mocked(setIpAllowlistConfig).mockClear();

    walls.list = [{ status: 'in', address: '::1' }];
    expect((await restrict(['192.168.1.0/24'])).status).toBe(409);
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('saves when 127.0.0.1 is on the list, or nothing opens the wall from the hub', async () => {
    walls.list = [{ status: 'in', address: '127.0.0.1' }];
    expect((await restrict(['192.168.1.0/24', '127.0.0.1'])).status).toBe(200);
    walls.list = [{ status: 'in', address: '192.168.1.60' }];
    expect((await restrict(['192.168.1.0/24'])).status).toBe(200);
  });

  it('does not ask when the list only lets displays in without asking', async () => {
    walls.list = [{ status: 'in', address: '127.0.0.1' }];
    const res = await ipAllowlistRoute.PUT(makePutRequest({ allowlist: ['192.168.1.0/24'], bypassAuth: true, restrictAccess: false }, '192.168.1.42'));
    expect(res.status).toBe(200);
  });

  it('saves without it when told to, and asks about the caller first', async () => {
    walls.list = [{ status: 'in', address: '127.0.0.1' }];
    expect((await restrict(['192.168.1.0/24'], { forceHubScreen: true })).status).toBe(200);
    expect(setIpAllowlistConfig).toHaveBeenCalledWith({ allowlist: ['192.168.1.0/24'], bypassAuth: false, restrictAccess: true });

    // A list that leaves out both: the caller's own lockout is the first question.
    const both = await restrict(['10.0.0.0/8']);
    expect((await both.json()).reason).toBe('your_ip_not_in_allowlist');
    const next = await restrict(['10.0.0.0/8'], { force: true });
    expect((await next.json()).reason).toBe('hub_screen_not_in_allowlist');
  });
});

// ═══════════════════════════════════════════════
// PUT /api/auth/ip-allowlist — save + audit
// ═══════════════════════════════════════════════

describe('PUT /api/auth/ip-allowlist — save and audit', () => {
  it('saves valid config and returns {saved: true}', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({
        allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
        bypassAuth: true,
        restrictAccess: false,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ saved: true });
    expect(setIpAllowlistConfig).toHaveBeenCalledWith({
      allowlist: ['192.168.1.0/24', '10.0.0.0/8'],
      bypassAuth: true,
      restrictAccess: false,
    });
  });

  it('emits ip_allowlist_change audit event with caller IP and entry count', async () => {
    await ipAllowlistRoute.PUT(
      makePutRequest(
        {
          allowlist: ['192.168.1.0/24', '10.0.0.0/8', '172.16.0.0/12'],
          bypassAuth: false,
          restrictAccess: false,
        },
        '10.0.0.1',
      ),
    );

    expect(audit).toHaveBeenCalledWith({
      action: 'ip_allowlist_change',
      ip: '10.0.0.1',
      entryCount: 3,
    });
  });

  it('returns 401 when session auth fails', async () => {
    vi.mocked(requireSession).mockRejectedValue(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    );

    const res = await ipAllowlistRoute.PUT(
      makePutRequest({ allowlist: [], bypassAuth: false, restrictAccess: false }),
    );
    expect(res.status).toBe(401);
    expect(setIpAllowlistConfig).not.toHaveBeenCalled();
  });

  it('saves allowlist with bare IP (treated as /32)', async () => {
    const res = await ipAllowlistRoute.PUT(
      makePutRequest({
        allowlist: ['192.168.1.50'],
        bypassAuth: true,
        restrictAccess: false,
      }),
    );

    expect(res.status).toBe(200);
    expect(setIpAllowlistConfig).toHaveBeenCalledWith({
      allowlist: ['192.168.1.50'],
      bypassAuth: true,
      restrictAccess: false,
    });
  });
});
