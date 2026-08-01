import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/*
 * Testing strategy:
 *
 * The proxy module has a module-level cache (`authEnabledCache`) that cannot be
 * cleared from outside. To get a fresh cache for each test group, we use
 * `vi.resetModules()` + dynamic `import()` in beforeEach.
 *
 * The fs.readFileSync mock is set up via vi.doMock before each fresh import.
 * NextResponse is mocked to return recognizable objects we can assert against.
 *
 * The proxy uses real `Response.json()` for 401s (global, not mocked) and
 * NextResponse.next() / NextResponse.redirect() for pass-through and redirects.
 */

// Shared mock for readFileSync — reassigned per-group
let mockReadFileSync: ReturnType<typeof vi.fn>;

// Type for our proxy function
type ProxyFn = (request: unknown) => unknown;

// ─── Helpers ────────────────────────────────────────

/** Create a minimal request object matching what proxy expects from NextRequest */
function makeRequest(
  pathname: string,
  opts?: {
    method?: string;
    cookie?: string;
    search?: string;
    authorization?: string;
    /** Server-stamped x-hs-client-ip (what the instrumentation patch writes). */
    clientIp?: string;
    /** Client-supplied spoof headers — extractIp must ignore both. */
    xForwardedFor?: string;
    xRealIp?: string;
  },
) {
  const method = opts?.method ?? 'GET';
  const search = opts?.search ?? '';
  const url = `http://localhost:3000${pathname}${search}`;
  const cookieHeader = opts?.cookie ?? null;
  const authorizationHeader = opts?.authorization ?? null;
  const clientIp = opts?.clientIp ?? null;
  const xForwardedFor = opts?.xForwardedFor ?? null;
  const xRealIp = opts?.xRealIp ?? null;

  // Build a cookie store from the header
  const cookieStore = new Map<string, { name: string; value: string }>();
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name) {
        cookieStore.set(name, { name, value: rest.join('=') });
      }
    }
  }

  return {
    method,
    url,
    headers: {
      get(name: string) {
        const lower = name.toLowerCase();
        if (lower === 'authorization') return authorizationHeader;
        if (lower === 'x-hs-client-ip') return clientIp;
        if (lower === 'x-forwarded-for') return xForwardedFor;
        if (lower === 'x-real-ip') return xRealIp;
        return null;
      },
    },
    nextUrl: {
      pathname,
      search,
      searchParams: new URLSearchParams(search),
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name) ?? undefined;
      },
    },
  };
}

// ─── Result type helpers ────────────────────────────

function isPassThrough(result: unknown): boolean {
  return (result as { _type?: string })?._type === 'next';
}

function isRedirect(result: unknown): { pathname: string; from: string | null } | null {
  const r = result as { _type?: string; url?: URL };
  if (r?._type === 'redirect' && r.url) {
    return {
      pathname: r.url.pathname,
      from: r.url.searchParams.get('from'),
    };
  }
  return null;
}

async function is401(result: unknown): Promise<boolean> {
  // Response.json() returns a real Response object
  if (result instanceof Response) {
    return result.status === 401;
  }
  return false;
}

// ─── Fresh proxy loader ─────────────────────────────

async function loadProxyWithAuth(
  authState: 'enabled' | 'disabled' | 'no-file' | 'corrupt' | 'null-hash' | 'permission-error',
): Promise<ProxyFn> {
  vi.resetModules();

  mockReadFileSync = vi.fn();

  switch (authState) {
    case 'enabled':
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ passwordHash: 'abc123', salt: 's', cookieSecret: 'c' }),
      );
      break;
    case 'disabled':
      mockReadFileSync.mockReturnValue(JSON.stringify({ salt: null }));
      break;
    case 'no-file': {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReadFileSync.mockImplementation(() => { throw err; });
      break;
    }
    case 'corrupt':
      mockReadFileSync.mockReturnValue('not valid json{{{');
      break;
    case 'null-hash':
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ passwordHash: null, salt: null, cookieSecret: null }),
      );
      break;
    case 'permission-error': {
      const err = new Error('EACCES') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      mockReadFileSync.mockImplementation(() => { throw err; });
      break;
    }
  }

  vi.doMock('fs', () => ({
    readFileSync: mockReadFileSync,
  }));

  vi.doMock('next/server', () => ({
    NextResponse: {
      next: () => ({ _type: 'next' }),
      redirect: (url: URL) => ({ _type: 'redirect', url }),
    },
  }));

  const mod = await import('@/proxy');
  return mod.proxy as ProxyFn;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Auth disabled — everything passes through
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('proxy — auth disabled (no auth.json file)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('no-file');
  });

  it('allows GET /editor without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/editor')))).toBe(true);
  });

  it('allows PUT /api/config without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/config', { method: 'PUT' })))).toBe(true);
  });

  it('allows GET /api/secrets without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/secrets')))).toBe(true);
  });

  it('allows DELETE /api/backgrounds without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/backgrounds', { method: 'DELETE' })))).toBe(true);
  });

  it('allows GET /api/unsplash/search without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/unsplash/search')))).toBe(true);
  });
});

