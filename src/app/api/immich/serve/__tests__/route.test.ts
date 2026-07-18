import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/immich', () => ({
  immichFetch: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    createTTLCache: () => ({ get: () => null, set: () => {}, clear: () => {} }),
  };
});

import { immichFetch } from '@/lib/immich';
import { GET } from '@/app/api/immich/serve/route';

const mockImmichFetch = vi.mocked(immichFetch);

function serveReq(query: string) {
  return new NextRequest(`http://localhost/api/immich/serve${query}`);
}

function upstreamImage(bytes: number[], contentType: string) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/immich/serve — validation', () => {
  it('returns 400 when assetId is missing', async () => {
    const res = await GET(serveReq(''));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'assetId required' });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('rejects an assetId with path-traversal characters without calling upstream', async () => {
    const res = await GET(serveReq('?assetId=..%2F..%2Fetc%2Fpasswd'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid assetId' });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('rejects an assetId containing a URL (SSRF attempt)', async () => {
    const res = await GET(serveReq('?assetId=http://evil.example.com'));

    expect(res.status).toBe(400);
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/immich/serve — proxying', () => {
  it('passes the upstream Content-Type through and returns the bytes', async () => {
    mockImmichFetch.mockResolvedValue(upstreamImage([1, 2, 3, 4], 'image/webp'));

    const res = await GET(serveReq('?assetId=a1b2c3d4-e5f6'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(buf)).toEqual([1, 2, 3, 4]);
  });

  it('routes an asset request to the assets thumbnail endpoint with the default preview size', async () => {
    mockImmichFetch.mockResolvedValue(upstreamImage([9], 'image/jpeg'));

    await GET(serveReq('?assetId=a1b2c3d4'));

    expect(mockImmichFetch).toHaveBeenCalledWith(
      '/api/assets/a1b2c3d4/thumbnail?size=preview',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('routes a person request to the people thumbnail endpoint', async () => {
    mockImmichFetch.mockResolvedValue(upstreamImage([9], 'image/jpeg'));

    await GET(serveReq('?assetId=a1b2c3d4&type=person'));

    expect(mockImmichFetch).toHaveBeenCalledWith(
      '/api/people/a1b2c3d4/thumbnail',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('falls back to safe defaults when size and type are invalid', async () => {
    mockImmichFetch.mockResolvedValue(upstreamImage([9], 'image/jpeg'));

    await GET(serveReq('?assetId=a1b2c3d4&size=huge&type=bogus'));

    // Invalid size -> preview, invalid type -> asset endpoint.
    expect(mockImmichFetch).toHaveBeenCalledWith(
      '/api/assets/a1b2c3d4/thumbnail?size=preview',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('honors a valid thumbnail size', async () => {
    mockImmichFetch.mockResolvedValue(upstreamImage([9], 'image/jpeg'));

    await GET(serveReq('?assetId=a1b2c3d4&size=thumbnail'));

    expect(mockImmichFetch).toHaveBeenCalledWith(
      '/api/assets/a1b2c3d4/thumbnail?size=thumbnail',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('defaults the Content-Type to image/jpeg when upstream omits it', async () => {
    mockImmichFetch.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));

    const res = await GET(serveReq('?assetId=a1b2c3d4'));

    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('returns 502 when Immich responds non-ok', async () => {
    mockImmichFetch.mockResolvedValue(new Response('', { status: 404 }));

    const res = await GET(serveReq('?assetId=a1b2c3d4'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch image from Immich' });
  });
});
