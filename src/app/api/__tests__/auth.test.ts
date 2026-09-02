import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/* ─── Mock @/lib/auth ────────────────────────── */

vi.mock('@/lib/auth', () => ({
  verifyPassword: vi.fn(),
  readAuthState: vi.fn(),
  createSessionCookie: vi.fn(),
  buildSessionCookie: vi.fn(),
  buildClearCookie: vi.fn(),
  isAuthEnabled: vi.fn(),
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  setPassword: vi.fn(),
  clearPassword: vi.fn(),
  verifySession: vi.fn(),
  clearAuthCache: vi.fn(),
  getDisplayToken: vi.fn().mockResolvedValue(null),
  regenerateDisplayToken: vi.fn(),
  revokeAllSessions: vi.fn(),
  getSessionMaxAge: vi.fn().mockReturnValue(30 * 24 * 60 * 60),
  getIpAllowlistConfig: vi.fn().mockResolvedValue({ allowlist: [], bypassAuth: false, restrictAccess: false }),
  setIpAllowlistConfig: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      return Response.json({ error: msg }, { status });
    }),
  };
});

import {
  verifyPassword,
  readAuthState,
  createSessionCookie,
  buildSessionCookie,
  buildClearCookie,
  isAuthEnabled,
  requireSession,
  setPassword,
  clearPassword,
  verifySession,
  clearAuthCache,
  getDisplayToken,
  regenerateDisplayToken,
} from '@/lib/auth';

/* ─── Import routes (after mocks) ───────────── */

const loginRoute = await import('@/app/api/auth/login/route');
const passwordRoute = await import('@/app/api/auth/password/route');
const statusRoute = await import('@/app/api/auth/status/route');
const logoutRoute = await import('@/app/api/auth/logout/route');
const displayTokenRoute = await import('@/app/api/auth/display-token/route');

// Mirrors the login route's limiter. Deliberately generous: the password gets
// typed on a phone keyboard, and a handful of typos must not lock a household
// out of its own hub.
const LOGIN_MAX_ATTEMPTS = 10;

/* ─── Helpers ────────────────────────────────── */

function makePostRequest(
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  if (body) {
    return new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: headers ?? {},
  });
}

function makeGetRequest(
  url: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: 'GET',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════

describe('POST /api/auth/login', () => {
  it('returns session cookie on valid password', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret123',
    });
    vi.mocked(createSessionCookie).mockReturnValue('signed.token');
    vi.mocked(buildSessionCookie).mockReturnValue(
      'hs-session=signed.token; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000',
    );

    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correctpassword' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(res.headers.get('Set-Cookie')).toContain('hs-session=signed.token');
    expect(verifyPassword).toHaveBeenCalledWith('correctpassword');
    expect(createSessionCookie).toHaveBeenCalledWith('secret123', false, undefined);
  });

  it('returns 401 for invalid password', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'wrongpassword' }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('Invalid password');
    expect(json.code).toBe('invalid_password');
  });

  it('returns 400 when password is missing', async () => {
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', {}),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Password is required');
  });

  it('returns 400 when password is empty string', async () => {
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: '' }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Password is required');
  });

  it('returns 400 when password is not a string', async () => {
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 12345 }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Password is required');
  });

  it('returns 500 when auth state has no cookie secret', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: null,
    });

    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correctpassword' }),
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Auth state invalid');
  });

  it('rate-limits after the allowed number of failed attempts from one IP', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const res = await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-hs-client-ip': '10.0.0.99',
        }),
      );
      expect(res.status).toBe(401);
    }

    // One more attempt is rate-limited (429 before even checking the password)
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'wrong' }, {
        'x-hs-client-ip': '10.0.0.99',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toMatch(/Too many failed attempts/);
    // The login page renders `code` + `retryAfterSeconds`, not `error`, so the
    // red line is in the reader's language and can name the wait.
    expect(json.code).toBe('rate_limited');
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
    expect(json.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(res.headers.get('Retry-After')).toBe(String(json.retryAfterSeconds));
    // verifyPassword is not called on a rate-limited request
    expect(verifyPassword).toHaveBeenCalledTimes(LOGIN_MAX_ATTEMPTS);
  });

  it('rate limit does not affect different IPs', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    // Exhaust rate limit for IP 10.0.0.50
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-hs-client-ip': '10.0.0.50',
        }),
      );
    }

    // Different IP should still be allowed
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });
    vi.mocked(createSessionCookie).mockReturnValue('token');
    vi.mocked(buildSessionCookie).mockReturnValue('hs-session=token');

    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correct' }, {
        'x-hs-client-ip': '10.0.0.51',
      }),
    );

    expect(res.status).toBe(200);
  });

  it('successful login clears rate-limit failures for that IP', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    // 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-hs-client-ip': '10.0.0.200',
        }),
      );
    }

    // Successful login
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });
    vi.mocked(createSessionCookie).mockReturnValue('token');
    vi.mocked(buildSessionCookie).mockReturnValue('hs-session=token');

    const successRes = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correct' }, {
        'x-hs-client-ip': '10.0.0.200',
      }),
    );
    expect(successRes.status).toBe(200);

    // After success, the full allowance is required again to trigger the limit
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      const res = await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-hs-client-ip': '10.0.0.200',
        }),
      );
      expect(res.status).toBe(401);
    }

    // Now rate-limited again
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'wrong' }, {
        'x-hs-client-ip': '10.0.0.200',
      }),
    );
    expect(res.status).toBe(429);
  });

  it('rate-limited IP blocks even valid passwords', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    // Exhaust rate limit
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-hs-client-ip': '10.0.0.77',
        }),
      );
    }

    // Even with correct password, should be blocked
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correct' }, {
        'x-hs-client-ip': '10.0.0.77',
      }),
    );

    expect(res.status).toBe(429);
  });

  it('spoofed X-Forwarded-For does not rotate the rate-limit bucket', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    // Without a server-stamped x-hs-client-ip, every caller lands in one
    // shared 'unknown' bucket no matter what X-Forwarded-For claims.
    // Exhaust it while varying the spoofed header each attempt.
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await loginRoute.POST(
        makePostRequest('/api/auth/login', { password: 'wrong' }, {
          'x-forwarded-for': `1.2.3.${i}`,
        }),
      );
    }

    // A fresh spoofed identity must NOT get a fresh bucket.
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const res = await loginRoute.POST(
      makePostRequest('/api/auth/login', { password: 'correct' }, {
        'x-forwarded-for': '1.2.3.99',
      }),
    );
    expect(res.status).toBe(429);
  });
});