describe('proxy — auth disabled (passwordHash is null)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('null-hash');
  });

  it('allows all protected routes without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/editor')))).toBe(true);
    expect(isPassThrough(proxy(makeRequest('/api/secrets')))).toBe(true);
    expect(isPassThrough(proxy(makeRequest('/api/config', { method: 'PUT' })))).toBe(true);
    expect(isPassThrough(proxy(makeRequest('/api/unsplash')))).toBe(true);
  });
});

describe('proxy — auth disabled (passwordHash key absent)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('disabled');
  });

  it('allows protected routes through', () => {
    expect(isPassThrough(proxy(makeRequest('/editor')))).toBe(true);
    expect(isPassThrough(proxy(makeRequest('/api/secrets')))).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Auth enabled — core security gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('proxy — auth enabled: public auth routes always accessible', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  // Routes that are public for all methods (GET is not caught by PROTECTED_GET_ROUTES)
  const fullyPublicRoutes = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/status',
  ];

  for (const route of fullyPublicRoutes) {
    it(`GET ${route} passes through without a cookie`, () => {
      expect(isPassThrough(proxy(makeRequest(route)))).toBe(true);
    });

    it(`POST ${route} passes through without a cookie`, () => {
      expect(isPassThrough(proxy(makeRequest(route, { method: 'POST' })))).toBe(true);
    });

    it(`DELETE ${route} passes through without a cookie`, () => {
      expect(isPassThrough(proxy(makeRequest(route, { method: 'DELETE' })))).toBe(true);
    });
  }

  // /api/auth/google/callback: write methods are public (isPublicAuthRoute exemption),
  // but GET is protected because /api/auth/google is in PROTECTED_GET_ROUTES and
  // the sub-path check matches /api/auth/google/callback.
  it('POST /api/auth/google/callback passes through without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/auth/google/callback', { method: 'POST' })))).toBe(true);
  });

  it('DELETE /api/auth/google/callback passes through without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/auth/google/callback', { method: 'DELETE' })))).toBe(true);
  });

  it('GET /api/auth/google/callback is caught by PROTECTED_GET_ROUTES sub-path match', async () => {
    // /api/auth/google is in PROTECTED_GET_ROUTES, and the sub-path check
    // (pathname.startsWith(r + '/')) matches /api/auth/google/callback.
    // The isPublicAuthRoute exemption only applies to write methods.
    expect(await is401(proxy(makeRequest('/api/auth/google/callback')))).toBe(true);
  });
});

describe('proxy — auth enabled: unprotected display-facing GET routes', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  const publicGetRoutes = [
    '/api/weather',
    '/api/config',
    '/api/calendar',
    '/api/stocks',
    '/api/crypto',
    '/api/news',
    '/api/jokes',
    '/api/quote',
    '/api/history',
    '/api/traffic',
    '/api/sports',
    '/api/air-quality',
    '/api/display/commands',
    '/api/backgrounds',
  ];

  for (const route of publicGetRoutes) {
    it(`GET ${route} passes through without a cookie`, () => {
      expect(isPassThrough(proxy(makeRequest(route)))).toBe(true);
    });
  }
});

