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

// Disable the module-level TTL cache so each test starts fresh (the cache key
// is a constant, so a real cache would let the first test's data leak forward).
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    createTTLCache: () => ({ get: () => null, set: () => {}, clear: () => {} }),
  };
});

import { immichFetch } from '@/lib/immich';
import { GET } from '@/app/api/immich/albums/route';

const mockImmichFetch = vi.mocked(immichFetch);
const req = new NextRequest('http://localhost/api/immich/albums');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/immich/albums', () => {
  it('normalizes the Immich album shape to { id, name, assetCount }', async () => {
    mockImmichFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'a1', albumName: 'Family', assetCount: 42, albumThumbnailAssetId: 't1' },
          { id: 'a2', albumName: 'Trips', assetCount: 7, albumThumbnailAssetId: null },
        ]),
        { status: 200 },
      ),
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      { id: 'a1', name: 'Family', assetCount: 42 },
      { id: 'a2', name: 'Trips', assetCount: 7 },
    ]);
    expect(mockImmichFetch).toHaveBeenCalledWith('/api/albums');
  });

  it('returns 502 when Immich responds non-ok', async () => {
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch albums from Immich' });
  });

  it('surfaces a generic error and never puts the configured API key in the body', async () => {
    // The x-api-key value is injected inside immichFetch (mocked here); the route
    // never holds it, so a realistic failure returns only the generic message plus
    // errorResponse's `detail` (the non-secret thrown message). This pins that the
    // key value cannot reach the client body and would fail if the route ever
    // echoed the upstream config.
    mockImmichFetch.mockRejectedValue(new Error('Immich not configured'));

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to list Immich albums');
    expect(json.detail).toBe('Immich not configured');
    expect(JSON.stringify(json)).not.toMatch(/secret-key|SUPERSECRET/);
  });
});
