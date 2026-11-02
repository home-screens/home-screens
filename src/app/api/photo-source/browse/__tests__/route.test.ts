import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const browse = vi.hoisted(() => vi.fn());
vi.mock('@/lib/photo-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photo-sources')>();
  return { ...actual, getPickableSource: vi.fn(() => ({ browse })) };
});

import { getPickableSource, PhotoSourceError } from '@/lib/photo-sources';
import { GET } from '@/app/api/photo-source/browse/route';

function req(query: string) {
  return new NextRequest(`http://localhost/api/photo-source/browse?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  browse.mockResolvedValue({ items: [{ ref: 'p1', thumbUrl: '/t.jpg' }], nextPage: 2 });
});

describe('GET /api/photo-source/browse', () => {
  it('answers one page of the source the query names', async () => {
    const res = await GET(req('kind=immich&collection=album:abc&page=3'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ ref: 'p1', thumbUrl: '/t.jpg' }], nextPage: 2 });
    expect(getPickableSource).toHaveBeenCalledWith('immich');
    expect(browse).toHaveBeenCalledWith({ collection: 'album:abc', page: 3, query: '' });
  });

  it('starts Immich on all photos and the search sources on search', async () => {
    await GET(req('kind=immich'));
    await GET(req('kind=unsplash&query=lakes'));
    await GET(req('kind=nasa&query=moon'));
    expect(browse.mock.calls.map(([args]) => args.collection)).toEqual(['all', 'search', 'search']);
  });

  it('holds the page to 1..1000 and the search words to 100 characters', async () => {
    await GET(req('kind=nasa&page=0'));
    await GET(req('kind=nasa&page=abc'));
    await GET(req('kind=nasa&page=5000'));
    await GET(req(`kind=unsplash&query=${'x'.repeat(150)}`));
    expect(browse.mock.calls.map(([args]) => args.page)).toEqual([1, 1, 1000, 1]);
    expect(browse.mock.calls[3][0].query).toHaveLength(100);
  });

  it('passes a portrait or landscape wall shape and nothing else', async () => {
    await GET(req('kind=unsplash&query=sea&orientation=portrait'));
    await GET(req('kind=unsplash&query=sea&orientation=sideways'));
    expect(browse.mock.calls[0][0].orientation).toBe('portrait');
    expect('orientation' in browse.mock.calls[1][0]).toBe(false);
  });

  it('refuses sources that are not browsed one picture at a time', async () => {
    for (const kind of ['library', 'icloud', 'onedrive', '']) {
      const res = await GET(req(`kind=${kind}`));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown photo source' });
    }
    expect(browse).not.toHaveBeenCalled();
  });

  it('answers a failure the source explained with its own status and body', async () => {
    browse.mockRejectedValue(new PhotoSourceError('Unknown Immich collection', 400));
    const res = await GET(req('kind=immich&collection=nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown Immich collection' });
  });

  it('answers anything else with a 500', async () => {
    browse.mockRejectedValue(new Error('boom'));
    const res = await GET(req('kind=nasa&query=x'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to browse photos');
  });
});