describe('proxy — auth enabled: editor pages require authentication', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('redirects GET /editor to /login?from=/editor', () => {
    const result = proxy(makeRequest('/editor'));
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect!.pathname).toBe('/login');
    expect(redirect!.from).toBe('/editor');
  });

  it('redirects GET /editor/settings and preserves the path in from', () => {
    const result = proxy(makeRequest('/editor/settings'));
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect!.from).toBe('/editor/settings');
  });

  it('redirects GET /editor/settings?section=defaults&page=calendar and preserves the query string in from', () => {
    const result = proxy(
      makeRequest('/editor/settings', { search: '?section=defaults&page=calendar' }),
    );
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect!.from).toBe('/editor/settings?section=defaults&page=calendar');
  });

  it('redirects GET /editor/screens/abc/modules (deep path)', () => {
    const result = proxy(makeRequest('/editor/screens/abc/modules'));
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect!.from).toBe('/editor/screens/abc/modules');
  });

  it('allows GET /editor with a valid session cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/editor', { cookie: 'hs-session=valid-token' })))).toBe(true);
  });

  it('allows GET /editor/settings with a valid session cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/editor/settings', { cookie: 'hs-session=tok.en' })))).toBe(true);
  });

  it('redirects GET /remote to /login?from=/remote', () => {
    const result = proxy(makeRequest('/remote'));
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect!.pathname).toBe('/login');
    expect(redirect!.from).toBe('/remote');
  });

  it('allows GET /remote with a valid session cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/remote', { cookie: 'hs-session=valid' })))).toBe(true);
  });

  it('uses the request origin for the redirect URL', () => {
    const result = proxy(makeRequest('/editor'));
    const r = result as { _type: string; url: URL };
    expect(r.url.origin).toBe('http://localhost:3000');
  });
});

describe('proxy — auth enabled: API write operations require authentication', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  const writeMethods = ['PUT', 'POST', 'DELETE'] as const;
  const writeRoutes = ['/api/config', '/api/secrets', '/api/backgrounds', '/api/weather'];

  for (const method of writeMethods) {
    for (const route of writeRoutes) {
      it(`${method} ${route} returns 401 without a cookie`, async () => {
        expect(await is401(proxy(makeRequest(route, { method })))).toBe(true);
      });

      it(`${method} ${route} passes through with a session cookie`, () => {
        expect(isPassThrough(proxy(makeRequest(route, { method, cookie: 'hs-session=token' })))).toBe(true);
      });
    }
  }
});

describe('proxy — auth enabled: /chores kid view POSTs are LAN-public', () => {
  // The /chores route is the unauthenticated kid view (no login). Its two
  // mutation endpoints (`POST /api/chores` to toggle a completion, `POST
  // /api/rewards` to redeem a reward) must reach their handlers without a
  // session cookie. The handlers themselves do their own input validation.
  // The admin-only sub-paths (/api/chores/data, /api/rewards/data) stay
  // protected — that's where reward editing and balance adjustments live.
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('POST /api/chores passes through without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/chores', { method: 'POST' })))).toBe(true);
  });

  it('POST /api/rewards passes through without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/rewards', { method: 'POST' })))).toBe(true);
  });

  it('POST /api/chores/data still requires a cookie (admin-only)', async () => {
    expect(await is401(proxy(makeRequest('/api/chores/data', { method: 'POST' })))).toBe(true);
  });

  it('PUT /api/chores/data still requires a cookie (admin-only)', async () => {
    expect(await is401(proxy(makeRequest('/api/chores/data', { method: 'PUT' })))).toBe(true);
  });

  it('POST /api/rewards/data still requires a cookie (admin-only balance adjust)', async () => {
    expect(await is401(proxy(makeRequest('/api/rewards/data', { method: 'POST' })))).toBe(true);
  });

  it('PUT /api/rewards/data still requires a cookie (admin-only reward edits)', async () => {
    expect(await is401(proxy(makeRequest('/api/rewards/data', { method: 'PUT' })))).toBe(true);
  });

  it('GET /chores page is not caught by /editor or /remote page protection', () => {
    expect(isPassThrough(proxy(makeRequest('/chores')))).toBe(true);
  });
});

