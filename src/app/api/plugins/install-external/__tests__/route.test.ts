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

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

import { NextRequest } from 'next/server';
import { POST } from '../route';
import { fetchWithTimeout } from '@/lib/api-utils';
import { installExternalPlugin } from '@/lib/plugins';

const mockFetch = fetchWithTimeout as unknown as ReturnType<typeof vi.fn>;
const mockInstall = installExternalPlugin as unknown as ReturnType<typeof vi.fn>;

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
});