// ═══════════════════════════════════════════════
// POST /api/auth/password
// ═══════════════════════════════════════════════

describe('POST /api/auth/password', () => {
  describe('enable auth (set initial password)', () => {
    it('sets password and returns session cookie', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);
      vi.mocked(setPassword).mockResolvedValue('new.session.token');
      vi.mocked(buildSessionCookie).mockReturnValue(
        'hs-session=new.session.token; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000',
      );

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: 'mypassword123' }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.authEnabled).toBe(true);
      expect(res.headers.get('Set-Cookie')).toContain('hs-session=');
      expect(setPassword).toHaveBeenCalledWith('mypassword123');
      expect(clearAuthCache).toHaveBeenCalled();
    });

    it('does not require current password when auth is disabled', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);
      vi.mocked(setPassword).mockResolvedValue('token');
      vi.mocked(buildSessionCookie).mockReturnValue('hs-session=token');

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: 'longpassword' }),
      );

      expect(res.status).toBe(200);
      expect(verifyPassword).not.toHaveBeenCalled();
    });
  });

  describe('password validation', () => {
    it('rejects password shorter than 8 characters', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: 'short' }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/at least 8 characters/);
      expect(setPassword).not.toHaveBeenCalled();
    });

    it('accepts password of exactly 8 characters', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);
      vi.mocked(setPassword).mockResolvedValue('token');
      vi.mocked(buildSessionCookie).mockReturnValue('hs-session=token');

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: '12345678' }),
      );

      expect(res.status).toBe(200);
      expect(setPassword).toHaveBeenCalledWith('12345678');
    });

    it('returns 400 when newPassword is missing', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { action: 'set' }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/New password is required/);
    });

    it('returns 400 when newPassword is not a string', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: 42 }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/New password is required/);
    });
  });

  describe('change password (auth already enabled)', () => {
    it('requires valid session when auth is enabled', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockRejectedValue(
        new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          currentPassword: 'old',
          newPassword: 'newpassword123',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Authentication required');
    });

    it('requires current password when changing', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { newPassword: 'newpassword123' }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/Current password is required/);
    });

    it('rejects wrong current password', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid current password');
    });

    it('changes password and returns new session on success', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);
      vi.mocked(verifyPassword).mockResolvedValue(true);
      vi.mocked(setPassword).mockResolvedValue('new.token');
      vi.mocked(buildSessionCookie).mockReturnValue('hs-session=new.token');

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          currentPassword: 'oldpassword1',
          newPassword: 'newpassword1',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.authEnabled).toBe(true);
      expect(setPassword).toHaveBeenCalledWith('newpassword1');
      expect(clearAuthCache).toHaveBeenCalled();
    });

    it('password change generates new cookie secret (old sessions invalidated)', async () => {
      // setPassword generates a new cookieSecret internally, so old
      // session tokens signed with the old secret become invalid.
      // We verify setPassword is called (which rotates the secret).
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);
      vi.mocked(verifyPassword).mockResolvedValue(true);
      vi.mocked(setPassword).mockResolvedValue('brand-new.token');
      vi.mocked(buildSessionCookie).mockReturnValue('hs-session=brand-new.token');

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          currentPassword: 'oldpassword1',
          newPassword: 'newpassword1',
        }),
      );

      expect(res.status).toBe(200);
      // setPassword generates new salt + cookieSecret, invalidating old sessions
      expect(setPassword).toHaveBeenCalledWith('newpassword1');
      // A new session cookie is issued for the current user
      expect(res.headers.get('Set-Cookie')).toContain('hs-session=brand-new.token');
    });
  });

  describe('disable auth', () => {
    it('disables auth with valid current password', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);
      vi.mocked(verifyPassword).mockResolvedValue(true);
      vi.mocked(buildClearCookie).mockReturnValue(
        'hs-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
      );

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          action: 'disable',
          currentPassword: 'currentpass1',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.authEnabled).toBe(false);
      expect(clearPassword).toHaveBeenCalled();
      expect(clearAuthCache).toHaveBeenCalled();
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

    it('rejects disable when auth is not enabled', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          action: 'disable',
          currentPassword: 'whatever',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Auth is not enabled');
    });

    it('rejects disable without current password', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', { action: 'disable' }),
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Current password is required');
    });

    it('rejects disable with wrong current password', async () => {
      vi.mocked(isAuthEnabled).mockResolvedValue(true);
      vi.mocked(requireSession).mockResolvedValue(undefined);
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const res = await passwordRoute.POST(
        makePostRequest('/api/auth/password', {
          action: 'disable',
          currentPassword: 'wrongpassword',
        }),
      );
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid current password');
    });
  });
});