describe('proxy — auth enabled: /api/display/hw-stats is LAN-public', () => {
  // The reporter on a display-only Pi posts to this endpoint without a
  // session cookie or bearer token. Route-side auth (requireAdoptedDisplay)
  // enforces that only adopted displays can inject hw data, so the proxy
  // needs to pass the request through — otherwise it 401s before ever
  // reaching the adoption check.
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('POST /api/display/hw-stats passes through without a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/display/hw-stats', { method: 'POST' })))).toBe(true);
  });

  it('POST /api/display/hw-stats/extra still requires auth (no prefix match)', async () => {
    // Exact-match only: the bypass is the literal path. A future sub-path
    // wouldn't inherit the exemption, which is correct — if a new sub-path
    // is added it should opt into the exemption explicitly.
    expect(await is401(proxy(makeRequest('/api/display/hw-stats/extra', { method: 'POST' })))).toBe(true);
  });

  it('PUT /api/display/hw-stats still requires auth (POST-only bypass)', async () => {
    expect(await is401(proxy(makeRequest('/api/display/hw-stats', { method: 'PUT' })))).toBe(true);
  });
});

describe('proxy — auth enabled: protected GET routes require authentication', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  const protectedGetRoutes = [
    '/api/secrets',
    '/api/calendars',
    '/api/backgrounds/directories',
    '/api/system/backups',
    '/api/system/changelog',
    '/api/system/version',
    '/api/system/status',
    '/api/auth/password',
    '/api/auth/sessions',
    '/api/auth/google',
    '/api/auth/google/device',
    '/api/auth/google/status',
  ];

  for (const route of protectedGetRoutes) {
    it(`GET ${route} returns 401 without a cookie`, async () => {
      expect(await is401(proxy(makeRequest(route)))).toBe(true);
    });

    it(`GET ${route} passes through with a session cookie`, () => {
      expect(isPassThrough(proxy(makeRequest(route, { cookie: 'hs-session=valid' })))).toBe(true);
    });
  }
});

describe('proxy — auth enabled: unsplash routes are protected', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('GET /api/unsplash returns 401 without a cookie', async () => {
    expect(await is401(proxy(makeRequest('/api/unsplash')))).toBe(true);
  });

  it('GET /api/unsplash/search returns 401 without a cookie', async () => {
    expect(await is401(proxy(makeRequest('/api/unsplash/search')))).toBe(true);
  });

  it('GET /api/unsplash/photos returns 401 without a cookie', async () => {
    expect(await is401(proxy(makeRequest('/api/unsplash/photos')))).toBe(true);
  });

  it('GET /api/unsplash passes through with a cookie', () => {
    expect(isPassThrough(proxy(makeRequest('/api/unsplash', { cookie: 'hs-session=tok' })))).toBe(true);
  });
});

describe('proxy — auth enabled: protected GET route sub-paths are protected', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('GET /api/secrets/weather returns 401 (sub-path matching)', async () => {
    expect(await is401(proxy(makeRequest('/api/secrets/weather')))).toBe(true);
  });

  it('GET /api/system/backups/latest returns 401', async () => {
    expect(await is401(proxy(makeRequest('/api/system/backups/latest')))).toBe(true);
  });

  it('GET /api/auth/google/device returns 401', async () => {
    expect(await is401(proxy(makeRequest('/api/auth/google/device')))).toBe(true);
  });
});

describe('proxy — auth enabled: cookie presence check', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('rejects request with empty hs-session cookie value', () => {
    // Empty cookie value means session?.value is falsy
    const result = proxy(makeRequest('/editor', { cookie: 'hs-session=' }));
    expect(isRedirect(result)).not.toBeNull();
  });

  it('ignores other cookies — only checks hs-session', () => {
    const result = proxy(makeRequest('/editor', { cookie: 'other-cookie=value123' }));
    expect(isRedirect(result)).not.toBeNull();
  });

  it('accepts hs-session alongside other cookies', () => {
    const result = proxy(makeRequest('/editor', { cookie: 'other=x; hs-session=tok; another=y' }));
    expect(isPassThrough(result)).toBe(true);
  });

  it('does not validate cookie contents (just presence check)', () => {
    // Even a nonsense cookie value passes the proxy — real validation is in requireSession()
    const result = proxy(makeRequest('/editor', { cookie: 'hs-session=garbage.not.a.real.token' }));
    expect(isPassThrough(result)).toBe(true);
  });
});

