import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { NextRequest } from 'next/server';

// The SSRF + redirect layer does real DNS resolution and real fetches, so mock
// it: url-safety always passes, and followRedirectsWithValidation becomes a spy
// we inspect for exactly which URL/headers the proxy WOULD send upstream. The
// pure domain matcher (isAllowedDomain) and the on-disk token store stay real.
const mocks = vi.hoisted(() => ({
  followRedirects: vi.fn(),
  safe: vi.fn(async () => true),
}));

// Keep isBlockedHost real (isAllowedDomain relies on it; it only blocks IP
// literals in private ranges, so public hostnames pass without DNS). Override
// only the two DNS-resolving safety checks so tests do no network.
vi.mock('@/lib/url-safety', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, isSafeExternalUrl: mocks.safe, isSafeLocalOrExternalUrl: mocks.safe };
});

vi.mock('@/lib/plugin-proxy', async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, followRedirectsWithValidation: mocks.followRedirects };
});

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-proxy-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
  mocks.followRedirects.mockReset();
  mocks.followRedirects.mockResolvedValue({
    ok: true,
    response: new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  mocks.safe.mockClear();
});

afterEach(async () => {
  process.cwd = origCwd;
  vi.unstubAllGlobals();
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const GARMIN_AUTH = { type: 'garmin' };
const OAUTH_HEADER_AUTH = {
  type: 'oauth2',
  flow: 'authorization_code',
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  scopes: ['read'],
  tokenPlacement: 'header',
  tokenTargetDomains: ['api.example.com'],
  secrets: { clientId: 'client_id' },
};

async function seedPlugin(id: string, opts: {
  auth?: unknown;
  allowedDomains: string[];
  permissions?: string[];
}) {
  const dir = path.join(tmpDir, 'data', 'plugins', id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    id, name: id, version: '1.0.0', moduleType: 'w', category: 'c',
    allowedDomains: opts.allowedDomains,
    ...(opts.permissions ? { permissions: opts.permissions } : {}),
    ...(opts.auth ? { auth: opts.auth } : {}),
  }));
  await fs.writeFile(path.join(tmpDir, 'data', 'plugins', 'installed.json'), JSON.stringify({
    schemaVersion: 1,
    plugins: [{ id, version: '1.0.0', installedAt: 'x', enabled: true, moduleType: 'w' }],
  }));
}