// ═══════════════════════════════════════════════
// GET /api/auth/status
// ═══════════════════════════════════════════════

describe('GET /api/auth/status', () => {
  it('returns authEnabled: false when no password is set', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(false);

    const res = await statusRoute.GET(makeGetRequest('/api/auth/status'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authEnabled).toBe(false);
    expect(json.authenticated).toBe(false);
  });

  it('returns authenticated: true with valid session cookie', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });
    vi.mocked(verifySession).mockReturnValue({
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', {
        cookie: 'hs-session=valid.token',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authEnabled).toBe(true);
    expect(json.authenticated).toBe(true);
    expect(verifySession).toHaveBeenCalledWith('valid.token', 'secret', undefined);
  });

  it('returns authenticated: false with invalid session cookie', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });
    vi.mocked(verifySession).mockReturnValue(null);

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', {
        cookie: 'hs-session=invalid.token',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authEnabled).toBe(true);
    expect(json.authenticated).toBe(false);
  });

  it('returns authenticated: false when no cookie is present', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });

    const res = await statusRoute.GET(makeGetRequest('/api/auth/status'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authEnabled).toBe(true);
    expect(json.authenticated).toBe(false);
    // verifySession should not be called when there is no token
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('returns authenticated: false when cookie secret is missing', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: null,
    });

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', {
        cookie: 'hs-session=some.token',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authEnabled).toBe(true);
    expect(json.authenticated).toBe(false);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('handles malformed cookie header (no hs-session)', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', {
        cookie: 'other-cookie=abc; foo=bar',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(false);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('handles empty cookie header', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', { cookie: '' }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.authenticated).toBe(false);
  });

  it('extracts hs-session from multi-cookie header', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(readAuthState).mockResolvedValue({
      passwordHash: 'hash',
      salt: 'salt',
      cookieSecret: 'secret',
    });
    vi.mocked(verifySession).mockReturnValue({
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const res = await statusRoute.GET(
      makeGetRequest('/api/auth/status', {
        cookie: 'other=xyz; hs-session=good.token; another=123',
      }),
    );
    const json = await res.json();

    expect(json.authenticated).toBe(true);
    expect(verifySession).toHaveBeenCalledWith('good.token', 'secret', undefined);
  });
});

// ═══════════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════════

describe('POST /api/auth/logout', () => {
  it('returns success and clears session cookie', async () => {
    vi.mocked(buildClearCookie).mockReturnValue(
      'hs-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    );

    const res = await logoutRoute.POST(
      makePostRequest('/api/auth/logout'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(buildClearCookie).toHaveBeenCalled();
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('hs-session=');
  });

  it('works without any prior session', async () => {
    vi.mocked(buildClearCookie).mockReturnValue(
      'hs-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    );

    // Logout should work even if user has no session
    const res = await logoutRoute.POST(
      makePostRequest('/api/auth/logout'),
    );

    expect(res.status).toBe(200);
  });
});

/* ─── /api/auth/display-token ─────────────────── */

describe('GET /api/auth/display-token', () => {
  it('returns null when auth is disabled', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(false);

    const res = await displayTokenRoute.GET(
      makeGetRequest('/api/auth/display-token'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.displayToken).toBeNull();
  });

  it('returns display token when auth is enabled', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(getDisplayToken).mockResolvedValue('abc123');

    const res = await displayTokenRoute.GET(
      makeGetRequest('/api/auth/display-token'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.displayToken).toBe('abc123');
  });
});

describe('POST /api/auth/display-token', () => {
  it('returns error when auth is disabled', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(false);

    const res = await displayTokenRoute.POST(
      makePostRequest('/api/auth/display-token'),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBeTruthy();
  });

  it('regenerates and returns new token when auth is enabled', async () => {
    vi.mocked(isAuthEnabled).mockResolvedValue(true);
    vi.mocked(regenerateDisplayToken).mockResolvedValue('newtoken456');

    const res = await displayTokenRoute.POST(
      makePostRequest('/api/auth/display-token'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.displayToken).toBe('newtoken456');
    expect(regenerateDisplayToken).toHaveBeenCalled();
  });
});