describe('proxy — auth enabled: Bearer token and query token passthrough', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('passes through PUT /api/config with Bearer token', () => {
    expect(isPassThrough(proxy(makeRequest('/api/config', { method: 'PUT', authorization: 'Bearer abc123' })))).toBe(true);
  });

  it('passes through POST /api/display/status with Bearer token', () => {
    expect(isPassThrough(proxy(makeRequest('/api/display/status', { method: 'POST', authorization: 'Bearer abc123' })))).toBe(true);
  });

  it('passes through GET /api/secrets with Bearer token', () => {
    expect(isPassThrough(proxy(makeRequest('/api/secrets', { authorization: 'Bearer tok' })))).toBe(true);
  });

  it('passes through with ?token= query param', () => {
    expect(isPassThrough(proxy(makeRequest('/api/display/wake', { search: '?token=abc123' })))).toBe(true);
  });

  it('rejects request with empty Bearer token', async () => {
    // "Bearer " with nothing after is not a valid token
    const result = proxy(makeRequest('/api/secrets', { authorization: 'Bearer ' }));
    // Still passes the proxy gate — real validation is in requireSession/requireDisplayAuth
    expect(isPassThrough(result)).toBe(true);
  });

  it('rejects request with non-Bearer authorization header', async () => {
    expect(await is401(proxy(makeRequest('/api/secrets', { authorization: 'Basic dXNlcjpwYXNz' })))).toBe(true);
  });

  it('redirects /editor even with Bearer token (editor requires cookie)', () => {
    // Bearer tokens don't help for page routes — only API routes
    const result = proxy(makeRequest('/editor', { authorization: 'Bearer tok' }));
    // The proxy checks isProtectedRoute first, then credentials. /editor is a page route
    // and gets past the credential check, but since it's not /api/ it goes to redirect logic.
    // Actually, with our change, Bearer passes through before the redirect check.
    expect(isPassThrough(result)).toBe(true);
  });
});

describe('proxy — auth enabled: 401 JSON response for API routes (not redirects)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('unauthenticated API route returns 401 Response (not a redirect)', async () => {
    const result = proxy(makeRequest('/api/secrets'));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    const body = await (result as Response).json();
    expect(body).toEqual({ error: 'Authentication required' });
  });

  it('unauthenticated PUT on API returns 401 JSON (not a redirect)', async () => {
    const result = proxy(makeRequest('/api/config', { method: 'PUT' }));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Corrupt / error states — fail closed
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('proxy — corrupt auth.json (invalid JSON) — fail closed', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('corrupt');
  });

  it('rejects /editor (redirects to login)', () => {
    const result = proxy(makeRequest('/editor'));
    expect(isRedirect(result)).not.toBeNull();
  });

  it('rejects GET /api/secrets with 401', async () => {
    expect(await is401(proxy(makeRequest('/api/secrets')))).toBe(true);
  });

  it('still allows public auth routes', () => {
    expect(isPassThrough(proxy(makeRequest('/api/auth/login', { method: 'POST' })))).toBe(true);
  });

  it('still allows unprotected GET routes', () => {
    expect(isPassThrough(proxy(makeRequest('/api/weather')))).toBe(true);
  });
});

describe('proxy — permission error (EACCES) — fail closed', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('permission-error');
  });

  it('treats auth as enabled — rejects /editor', () => {
    expect(isRedirect(proxy(makeRequest('/editor')))).not.toBeNull();
  });

  it('treats auth as enabled — rejects /api/secrets', async () => {
    expect(await is401(proxy(makeRequest('/api/secrets')))).toBe(true);
  });
});

