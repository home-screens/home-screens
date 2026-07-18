import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// `mediaSecret` lets media-list tests flip mt-token minting on (auth enabled).
const authState = vi.hoisted(() => ({ mediaSecret: null as string | null }));

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
  getMediaTokenSecret: vi.fn(async () => authState.mediaSecret),
}));

vi.mock('@/lib/immich', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/immich')>();
  return {
    ...actual,
    immichFetch: vi.fn(),
  };
});

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
  authState.mediaSecret = null;
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

describe('GET /api/immich/photos with media parameter', () => {
  function videoAssetsResponse(ids: string[], duration = '0:00:30.00000') {
    return new Response(
      JSON.stringify(ids.map((id) => ({ id, type: 'VIDEO', originalFileName: `${id}.mp4`, duration }))),
      { status: 200 },
    );
  }

  it('media=photos returns typed image entries', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));

    const res = await GET(photosReq('?media=photos'));
    const json = await res.json();

    expect(json).toEqual([{ url: '/api/immich/serve?assetId=x1&size=preview', type: 'image' }]);
    expect(lastSearchBody().type).toBe('IMAGE');
  });

  it('media=videos maps to a VIDEO search with playback URLs, posters, and durations', async () => {
    mockImmichFetch.mockResolvedValue(videoAssetsResponse(['v1']));

    const res = await GET(photosReq('?media=videos'));
    const json = await res.json();

    expect(lastSearchBody().type).toBe('VIDEO');
    expect(json).toEqual([{
      url: '/api/immich/video?assetId=v1',
      type: 'video',
      posterUrl: '/api/immich/serve?assetId=v1&size=preview',
      durationMs: 30_000,
    }]);
  });

  it('media=both runs one search per type and merges the results', async () => {
    mockImmichFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      return body.type === 'VIDEO' ? videoAssetsResponse(['v1']) : assetsResponse(['x1', 'x2']);
    });

    const res = await GET(photosReq('?media=both&count=10'));
    const json: Array<{ type: string }> = await res.json();

    expect(mockImmichFetch).toHaveBeenCalledTimes(2);
    expect(json).toHaveLength(3);
    expect(json.filter((i) => i.type === 'image')).toHaveLength(2);
    expect(json.filter((i) => i.type === 'video')).toHaveLength(1);
  });

  it('media=both trims the merged list to count', async () => {
    mockImmichFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const ids = Array.from({ length: 2 }, (_, i) => `${body.type}-${i}`);
      return body.type === 'VIDEO' ? videoAssetsResponse(ids) : assetsResponse(ids);
    });

    const res = await GET(photosReq('?media=both&count=3'));
    const json: unknown[] = await res.json();
    expect(json).toHaveLength(3);
  });

  it('appends mt tokens to video URLs when auth is enabled', async () => {
    authState.mediaSecret = 's'.repeat(64);
    mockImmichFetch.mockResolvedValue(videoAssetsResponse(['v1']));

    const res = await GET(photosReq('?media=videos'));
    const json: Array<{ url: string }> = await res.json();
    expect(json[0].url).toContain('/api/immich/video?assetId=v1&mt=');
  });

  it('omits durationMs when Immich reports a zero duration', async () => {
    mockImmichFetch.mockResolvedValue(videoAssetsResponse(['v1'], '0:00:00.00000'));

    const res = await GET(photosReq('?media=videos'));
    const json: Array<Record<string, unknown>> = await res.json();
    expect(json[0]).not.toHaveProperty('durationMs');
  });

  it('serves 200 (without durationMs) when Immich sends a non-string duration', async () => {
    // Regression: a live server returned a non-string duration, crashing this
    // route with "duration.trim is not a function".
    mockImmichFetch.mockResolvedValue(new Response(
      JSON.stringify([{ id: 'v1', type: 'VIDEO', originalFileName: 'v1.mp4', duration: 30.5 }]),
      { status: 200 },
    ));

    const res = await GET(photosReq('?media=videos'));
    expect(res.status).toBe(200);
    const json: Array<Record<string, unknown>> = await res.json();
    expect(json[0].url).toBe('/api/immich/video?assetId=v1');
    expect(json[0]).not.toHaveProperty('durationMs');
  });

  it('rejects an unknown media value', async () => {
    const res = await GET(photosReq('?media=audio'));
    expect(res.status).toBe(400);
  });

  it('without media= keeps the legacy string[] response', async () => {
    mockImmichFetch.mockResolvedValue(assetsResponse(['x1']));

    const res = await GET(photosReq());
    const json = await res.json();
    expect(json).toEqual(['/api/immich/serve?assetId=x1&size=preview']);
  });
});
