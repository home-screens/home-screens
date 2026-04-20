import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth so we don't need a real session
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return {
    ...actual,
    withAuth: (handler: unknown) => handler,
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock('@/lib/plugins', async () => {
  const actual = await vi.importActual<typeof import('@/lib/plugins')>('@/lib/plugins');
  return {
    ...actual,
    installExternalPlugin: vi.fn(async () => ({ pluginId: 'stub', version: '1.0.0' })),
  };
});

// Stub SSRF guard so tests don't depend on real DNS resolution. Default is
// "safe" (returns true); individual tests override for the blocked-address and
// redirect-rebinding paths.
vi.mock('@/lib/url-safety', async () => {
  const actual = await vi.importActual<typeof import('@/lib/url-safety')>('@/lib/url-safety');
  return {
    ...actual,
    isSafeExternalUrl: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { fetchWithTimeout } from '@/lib/api-utils';
import { installExternalPlugin } from '@/lib/plugins';
import { isSafeExternalUrl } from '@/lib/url-safety';

const mockFetch = fetchWithTimeout as unknown as ReturnType<typeof vi.fn>;
const mockInstall = installExternalPlugin as unknown as ReturnType<typeof vi.fn>;
const mockIsSafe = vi.mocked(isSafeExternalUrl);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/plugins/install-external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/plugins/install-external', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockInstall.mockReset();
    mockInstall.mockResolvedValue({ pluginId: 'stub', version: '1.0.0' });
    mockIsSafe.mockReset();
    mockIsSafe.mockResolvedValue(true);
  });

  it('rejects non-HTTPS URLs', async () => {
    const res = await POST(makeRequest({ tarballUrl: 'http://evil.com/p.tar.gz' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/HTTPS/);
  });

  it('accepts http://localhost', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await POST(makeRequest({ tarballUrl: 'http://localhost:5173/p.tar.gz' }));
    expect(res.status).toBe(200);
  });

  it('rejects templated URL with no version param', async () => {
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/v{version}/p.tar.gz' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/placeholder/);
  });

  it('substitutes {version} before downloading', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await POST(makeRequest({
      tarballUrl: 'https://x.io/v{version}/p.tar.gz',
      version: '2.0.0',
    }));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://x.io/v2.0.0/p.tar.gz',
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it('passes the original templated URL (not resolved) to installExternalPlugin', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await POST(makeRequest({
      tarballUrl: 'https://x.io/v{version}/p.tar.gz',
      version: '2.0.0',
    }));
    expect(mockInstall).toHaveBeenCalledWith(
      'https://x.io/v{version}/p.tar.gz',
      expect.any(Buffer),
    );
  });

  it('returns 502 on download failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(502);
  });

  it('returns 502 on non-2xx response', async () => {
    mockFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/404/);
  });

  it('returns 200 with sha256 on success', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      ok: true,
      pluginId: 'stub',
      version: '1.0.0',
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('passes redirect: "manual" and disables retries so every hop is re-validated', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://x.io/p.tar.gz',
      expect.objectContaining({ redirect: 'manual', retries: 0 }),
    );
  });
});

// Security — SSRF prevention (DNS-resolved IP check)
describe('POST /api/plugins/install-external — SSRF prevention', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockInstall.mockReset();
    mockInstall.mockResolvedValue({ pluginId: 'stub', version: '1.0.0' });
    mockIsSafe.mockReset();
    mockIsSafe.mockResolvedValue(true);
  });

  it('rejects https:// URL that resolves to a private/internal address', async () => {
    mockIsSafe.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ tarballUrl: 'https://dns-rebind.example/p.tar.gz' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/blocked address/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects https:// URL that points at an IP literal in a private range', async () => {
    mockIsSafe.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ tarballUrl: 'https://192.168.1.1/p.tar.gz' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects https:// URL that points at cloud metadata endpoint', async () => {
    mockIsSafe.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ tarballUrl: 'https://169.254.169.254/latest/meta-data/' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips the DNS check for http://localhost (dev escape hatch)', async () => {
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await POST(makeRequest({ tarballUrl: 'http://localhost:5173/p.tar.gz' }));
    expect(res.status).toBe(200);
    expect(mockIsSafe).not.toHaveBeenCalled();
  });
});

// Security — redirect SSRF re-validation
describe('POST /api/plugins/install-external — redirect re-validation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockInstall.mockReset();
    mockInstall.mockResolvedValue({ pluginId: 'stub', version: '1.0.0' });
    mockIsSafe.mockReset();
    mockIsSafe.mockResolvedValue(true);
  });

  it('follows a safe redirect and returns 200', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://cdn.example/p.tar.gz' } }),
    );
    mockFetch.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example/p.tar.gz',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('rejects a redirect to a DNS-rebound private address', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://rebound.example/internal' } }),
    );
    mockIsSafe.mockResolvedValueOnce(true);   // initial URL passes
    mockIsSafe.mockResolvedValueOnce(false);  // redirect target fails
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/redirect/i);
    // fetch was called once for the initial URL; we never fetched the redirect target
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it('rejects a redirect to a non-HTTPS non-localhost URL', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/p.tar.gz' } }),
    );
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/redirect/i);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a redirect chain that exceeds the hop limit', async () => {
    // Return 302 to itself indefinitely
    mockFetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://x.io/p.tar.gz' } }),
    );
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/too many redirects/i);
  });

  it('rejects a redirect with an invalid Location header', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://[not-a-url' } }),
    );
    const res = await POST(makeRequest({ tarballUrl: 'https://x.io/p.tar.gz' }));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/invalid redirect/i);
  });
});