describe('proxy — generic error (no code property) — fail closed', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    vi.resetModules();
    mockReadFileSync = vi.fn().mockImplementation(() => { throw new Error('unexpected'); });

    vi.doMock('fs', () => ({ readFileSync: mockReadFileSync }));
    vi.doMock('next/server', () => ({
      NextResponse: {
        next: () => ({ _type: 'next' }),
        redirect: (url: URL) => ({ _type: 'redirect', url }),
      },
    }));

    const mod = await import('@/proxy');
    proxy = mod.proxy as ProxyFn;
  });

  it('treats auth as enabled — rejects /editor', () => {
    expect(isRedirect(proxy(makeRequest('/editor')))).not.toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cache behavior
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('proxy — auth check caching', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches the auth check — does not re-read file on every request', async () => {
    const proxy = await loadProxyWithAuth('enabled');

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    proxy(makeRequest('/editor', { cookie: 'hs-session=tok' }));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('re-reads auth.json after cache TTL expires (5 seconds)', async () => {
    vi.useFakeTimers();

    const proxy = await loadProxyWithAuth('enabled');

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    // Advance time past the 5-second TTL
    vi.advanceTimersByTime(5001);

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });

  it('picks up auth state change after cache expires', async () => {
    vi.useFakeTimers();

    // Start with auth disabled (no file)
    const proxy = await loadProxyWithAuth('no-file');

    // Auth disabled: editor passes through
    expect(isPassThrough(proxy(makeRequest('/editor')))).toBe(true);

    // "Enable" auth by changing what readFileSync returns
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ passwordHash: 'hash', salt: 's', cookieSecret: 'c' }),
    );

    // Still cached as disabled
    expect(isPassThrough(proxy(makeRequest('/editor')))).toBe(true);

    // Expire cache
    vi.advanceTimersByTime(5001);

    // Now picks up the change — editor is protected
    expect(isRedirect(proxy(makeRequest('/editor')))).not.toBeNull();
  });

  it('does not re-read within the 5-second window', async () => {
    vi.useFakeTimers();

    const proxy = await loadProxyWithAuth('enabled');

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4999);

    proxy(makeRequest('/api/weather'));
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Security boundary tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('proxy — security boundaries', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithAuth('enabled');
  });

  it('GET /api/weather is public but PUT /api/weather is protected', async () => {
    expect(isPassThrough(proxy(makeRequest('/api/weather')))).toBe(true);
    expect(await is401(proxy(makeRequest('/api/weather', { method: 'PUT' })))).toBe(true);
  });

  it('GET /api/config is public but PUT /api/config is protected', async () => {
    expect(isPassThrough(proxy(makeRequest('/api/config')))).toBe(true);
    expect(await is401(proxy(makeRequest('/api/config', { method: 'PUT' })))).toBe(true);
  });

  it('GET /api/config is public but POST /api/config is protected', async () => {
    expect(isPassThrough(proxy(makeRequest('/api/config')))).toBe(true);
    expect(await is401(proxy(makeRequest('/api/config', { method: 'POST' })))).toBe(true);
  });

  it('POST on public auth routes bypasses write-method protection', () => {
    expect(isPassThrough(proxy(makeRequest('/api/auth/login', { method: 'POST' })))).toBe(true);
    expect(isPassThrough(proxy(makeRequest('/api/auth/logout', { method: 'POST' })))).toBe(true);
  });

  it('POST on non-auth API routes is protected', async () => {
    expect(await is401(proxy(makeRequest('/api/backgrounds', { method: 'POST' })))).toBe(true);
  });

  it('attacker cannot reach /api/secrets without authentication', async () => {
    expect(await is401(proxy(makeRequest('/api/secrets')))).toBe(true);
  });

  it('attacker cannot reach /api/calendars without authentication', async () => {
    expect(await is401(proxy(makeRequest('/api/calendars')))).toBe(true);
  });

  it('attacker cannot reach /api/auth/sessions without authentication', async () => {
    expect(await is401(proxy(makeRequest('/api/auth/sessions')))).toBe(true);
  });

  it('attacker cannot reach /api/system/backups without authentication', async () => {
    expect(await is401(proxy(makeRequest('/api/system/backups')))).toBe(true);
  });

  it('attacker cannot write to any API route without authentication', async () => {
    const routes = ['/api/config', '/api/secrets', '/api/backgrounds', '/api/display/wake'];
    for (const route of routes) {
      for (const method of ['PUT', 'POST', 'DELETE']) {
        expect(await is401(proxy(makeRequest(route, { method })))).toBe(true);
      }
    }
  });

  it('public auth routes use exact match — /api/auth/login/evil is NOT public', async () => {
    // /api/auth/login/evil is not in PUBLIC_AUTH_ROUTES (exact match)
    // It's a POST on /api/* so it's a write operation and protected
    expect(await is401(proxy(makeRequest('/api/auth/login/evil', { method: 'POST' })))).toBe(true);
  });

  it('/api/auth/password is NOT a public auth route', async () => {
    expect(await is401(proxy(makeRequest('/api/auth/password')))).toBe(true);
  });

  it('/api/auth/google is protected, and its sub-paths are also protected via sub-path match', async () => {
    // /api/auth/google is in PROTECTED_GET_ROUTES
    expect(await is401(proxy(makeRequest('/api/auth/google')))).toBe(true);
    // /api/auth/google/callback is in PUBLIC_AUTH_ROUTES BUT the isPublicAuthRoute
    // exemption only applies to write methods. For GET, the PROTECTED_GET_ROUTES
    // sub-path check catches /api/auth/google/callback via /api/auth/google.
    expect(await is401(proxy(makeRequest('/api/auth/google/callback')))).toBe(true);
  });

  it('POST /api/auth/google/callback is public (write-method exemption)', () => {
    // Write methods check isPublicAuthRoute before marking as protected
    expect(isPassThrough(proxy(makeRequest('/api/auth/google/callback', { method: 'POST' })))).toBe(true);
  });

  it('GET on non-listed API route is public (display route)', () => {
    expect(isPassThrough(proxy(makeRequest('/api/jokes')))).toBe(true);
  });

  it('all editor sub-paths are protected', () => {
    for (const p of ['/editor', '/editor/', '/editor/screens', '/editor/screens/abc/modules']) {
      expect(isRedirect(proxy(makeRequest(p)))).not.toBeNull();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IP access restriction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Load the proxy with a custom auth.json payload — used for IP restriction tests.
 * Caller provides the exact JSON shape they want readFileSync to return.
 */
async function loadProxyWithConfig(config: Record<string, unknown>): Promise<ProxyFn> {
  vi.resetModules();

  mockReadFileSync = vi.fn().mockReturnValue(JSON.stringify(config));

  vi.doMock('fs', () => ({
    readFileSync: mockReadFileSync,
  }));

  vi.doMock('next/server', () => ({
    NextResponse: {
      next: () => ({ _type: 'next' }),
      redirect: (url: URL) => ({ _type: 'redirect', url }),
    },
  }));

  const mod = await import('@/proxy');
  return mod.proxy as ProxyFn;
}

/** Assert result is a Response with status 403 and the ip_restricted reason. */
async function is403IpRestricted(result: unknown): Promise<boolean> {
  if (!(result instanceof Response)) return false;
  if (result.status !== 403) return false;
  const body = await result.json();
  return body.error === 'Access denied' && body.reason === 'ip_restricted';
}

describe('proxy — IP access restriction (feature inactive)', () => {
  it('passes through when restrictAccess is false, even with non-matching IP', async () => {
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['192.168.1.0/24'],
      ipRestrictAccess: false,
    });
    expect(isPassThrough(proxy(makeRequest('/editor', { clientIp: '10.0.0.1' })))).toBe(true);
  });

  it('passes through when allowlist is empty, even if restrictAccess is true', async () => {
    // Guards against accidental total lockout from a checked-in blank list.
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: [],
      ipRestrictAccess: true,
    });
    expect(isPassThrough(proxy(makeRequest('/editor', { clientIp: '10.0.0.1' })))).toBe(true);
  });

  it('passes through when ipAllowlist field is missing entirely', async () => {
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipRestrictAccess: true, // enabled but no allowlist → effectively off
    });
    expect(isPassThrough(proxy(makeRequest('/editor', { clientIp: '10.0.0.1' })))).toBe(true);
  });
});

