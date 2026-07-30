import { describe, it, expect, vi, beforeEach } from 'vitest';

// fetchWithTimeout is the only impure dependency of followRedirectsWithValidation
// (isAllowedDomain uses the real, pure isBlockedHost hostname check). Mock it so
// tests script the redirect/response sequence without touching the network.
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import {
  isAllowedDomain,
  followRedirectsWithValidation,
  looksLikeExpiredToken,
  inRefreshCooldown,
  startRefreshCooldown,
  _resetRefreshCooldowns,
  REFRESH_COOLDOWN_MS,
} from '@/lib/plugin-proxy';

// --- Helpers ---

/** Script the mocked fetch to return responses in order. Each entry is either a
 *  redirect (status + Location) or a terminal body response. */
function scriptFetch(
  responses: Array<
    | { redirect: string; status?: number }
    | { body: string; status?: number; contentType?: string }
  >,
) {
  let callIdx = 0;
  vi.mocked(fetchWithTimeout).mockImplementation(async () => {
    const r = responses[Math.min(callIdx++, responses.length - 1)];
    if ('redirect' in r) {
      return {
        ok: false,
        status: r.status ?? 302,
        headers: new Headers({ Location: r.redirect }),
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'Content-Type': r.contentType ?? 'application/json' }),
      arrayBuffer: async () => new TextEncoder().encode(r.body).buffer,
    } as unknown as Response;
  });
}

const alwaysSafe = vi.fn(async () => true);

function baseOpts(overrides: Partial<Parameters<typeof followRedirectsWithValidation>[0]> = {}) {
  return {
    url: 'https://api.example.com/start',
    method: 'GET',
    payload: undefined as string | undefined,
    headers: {} as Record<string, string>,
    allowedDomains: ['api.example.com'],
    allowLan: false,
    safeCheck: alwaysSafe,
    ...overrides,
  };
}