const ctx = (id: string) => ({ params: Promise.resolve({ pluginId: id }) });
function proxyReq(id: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/plugins/proxy/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Headers the proxy passed to the (mocked) upstream on call `n`. */
function upstreamCall(n = 0): { url: string; headers: Record<string, string> } {
  const arg = mocks.followRedirects.mock.calls[n][0];
  return { url: arg.url, headers: arg.headers };
}

describe('plugin proxy — auth token injection', () => {
  it('attaches a Garmin bearer only on garmin.com hosts', async () => {
    await seedPlugin('g', { auth: GARMIN_AUTH, allowedDomains: ['connectapi.garmin.com'] });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('g', { access_token: 'GTOK', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    const { POST } = await import('../route');
    await POST(proxyReq('g', { url: 'https://connectapi.garmin.com/x' }), ctx('g'));
    expect(upstreamCall().headers.Authorization).toBe('Bearer GTOK');
  });

  it('does NOT attach the token to a non-target allowed domain', async () => {
    // The bearer must never leak to an allowed-but-untargeted host (e.g. a CDN).
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com', 'cdn.example.com'] });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('o', { access_token: 'OTOK', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    const { POST } = await import('../route');
    await POST(proxyReq('o', { url: 'https://cdn.example.com/logo.png' }), ctx('o'));
    expect(upstreamCall().headers.Authorization).toBeUndefined();
  });

  it('places the token in the query string for query placement', async () => {
    await seedPlugin('q', {
      auth: { ...OAUTH_HEADER_AUTH, tokenPlacement: 'query', tokenParamName: 'access_token' },
      allowedDomains: ['api.example.com'],
    });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('q', { access_token: 'QTOK', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    const { POST } = await import('../route');
    await POST(proxyReq('q', { url: 'https://api.example.com/data' }), ctx('q'));
    expect(upstreamCall().url).toContain('access_token=QTOK');
    expect(upstreamCall().headers.Authorization).toBeUndefined();
  });

  it('honors skipAuth (no token attached even on a target domain)', async () => {
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com'] });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('o', { access_token: 'OTOK', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    const { POST } = await import('../route');
    await POST(proxyReq('o', { url: 'https://api.example.com/public', skipAuth: true }), ctx('o'));
    expect(upstreamCall().headers.Authorization).toBeUndefined();
  });

  it('proceeds unauthenticated when the plugin was never connected', async () => {
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com'] });
    const { POST } = await import('../route');
    const res = await POST(proxyReq('o', { url: 'https://api.example.com/data' }), ctx('o'));
    // Never connected → no token, but the request still goes through (public endpoint).
    expect(res.status).toBe(200);
    expect(mocks.followRedirects).toHaveBeenCalledTimes(1);
    expect(upstreamCall().headers.Authorization).toBeUndefined();
  });

  it('returns 401 auth_expired when connected but the refresh fails', async () => {
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com'] });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    // Expired token, no refresh_token → refresh path fails.
    await savePluginTokens('o', { access_token: 'stale', token_type: 'Bearer', expiry_date: Date.now() - 1000 });

    const { POST } = await import('../route');
    const res = await POST(proxyReq('o', { url: 'https://api.example.com/data' }), ctx('o'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'auth_expired' });
    // The upstream is never contacted when we already know auth is broken.
    expect(mocks.followRedirects).not.toHaveBeenCalled();
  });

  it('force-refreshes once and retries on a single upstream 401', async () => {
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com'] });
    await fs.mkdir(path.join(tmpDir, 'data', 'plugin-secrets'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'plugin-secrets', 'o.json'), JSON.stringify({ client_id: 'cid' }));
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('o', { access_token: 'first', refresh_token: 'r', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    // Upstream 401s the first time, 200s the second.
    mocks.followRedirects
      .mockResolvedValueOnce({ ok: true, response: new Response('no', { status: 401 }) })
      .mockResolvedValueOnce({ ok: true, response: new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }) });
    // The forced refresh mints a new access token.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'second', expires_in: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ));

    const { POST } = await import('../route');
    const res = await POST(proxyReq('o', { url: 'https://api.example.com/data' }), ctx('o'));
    expect(res.status).toBe(200);
    expect(mocks.followRedirects).toHaveBeenCalledTimes(2);
    expect(upstreamCall(0).headers.Authorization).toBe('Bearer first');
    expect(upstreamCall(1).headers.Authorization).toBe('Bearer second'); // refreshed
  });

  it('serves the cache without re-attaching a token, keyed on the pre-auth request', async () => {
    await seedPlugin('o', { auth: OAUTH_HEADER_AUTH, allowedDomains: ['api.example.com'] });
    const { savePluginTokens } = await import('@/lib/plugin-auth');
    await savePluginTokens('o', { access_token: 'v1', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });

    const { POST } = await import('../route');
    const body = { url: 'https://api.example.com/data', cacheTtlMs: 60_000 };
    await POST(proxyReq('o', body), ctx('o'));
    // Rotate the stored token; a cache hit must NOT depend on it (same resource).
    await savePluginTokens('o', { access_token: 'v2', token_type: 'Bearer', expiry_date: Date.now() + 3600_000 });
    await POST(proxyReq('o', body), ctx('o'));
    // Second call served from cache: no second upstream request.
    expect(mocks.followRedirects).toHaveBeenCalledTimes(1);
  });

  it('injects no token for a plugin that declares no auth adapter', async () => {
    await seedPlugin('n', { allowedDomains: ['api.example.com'] });
    const { POST } = await import('../route');
    await POST(proxyReq('n', { url: 'https://api.example.com/data' }), ctx('n'));
    expect(upstreamCall().headers.Authorization).toBeUndefined();
  });
});