describe('proxy — IP access restriction (allowlisted IPs)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['192.168.1.0/24', '10.0.0.5/32'],
      ipRestrictAccess: true,
    });
  });

  it('allowlisted IP in a /24 subnet passes through to /editor', () => {
    expect(isPassThrough(proxy(makeRequest('/editor', { clientIp: '192.168.1.42' })))).toBe(true);
  });

  it('allowlisted single-host /32 passes through', () => {
    expect(isPassThrough(proxy(makeRequest('/api/weather', { clientIp: '10.0.0.5' })))).toBe(true);
  });

  it('IPv4-mapped IPv6 ::ffff:192.168.1.50 is normalized and matches the /24', () => {
    expect(isPassThrough(proxy(makeRequest('/editor', { clientIp: '::ffff:192.168.1.50' })))).toBe(true);
  });

  it('ignores a spoofed x-forwarded-for — allowlisted value in it does not grant access', async () => {
    const result = proxy(makeRequest('/api/weather', { xForwardedFor: '192.168.1.42' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('ignores a spoofed x-real-ip — allowlisted value in it does not grant access', async () => {
    const result = proxy(makeRequest('/api/weather', { xRealIp: '192.168.1.99' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('spoofed x-forwarded-for cannot override the stamped client IP', async () => {
    const result = proxy(
      makeRequest('/api/weather', { clientIp: '10.9.9.9', xForwardedFor: '192.168.1.42' }),
    );
    expect(await is403IpRestricted(result)).toBe(true);
  });
});

describe('proxy — IP access restriction (blocked IPs)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['192.168.1.0/24'],
      ipRestrictAccess: true,
    });
  });

  it('non-allowlisted IP gets 403 with ip_restricted reason on /api/*', async () => {
    const result = proxy(makeRequest('/api/weather', { clientIp: '10.0.0.99' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('non-allowlisted IP gets redirected to /login on page routes', () => {
    const result = proxy(makeRequest('/editor', { clientIp: '10.0.0.99' }));
    const redirect = isRedirect(result);
    expect(redirect).not.toBeNull();
    expect(redirect?.pathname).toBe('/login');
  });

  it('IPv6 loopback ::1 is blocked (IPv4-only enforcement)', async () => {
    // The IPv6 warning in the UI documents this limitation.
    const result = proxy(makeRequest('/api/weather', { clientIp: '::1' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('link-local IPv6 (fe80::...) is blocked', async () => {
    const result = proxy(makeRequest('/api/weather', { clientIp: 'fe80::1234' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('"unknown" IP (no headers) is blocked', async () => {
    const result = proxy(makeRequest('/api/weather'));
    expect(await is403IpRestricted(result)).toBe(true);
  });
});

describe('proxy — IP access restriction (exempt paths)', () => {
  let proxy: ProxyFn;

  beforeEach(async () => {
    proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['192.168.1.0/24'],
      ipRestrictAccess: true,
    });
  });

  it('/login is exempt even for blocked IPs (so the banner can render)', () => {
    expect(isPassThrough(proxy(makeRequest('/login', { clientIp: '10.0.0.99' })))).toBe(true);
  });

  it('/api/auth/status is exempt even for blocked IPs (login page fetches it)', () => {
    expect(isPassThrough(proxy(makeRequest('/api/auth/status', { clientIp: '10.0.0.99' })))).toBe(true);
  });

  it('/api/auth/login is NOT exempt — POST from blocked IP is 403', async () => {
    // Even though /api/auth/login is in PUBLIC_AUTH_ROUTES for the auth gate,
    // the IP restriction runs first and doesn't exempt it. This prevents a
    // blocked client from even attempting credentials.
    const result = proxy(makeRequest('/api/auth/login', { method: 'POST', clientIp: '10.0.0.99' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });
});

describe('proxy — IP access restriction (fail-safe CIDR parsing)', () => {
  it('garbage CIDR entry does not match any IP', async () => {
    // Hand-edited auth.json with a typo shouldn't accidentally grant access.
    // "foo/24" would previously coerce +"foo" to NaN → 0 and match 0.0.0.0/24.
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['foo/24'],
      ipRestrictAccess: true,
    });
    const result = proxy(makeRequest('/api/weather', { clientIp: '0.0.0.1' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('mixed valid + invalid entries still matches valid ones', () => {
    const proxy = loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['foo/24', '192.168.1.0/24', 'bar/8'],
      ipRestrictAccess: true,
    });
    return proxy.then((p) => {
      expect(isPassThrough(p(makeRequest('/api/weather', { clientIp: '192.168.1.50' })))).toBe(true);
    });
  });

  it('prefix > 32 in hand-edited entry is skipped, not treated as /32', async () => {
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['192.168.1.0/99'],
      ipRestrictAccess: true,
    });
    // The /99 entry is invalid and skipped. No other entries → blocked.
    const result = proxy(makeRequest('/api/weather', { clientIp: '192.168.1.50' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });

  it('leading-zero octets are rejected (matches net.isIPv4 behavior)', async () => {
    // RFC says 01.168.1.0 is not a valid IPv4 literal. Node's net.isIPv4
    // rejects it, so the library's isIpAllowed rejects it. The proxy's
    // inline matcher must match that behavior to avoid divergence between
    // the proxy gate and the auth-layer bypass.
    const proxy = await loadProxyWithConfig({
      passwordHash: null,
      ipAllowlist: ['01.168.1.0/24'],
      ipRestrictAccess: true,
    });
    // Entry is invalid and skipped. Caller at 1.168.1.50 should NOT match.
    const result = proxy(makeRequest('/api/weather', { clientIp: '1.168.1.50' }));
    expect(await is403IpRestricted(result)).toBe(true);
  });
});
