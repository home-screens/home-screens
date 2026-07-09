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
import { GET } from '@/app/api/immich/photos/route';

const mockImmichFetch = vi.mocked(immichFetch);

function photosReq(query = '') {
  return new NextRequest(`http://localhost/api/immich/photos${query}`);
}

function assetsResponse(ids: string[]) {
  return new Response(
    JSON.stringify(ids.map((id) => ({ id, type: 'IMAGE', originalFileName: `${id}.jpg` }))),
    { status: 200 },
  );
}

/** Extract the JSON body sent to Immich's /api/search/random. */
function lastSearchBody() {
  const call = mockImmichFetch.mock.calls[0];
  const init = call[1] as { body?: string };
  return JSON.parse(init.body ?? '{}');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/immich/photos', () => {
  it('maps assets to serve URLs', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1', 'x2']));

    const res = await GET(photosReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      '/api/immich/serve?assetId=x1&size=preview',
      '/api/immich/serve?assetId=x2&size=preview',
    ]);
    expect(mockImmichFetch).toHaveBeenCalledWith(
      '/api/search/random',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('builds the search body from album, person, and favorites filters', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));

    await GET(photosReq('?albumId=alb1&personId=per1&favorites=true&count=5'));

    expect(lastSearchBody()).toEqual({
      type: 'IMAGE',
      size: 5,
      albumIds: ['alb1'],
      personIds: ['per1'],
      isFavorite: true,
    });
  });

  it('clamps count to the 1..200 range', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));

    await GET(photosReq('?count=9999'));
    expect(lastSearchBody().size).toBe(200);

    mockImmichFetch.mockClear();
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));
    await GET(photosReq('?count=0'));
    expect(lastSearchBody().size).toBe(50); // 0 is falsy -> default 50
  });

  it('omits filters that are not provided', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));

    await GET(photosReq());

    const body = lastSearchBody();
    expect(body).not.toHaveProperty('albumIds');
    expect(body).not.toHaveProperty('personIds');
    expect(body).not.toHaveProperty('isFavorite');
  });

  it('returns 502 when the search responds non-ok', async () => {
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));

    const res = await GET(photosReq());
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to search photos' });
  });
});
