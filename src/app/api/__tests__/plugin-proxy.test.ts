import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---

vi.mock('@/lib/plugins', () => ({
  getInstalledPlugins: vi.fn(),
}));

vi.mock('@/lib/plugin-utils', () => ({
  sanitizePluginId: vi.fn((id: string) => {
    const safe = id.replace(/[^a-z0-9_-]/gi, '');
    if (!safe) throw new Error('Invalid plugin ID');
    return safe;
  }),
  getPluginManifest: vi.fn(),
}));

vi.mock('@/lib/plugin-secrets', () => ({
  getPluginSecret: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// Mock SSRF safety so tests don't hit the network. The real url-safety
// module performs DNS resolution to defend against DNS rebinding; here we
// stub it to permit any allowed-domain URL the tests construct. Individual
// tests can still override `isSafeExternalUrl` to verify rejection paths.
vi.mock('@/lib/url-safety', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/url-safety')>();
  return {
    ...actual,
    isSafeExternalUrl: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ error: msg }, { status });
    }),
    fetchWithTimeout: vi.fn((...args: unknown[]) =>
      (globalThis.fetch as (...a: unknown[]) => unknown)(...args),
    ),
  };
});

import { getInstalledPlugins } from '@/lib/plugins';
import { getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSecret } from '@/lib/plugin-secrets';
import type { PluginManifest as PluginManifestType } from '@/types/plugins';
import type { InstalledPluginsFile } from '@/types/plugins';

const { POST } = await import('@/app/api/plugins/proxy/[pluginId]/route');

// --- Helpers ---

// Counter to generate unique URLs and avoid cross-test cache collisions.
// The route caches successful GET responses in a module-level Map that
// persists across tests, so every test must use a distinct upstream URL.
let urlCounter = 0;

function uniqueUrl(domain = 'api.example.com'): string {
  return `https://${domain}/test-${++urlCounter}`;
}

function makeManifest(overrides: Partial<PluginManifestType> = {}): PluginManifestType {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test',
    license: 'MIT',
    minAppVersion: '1.0.0',
    moduleType: 'test-widget',
    category: 'general',
    icon: 'plug',
    defaultConfig: {},
    defaultSize: { w: 4, h: 4 },
    exports: { component: 'default' },
    allowedDomains: ['api.example.com'],
    ...overrides,
  };
}

function makeInstalled(plugins: { id: string; enabled: boolean }[] = [{ id: 'test-plugin', enabled: true }]): InstalledPluginsFile {
  return {
    schemaVersion: 1,
    plugins: plugins.map((p) => ({
      id: p.id,
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      enabled: p.enabled,
      moduleType: 'test-widget',
    })),
  };
}

function makeProxyRequest(
  pluginId: string,
  body: Record<string, unknown>,
): [NextRequest, { params: Promise<{ pluginId: string }> }] {
  const request = new NextRequest('http://localhost/api/plugins/proxy/' + pluginId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return [request, { params: Promise.resolve({ pluginId }) }];
}

function mockUpstreamFetch(body: string, opts: {
  status?: number;
  contentType?: string;
  contentLength?: string;
  ok?: boolean;
} = {}) {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const contentType = opts.contentType ?? 'application/json';
  const buffer = new TextEncoder().encode(body).buffer;
  const headers = new Headers({ 'Content-Type': contentType });
  if (opts.contentLength !== undefined) {
    headers.set('Content-Length', opts.contentLength);
  }
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    headers,
    arrayBuffer: async () => buffer,
  });
}

function setupPlugin(manifestOverrides: Partial<PluginManifestType> = {}, installed = makeInstalled()) {
  vi.mocked(getInstalledPlugins).mockResolvedValue(installed);
  vi.mocked(getPluginManifest).mockResolvedValue(makeManifest(manifestOverrides));
}