beforeEach(() => {
  // clearAllMocks resets call history AND implementations for the module-factory
  // vi.fn() mocks; each test re-scripts fetchWithTimeout before calling.
  vi.clearAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isAllowedDomain
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('isAllowedDomain', () => {
  it('matches an exact domain', () => {
    expect(isAllowedDomain('https://api.example.com/x', ['api.example.com'], false)).toBe(true);
  });

  it('matches a wildcard against subdomains and the bare domain', () => {
    expect(isAllowedDomain('https://sub.example.com/', ['*.example.com'], false)).toBe(true);
    expect(isAllowedDomain('https://example.com/', ['*.example.com'], false)).toBe(true);
    expect(isAllowedDomain('https://a.b.example.com/', ['*.example.com'], false)).toBe(true);
  });

  it('does not match a lookalike suffix', () => {
    expect(isAllowedDomain('https://notexample.com/', ['*.example.com'], false)).toBe(false);
  });

  it('blocks internal hosts even when explicitly listed (allowLan false)', () => {
    expect(isAllowedDomain('http://localhost/', ['localhost'], false)).toBe(false);
    expect(isAllowedDomain('http://127.0.0.1/', ['127.0.0.1'], false)).toBe(false);
  });

  it('permits LAN hosts with allowLan but still blocks metadata + unspecified', () => {
    expect(isAllowedDomain('http://192.168.1.10/', ['*'], true)).toBe(true);
    expect(isAllowedDomain('http://169.254.169.254/', ['*'], true)).toBe(false);
    expect(isAllowedDomain('http://0.0.0.0/', ['*'], true)).toBe(false);
  });

  it('returns false for an unparseable URL', () => {
    expect(isAllowedDomain('not-a-url', ['api.example.com'], false)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// followRedirectsWithValidation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('followRedirectsWithValidation', () => {
  it('returns the terminal response with no redirect', async () => {
    scriptFetch([{ body: '{"ok":true}' }]);
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.status).toBe(200);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect within an allowed domain', async () => {
    scriptFetch([
      { redirect: 'https://api.example.com/next', status: 302 },
      { body: '{"final":true}' },
    ]);
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect that escapes allowedDomains (403)', async () => {
    scriptFetch([{ redirect: 'https://attacker.com/exfil', status: 302 }]);
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      const json = await result.error.json();
      expect(json.error).toBe('Redirect target not in plugin allowedDomains');
    }
  });

  it('rejects a redirect target that fails the DNS-resolving safeCheck (403)', async () => {
    const safeCheck = vi
      .fn<(url: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false); // redirect target fails
    scriptFetch([{ redirect: 'https://sub.example.com/secret', status: 302 }]);
    const result = await followRedirectsWithValidation(
      baseOpts({ allowedDomains: ['*.example.com'], safeCheck }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(403);
      const json = await result.error.json();
      expect(json.error).toBe('Redirect target resolves to a blocked address');
    }
  });

  it('rejects an unparseable redirect Location (502)', async () => {
    scriptFetch([{ redirect: 'http://[::bad::url', status: 302 }]);
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(502);
      const json = await result.error.json();
      expect(json.error).toBe('Upstream returned an invalid redirect Location');
    }
  });

  it('rejects a redirect chain longer than the hop cap (502)', async () => {
    // 6 redirects in a row; the cap is 5 hops.
    scriptFetch(
      Array.from({ length: 6 }, (_, i) => ({
        redirect: `https://api.example.com/hop-${i}`,
        status: 302,
      })),
    );
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(502);
      const json = await result.error.json();
      expect(json.error).toBe('Too many redirects from upstream');
    }
  });

  it('downgrades POST to GET and drops the body on a 303 redirect', async () => {
    scriptFetch([
      { redirect: 'https://api.example.com/next', status: 303 },
      { body: '{"ok":true}' },
    ]);
    const result = await followRedirectsWithValidation(
      baseOpts({ method: 'POST', payload: '{"data":1}' }),
    );
    expect(result.ok).toBe(true);
    const secondCall = vi.mocked(fetchWithTimeout).mock.calls[1][1] as RequestInit;
    expect(secondCall.method).toBe('GET');
    expect(secondCall.body).toBeUndefined();
  });

  it('preserves POST and body on a 307 redirect', async () => {
    scriptFetch([
      { redirect: 'https://api.example.com/next', status: 307 },
      { body: '{"ok":true}' },
    ]);
    const result = await followRedirectsWithValidation(
      baseOpts({ method: 'POST', payload: '{"data":1}' }),
    );
    expect(result.ok).toBe(true);
    const secondCall = vi.mocked(fetchWithTimeout).mock.calls[1][1] as RequestInit;
    expect(secondCall.method).toBe('POST');
    expect(secondCall.body).toBe('{"data":1}');
  });

  it('treats a 3xx without a Location header as the terminal response', async () => {
    // No Location header -> the loop cannot follow, so this 3xx is returned as-is.
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      status: 304,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
    const result = await followRedirectsWithValidation(baseOpts());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.response.status).toBe(304);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});

/* ─── Auth-refresh throttling ─────────────────────
 * The proxy used to force-refresh a token on ANY upstream 401, with no check
 * that a token was even sent and no cooldown. A plugin polling one
 * permanently-401ing endpoint every 60s performed ~1,440 refresh grants a day;
 * providers that rotate the refresh token on each grant can revoke the whole
 * connection for that.
 */

describe('looksLikeExpiredToken', () => {
  function resWith(headers: Record<string, string>): Response {
    return { headers: new Headers(headers) } as unknown as Response;
  }

  it('treats a missing WWW-Authenticate as possibly-expired (providers vary)', () => {
    expect(looksLikeExpiredToken(resWith({}))).toBe(true);
  });

  it('recognises the RFC 6750 invalid_token error', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer error="invalid_token"' }),
    )).toBe(true);
  });

  it('recognises invalid_token without quotes', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer error=invalid_token' }),
    )).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'BEARER ERROR="INVALID_TOKEN"' }),
    )).toBe(true);
  });

  // The whole point: a scope error must not be mistaken for an expiry, because
  // refreshing cannot possibly fix it.
  it('rejects an insufficient_scope error', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer error="insufficient_scope"' }),
    )).toBe(false);
  });

  it('rejects invalid_request', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer error="invalid_request"' }),
    )).toBe(false);
  });

  // The `error` parameter is optional in RFC 6750, and plenty of providers answer
  // an expired token with a bare challenge. Suppressing the retry there would lose
  // the only recovery for a token our stored expiry still believes is valid.
  it('allows a retry on a bare Bearer challenge with no error code', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer realm="api"' }),
    )).toBe(true);
  });

  it('allows a retry on a bare Bearer challenge with no parameters at all', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer' }),
    )).toBe(true);
  });

  // An unrecognised-but-explicit error code is still an explicit "this is not an
  // expiry" signal, so it keeps suppressing the retry.
  it('rejects an unrecognised explicit error code', () => {
    expect(looksLikeExpiredToken(
      resWith({ 'WWW-Authenticate': 'Bearer error="account_locked"' }),
    )).toBe(false);
  });
});

describe('refresh cooldown', () => {
  beforeEach(() => {
    _resetRefreshCooldowns();
  });

  it('reports no cooldown for a plugin that never failed', () => {
    expect(inRefreshCooldown('plugin-a')).toBe(false);
  });

  it('holds a plugin in cooldown after a failed refresh', () => {
    startRefreshCooldown('plugin-a', 1_000);
    expect(inRefreshCooldown('plugin-a', 1_000)).toBe(true);
    expect(inRefreshCooldown('plugin-a', 1_000 + REFRESH_COOLDOWN_MS - 1)).toBe(true);
  });

  it('releases the cooldown once the window elapses', () => {
    startRefreshCooldown('plugin-a', 1_000);
    expect(inRefreshCooldown('plugin-a', 1_000 + REFRESH_COOLDOWN_MS)).toBe(false);
  });

  it('scopes cooldowns per plugin', () => {
    startRefreshCooldown('plugin-a', 1_000);
    expect(inRefreshCooldown('plugin-a', 1_000)).toBe(true);
    expect(inRefreshCooldown('plugin-b', 1_000)).toBe(false);
  });

  it('evicts expired entries rather than growing unbounded', () => {
    startRefreshCooldown('stale', 0);
    // A later cooldown for another plugin sweeps the expired entry out.
    startRefreshCooldown('fresh', REFRESH_COOLDOWN_MS + 1);
    expect(inRefreshCooldown('stale', REFRESH_COOLDOWN_MS + 1)).toBe(false);
    expect(inRefreshCooldown('fresh', REFRESH_COOLDOWN_MS + 1)).toBe(true);
  });
});