// --- Setup ---

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plugin lookup
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — plugin lookup', () => {
  it('returns 404 when plugin is not installed', async () => {
    vi.mocked(getInstalledPlugins).mockResolvedValue(makeInstalled([]));

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/not installed or not enabled/);
  });

  it('returns 404 when plugin is disabled', async () => {
    vi.mocked(getInstalledPlugins).mockResolvedValue(
      makeInstalled([{ id: 'test-plugin', enabled: false }]),
    );

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/not installed or not enabled/);
  });

  it('returns 404 when manifest is not found', async () => {
    vi.mocked(getInstalledPlugins).mockResolvedValue(makeInstalled());
    vi.mocked(getPluginManifest).mockResolvedValue(null);

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/manifest not found/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Domain validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — domain validation', () => {
  it('allows requests to an explicitly listed domain', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });

  it('rejects requests to a domain not in allowedDomains', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl('evil.com') });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/not in plugin allowedDomains/);
  });

  it('rejects requests when allowedDomains is empty', async () => {
    setupPlugin({ allowedDomains: [] });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/no allowedDomains declared/);
  });

  it('rejects requests when allowedDomains is undefined', async () => {
    setupPlugin({ allowedDomains: undefined });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/no allowedDomains declared/);
  });

  it('wildcard domain *.example.com matches sub.example.com', async () => {
    setupPlugin({ allowedDomains: ['*.example.com'] });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl('sub.example.com') });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });

  it('wildcard domain *.example.com matches the bare domain example.com', async () => {
    setupPlugin({ allowedDomains: ['*.example.com'] });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl('example.com') });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });

  it('wildcard domain *.example.com matches deeply nested subdomains', async () => {
    setupPlugin({ allowedDomains: ['*.example.com'] });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl('a.b.c.example.com') });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });

  it('wildcard domain *.example.com does not match notexample.com', async () => {
    setupPlugin({ allowedDomains: ['*.example.com'] });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl('notexample.com') });
    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });

  it('supports multiple allowed domains', async () => {
    setupPlugin({ allowedDomains: ['api.one.com', 'api.two.com'] });
    mockUpstreamFetch('{"ok":true}');

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url: uniqueUrl('api.one.com') });
    expect((await POST(req1, ctx1)).status).toBe(200);

    const [req2, ctx2] = makeProxyRequest('test-plugin', { url: uniqueUrl('api.two.com') });
    expect((await POST(req2, ctx2)).status).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rate limiting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — rate limiting', () => {
  it('allows requests within the rate limit', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    // Use a unique plugin ID so we get a fresh rate limit bucket
    const pluginId = 'rate-limit-test';
    const installed = makeInstalled([{ id: pluginId, enabled: true }]);
    vi.mocked(getInstalledPlugins).mockResolvedValue(installed);
    vi.mocked(getPluginManifest).mockResolvedValue(makeManifest({ id: pluginId }));
    mockUpstreamFetch('{"ok":true}');

    // Make 60 requests (the limit) — use unique URLs to avoid cache
    for (let i = 0; i < 60; i++) {
      const [req, ctx] = makeProxyRequest(pluginId, { url: uniqueUrl() });
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
    }

    // 61st request should be rate limited
    const [req, ctx] = makeProxyRequest(pluginId, { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toMatch(/Rate limit exceeded/);
  });

  it('resets rate limit after the window expires', async () => {
    vi.useFakeTimers();
    const pluginId = 'rate-reset-test';
    const installed = makeInstalled([{ id: pluginId, enabled: true }]);
    vi.mocked(getInstalledPlugins).mockResolvedValue(installed);
    vi.mocked(getPluginManifest).mockResolvedValue(makeManifest({ id: pluginId }));
    mockUpstreamFetch('{"ok":true}');

    // Exhaust the rate limit
    for (let i = 0; i < 60; i++) {
      const [req, ctx] = makeProxyRequest(pluginId, { url: uniqueUrl() });
      await POST(req, ctx);
    }

    // Verify it's blocked
    const [blockedReq, blockedCtx] = makeProxyRequest(pluginId, { url: uniqueUrl() });
    expect((await POST(blockedReq, blockedCtx)).status).toBe(429);

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000);

    // Should succeed again
    const [req, ctx] = makeProxyRequest(pluginId, { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Secret injection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — secret injection', () => {
  it('replaces secret placeholders in headers', async () => {
    setupPlugin();
    vi.mocked(getPluginSecret).mockResolvedValue('my-secret-key-123');
    mockUpstreamFetch('{"ok":true}');
    const url = uniqueUrl();

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url,
      secretInjections: {
        header: { Authorization: 'Bearer {{api_key}}' },
      },
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    // Verify the upstream fetch was called with the resolved header
    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-secret-key-123',
        }),
      }),
    );
  });

  it('replaces secret placeholders in query params', async () => {
    setupPlugin();
    vi.mocked(getPluginSecret).mockResolvedValue('key-456');
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      secretInjections: {
        query: { apiKey: '{{api_key}}' },
      },
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    // Verify the upstream URL has the resolved query param
    const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const parsed = new URL(calledUrl);
    expect(parsed.searchParams.get('apiKey')).toBe('key-456');
  });

  it('replaces multiple secret placeholders in a single header value', async () => {
    setupPlugin();
    vi.mocked(getPluginSecret).mockImplementation(async (_pluginId: string, key: string) => {
      if (key === 'client_id') return 'id-abc';
      if (key === 'client_secret') return 'secret-xyz';
      return null;
    });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      secretInjections: {
        header: { Authorization: 'Basic {{client_id}}:{{client_secret}}' },
      },
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Basic id-abc:secret-xyz',
        }),
      }),
    );
  });

  it('returns error when a required secret is not configured', async () => {
    setupPlugin();
    vi.mocked(getPluginSecret).mockResolvedValue(null);

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      secretInjections: {
        header: { Authorization: 'Bearer {{api_key}}' },
      },
    });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Plugin proxy request failed/);
  });

  it('returns error when a required secret is empty string', async () => {
    setupPlugin();
    vi.mocked(getPluginSecret).mockResolvedValue('');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      secretInjections: {
        header: { Authorization: 'Bearer {{api_key}}' },
      },
    });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Plugin proxy request failed/);
  });

  it('passes headers through without modification when no secret injections', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      headers: { 'X-Custom': 'plain-value' },
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': 'plain-value' }),
      }),
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// URL and method validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — URL and method validation', () => {
  it('returns 400 when url is missing from body', async () => {
    setupPlugin();

    const [req, ctx] = makeProxyRequest('test-plugin', {});
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/url is required/);
  });

  it('returns 400 when url is not a string', async () => {
    setupPlugin();

    const [req, ctx] = makeProxyRequest('test-plugin', { url: 12345 });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/url is required/);
  });

  it('returns 400 for disallowed HTTP method DELETE', async () => {
    setupPlugin();

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'DELETE',
    });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/not allowed/);
  });

  it('returns 400 for disallowed HTTP method HEAD', async () => {
    setupPlugin();

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'HEAD',
    });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/not allowed/);
  });

  it('defaults to GET when no method specified', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('accepts POST method and sends payload', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'POST',
      payload: '{"key":"value"}',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: '{"key":"value"}',
      }),
    );
  });

  it('accepts PUT and PATCH methods', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    for (const method of ['PUT', 'PATCH']) {
      const [req, ctx] = makeProxyRequest('test-plugin', {
        url: uniqueUrl(),
        method,
        payload: 'body',
      });
      const res = await POST(req, ctx);
      expect(res.status).toBe(200);
    }
  });

  it('method is case-insensitive', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'get',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not send body for GET requests even if payload is provided', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'GET',
      payload: 'should-be-ignored',
    });
    await POST(req, ctx);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: undefined }),
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Response handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — response handling', () => {
  it('preserves Content-Type from upstream response', async () => {
    setupPlugin();
    mockUpstreamFetch('<xml>data</xml>', { contentType: 'application/xml' });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
  });

  it('defaults Content-Type to application/octet-stream when upstream has none', async () => {
    setupPlugin();
    const buffer = new TextEncoder().encode('binary data').buffer;
    const headers = new Headers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: async () => buffer,
    });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('passes through upstream error status codes', async () => {
    setupPlugin();
    mockUpstreamFetch('{"error":"not found"}', { status: 404, ok: false });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(404);
  });

  it('passes through 500 upstream errors', async () => {
    setupPlugin();
    mockUpstreamFetch('Internal Server Error', { status: 500, ok: false, contentType: 'text/plain' });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(500);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Response size limit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — response size limit', () => {
  it('rejects responses with Content-Length exceeding 5MB', async () => {
    setupPlugin();
    mockUpstreamFetch('small body', { contentLength: String(6 * 1024 * 1024) });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/too large/);
  });

  it('rejects responses whose actual body exceeds 5MB', async () => {
    setupPlugin();
    // Create a buffer larger than 5MB
    const largeBuffer = new ArrayBuffer(6 * 1024 * 1024);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
      arrayBuffer: async () => largeBuffer,
    });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/too large/);
  });

  it('allows responses at exactly 5MB', async () => {
    setupPlugin();
    const exactBuffer = new ArrayBuffer(5 * 1024 * 1024);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(5 * 1024 * 1024),
      }),
      arrayBuffer: async () => exactBuffer,
    });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Caching
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — caching', () => {
  it('caches GET responses and serves from cache on second request', async () => {
    setupPlugin();
    const responseBody = '{"data":"cached-value"}';
    mockUpstreamFetch(responseBody);
    const url = uniqueUrl();

    // First request
    const [req1, ctx1] = makeProxyRequest('test-plugin', {
      url,
      method: 'GET',
      cacheTtlMs: 60_000,
    });
    const res1 = await POST(req1, ctx1);
    expect(res1.status).toBe(200);

    // Capture fetch call count after first request
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const callCount = fetchMock.mock.calls.length;

    // Second request with same URL should come from cache
    const [req2, ctx2] = makeProxyRequest('test-plugin', {
      url,
      method: 'GET',
      cacheTtlMs: 60_000,
    });
    const res2 = await POST(req2, ctx2);

    expect(res2.status).toBe(200);
    const body = await res2.text();
    expect(body).toBe(responseBody);
    // Upstream fetch should not have been called again
    expect(fetchMock.mock.calls.length).toBe(callCount);
  });

  it('does not cache POST responses', async () => {
    setupPlugin();
    mockUpstreamFetch('{"data":"response"}');
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', {
      url,
      method: 'POST',
      payload: '{"key":"val"}',
    });
    await POST(req1, ctx1);

    const [req2, ctx2] = makeProxyRequest('test-plugin', {
      url,
      method: 'POST',
      payload: '{"key":"val"}',
    });
    await POST(req2, ctx2);

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it('does not cache PUT responses', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'PUT', payload: 'body' });
    await POST(req1, ctx1);

    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'PUT', payload: 'body' });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('does not cache PATCH responses', async () => {
    setupPlugin();
    mockUpstreamFetch('{"ok":true}');
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'PATCH', payload: 'body' });
    await POST(req1, ctx1);

    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'PATCH', payload: 'body' });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('cache expires after TTL', async () => {
    vi.useFakeTimers();
    setupPlugin();
    mockUpstreamFetch('{"data":"v1"}');
    const url = uniqueUrl();

    // First request with 10s TTL
    const [req1, ctx1] = makeProxyRequest('test-plugin', {
      url,
      method: 'GET',
      cacheTtlMs: 10_000,
    });
    await POST(req1, ctx1);
    const callsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance past TTL
    vi.advanceTimersByTime(11_000);

    // Should fetch again because cache expired
    const [req2, ctx2] = makeProxyRequest('test-plugin', {
      url,
      method: 'GET',
      cacheTtlMs: 10_000,
    });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('does not cache non-text/json content types', async () => {
    setupPlugin();
    const binaryBuffer = new ArrayBuffer(8);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'image/png' }),
      arrayBuffer: async () => binaryBuffer,
    });
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 60_000 });
    await POST(req1, ctx1);

    // Second request should still fetch (not cached because content type is image/png)
    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 60_000 });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('does not cache when cacheTtlMs is 0', async () => {
    setupPlugin();
    mockUpstreamFetch('{"data":"no-cache"}');
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 0 });
    await POST(req1, ctx1);

    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 0 });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('clamps cacheTtlMs to maximum of 1 hour', async () => {
    vi.useFakeTimers();
    setupPlugin();
    mockUpstreamFetch('{"data":"long-cache"}');
    const url = uniqueUrl();

    // Request with an absurdly long TTL (should be clamped to 1 hour)
    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 999_999_999 });
    await POST(req1, ctx1);
    const callsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance just past 1 hour (the clamped max)
    vi.advanceTimersByTime(3600_001);

    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 999_999_999 });
    await POST(req2, ctx2);

    // Should have fetched again because cache expired at 1 hour
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('does not cache unsuccessful GET responses', async () => {
    setupPlugin();
    mockUpstreamFetch('{"error":"bad"}', { status: 500, ok: false });
    const url = uniqueUrl();

    const [req1, ctx1] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 60_000 });
    await POST(req1, ctx1);

    // Second request should fetch again (error responses not cached)
    const [req2, ctx2] = makeProxyRequest('test-plugin', { url, method: 'GET', cacheTtlMs: 60_000 });
    await POST(req2, ctx2);

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Error handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — error handling', () => {
  it('returns 500 via errorResponse when upstream fetch throws a network error', async () => {
    setupPlugin();
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/Plugin proxy request failed/);
  });

  it('returns 403 for invalid URL (not parseable)', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });

    const [req, ctx] = makeProxyRequest('test-plugin', { url: 'not-a-valid-url' });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/not in plugin allowedDomains/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Security — SSRF prevention
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — SSRF prevention via domain allowlist', () => {
  it('blocks internal hosts even if explicitly listed in allowedDomains', async () => {
    // isBlockedHost is checked unconditionally — no manifest can whitelist internal hosts.
    setupPlugin({ allowedDomains: ['localhost'] });
    mockUpstreamFetch('{"ok":true}');

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: 'http://localhost:3000/api/secrets',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });

  it('blocks requests to domains not in the allowlist (SSRF via DNS rebinding)', async () => {
    // Even if an attacker could make a domain resolve to 127.0.0.1,
    // the domain still must be in the allowedDomains list.
    setupPlugin({ allowedDomains: ['api.example.com'] });

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: 'http://internal-server.local/admin',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });

  it('blocks attempts to access internal services via non-listed domains', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });

    const testUrls = [
      'http://127.0.0.1/admin',
      'http://192.168.1.1/config',
      'http://10.0.0.1/internal',
      'http://[::1]/secret',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/',
    ];

    for (const url of testUrls) {
      const [req, ctx] = makeProxyRequest('test-plugin', { url });
      const res = await POST(req, ctx);
      expect(res.status).toBe(403);
    }
  });

  it('blocks file:// protocol URLs', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: 'file:///etc/passwd',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(403);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Security — redirect SSRF (every hop must re-validate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Build a fake fetch that returns scripted responses in order. Each entry
 *  is either a redirect (status + Location) or a body response. */
function mockUpstreamSequence(
  responses: Array<
    | { redirect: string; status?: number }
    | { body: string; status?: number; contentType?: string }
  >,
) {
  let callIdx = 0;
  global.fetch = vi.fn().mockImplementation(async () => {
    const r = responses[Math.min(callIdx++, responses.length - 1)];
    if ('redirect' in r) {
      const headers = new Headers({ Location: r.redirect });
      return {
        ok: false,
        status: r.status ?? 302,
        headers,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    const buffer = new TextEncoder().encode(r.body).buffer;
    const headers = new Headers({ 'Content-Type': r.contentType ?? 'application/json' });
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      arrayBuffer: async () => buffer,
    };
  });
}

describe('POST /api/plugins/proxy/[pluginId] — redirect SSRF re-validation', () => {
  it('follows a redirect within the same allowed domain and returns the final body', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    const initial = uniqueUrl();
    const target = uniqueUrl();
    mockUpstreamSequence([
      { redirect: target, status: 302 },
      { body: '{"final":true}' },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', { url: initial });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('final');
  });

  it('rejects a redirect that escapes the allowedDomains list', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    mockUpstreamSequence([
      // Allowed domain redirects to an external host that the manifest doesn't permit
      { redirect: 'https://attacker.com/exfil', status: 302 },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/Redirect target not in plugin allowedDomains/);
  });

  it('rejects a redirect to a literal private IP', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    mockUpstreamSequence([
      { redirect: 'http://169.254.169.254/latest/meta-data/', status: 302 },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    // The redirect target's hostname is a literal private IP, so the
    // allowedDomains check (which blocks isBlockedHost unconditionally)
    // rejects it before we even reach isSafeExternalUrl.
    expect(res.status).toBe(403);
  });

  it('rejects a redirect when isSafeExternalUrl returns false (DNS-rebound private IP)', async () => {
    // The mock at the top of the file always returns true; override per-test.
    const { isSafeExternalUrl } = await import('@/lib/url-safety');
    vi.mocked(isSafeExternalUrl).mockResolvedValueOnce(true);  // initial URL passes
    vi.mocked(isSafeExternalUrl).mockResolvedValueOnce(false); // redirect target fails

    setupPlugin({ allowedDomains: ['*.example.com'] });
    mockUpstreamSequence([
      // Both hosts pass the allowedDomains glob, but the redirect target
      // resolves to a private address according to the (mocked) DNS check.
      { redirect: 'https://internal.example.com/secret', status: 302 },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toMatch(/private or unreachable address/);
  });

  it('rejects a redirect chain longer than the hop cap', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    // 6 redirects in a row — the cap is 5. Use uniqueUrl to avoid GET cache.
    const targets = Array.from({ length: 6 }, () => uniqueUrl());
    mockUpstreamSequence(
      targets.map((t) => ({ redirect: t, status: 302 })),
    );

    const [req, ctx] = makeProxyRequest('test-plugin', { url: uniqueUrl() });
    const res = await POST(req, ctx);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/Too many redirects/);
  });

  it('downgrades POST to GET on a 303 redirect (per fetch spec)', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    mockUpstreamSequence([
      { redirect: uniqueUrl(), status: 303 },
      { body: '{"ok":true}' },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'POST',
      payload: '{"data":"value"}',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    // Verify second fetch was called as GET with no body
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const secondCall = calls[1][1] as RequestInit;
    expect(secondCall.method).toBe('GET');
    expect(secondCall.body).toBeUndefined();
  });

  it('preserves POST and body on a 307 redirect', async () => {
    setupPlugin({ allowedDomains: ['api.example.com'] });
    mockUpstreamSequence([
      { redirect: uniqueUrl(), status: 307 },
      { body: '{"ok":true}' },
    ]);

    const [req, ctx] = makeProxyRequest('test-plugin', {
      url: uniqueUrl(),
      method: 'POST',
      payload: '{"data":"value"}',
    });
    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const secondCall = calls[1][1] as RequestInit;
    expect(secondCall.method).toBe('POST');
    expect(secondCall.body).toBe('{"data":"value"}');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plugin ID sanitization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('POST /api/plugins/proxy/[pluginId] — plugin ID sanitization', () => {
  it('rejects plugin IDs that sanitize to empty string', async () => {
    // sanitizePluginId throws for IDs that become empty after stripping unsafe chars.
    // withDisplayAuth catches the error and returns an error response.
    const [req, ctx] = makeProxyRequest('...', { url: uniqueUrl() });

    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Plugin proxy request failed');
  });

  it('rejects directory traversal attempts in plugin ID', async () => {
    // sanitizePluginId strips slashes and dots, so "../../../etc/passwd"
    // becomes "etcpasswd" which won't match any installed plugin.
    vi.mocked(getInstalledPlugins).mockResolvedValue(makeInstalled([]));

    const [req, ctx] = makeProxyRequest('../../../etc/passwd', { url: uniqueUrl() });
    const res = await POST(req, ctx);

    // "etcpasswd" doesn't match any installed plugin => 404
    expect(res.status).toBe(404);
  });
});
