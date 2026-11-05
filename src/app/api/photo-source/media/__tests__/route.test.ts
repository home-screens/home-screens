import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/photo-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/photo-sources')>();
  return { ...actual, listPhotoSource: vi.fn() };
});

import { listPhotoSource, PhotoSourceError } from '@/lib/photo-sources';
import { SetupError } from '@/lib/api-utils';
import { UnsupportedImageFormatError } from '@/lib/library-import';
import { libraryRevision } from '@/lib/library-revision';
import { GET } from '@/app/api/photo-source/media/route';

const mockList = vi.mocked(listPhotoSource);

function req(query: string) {
  return new NextRequest(`http://localhost/api/photo-source/media?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([{ url: '/a.jpg', type: 'image' }]);
});

describe('GET /api/photo-source/media', () => {
  it('lists the source the query names, with the media and count it asks for', async () => {
    const res = await GET(req('kind=immich&album=abc-1&favorites=1&count=80&media=both'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ url: '/a.jpg', type: 'image' }]);
    expect(mockList).toHaveBeenCalledWith({ kind: 'immich', albumId: 'abc-1', favoritesOnly: true }, 80, 'both');
  });

  it('asks for photos and 50 when the query says nothing', async () => {
    await GET(req('kind=icloud&link=https%3A%2F%2Fwww.icloud.com%2Fsharedalbum%2F%23B0'));
    expect(mockList).toHaveBeenCalledWith({ kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0' }, 50, 'photos');
  });

  it('holds the count to what the source allows', async () => {
    await GET(req('kind=unsplash&query=lakes&count=100'));
    expect(mockList.mock.calls[0][1]).toBe(30);
    await GET(req('kind=immich&count=500'));
    expect(mockList.mock.calls[1][1]).toBe(200);
    await GET(req('kind=nasa&count=-3'));
    expect(mockList.mock.calls[2][1]).toBe(50);
  });

  it('refuses a missing or unknown source, and an unknown media choice', async () => {
    for (const query of ['', 'kind=dropbox&folder=x']) {
      const res = await GET(req(query));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Unknown photo source' });
    }
    const media = await GET(req('kind=library&media=all'));
    expect(media.status).toBe(400);
    expect(await media.json()).toEqual({ error: 'Invalid media parameter' });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('says which library revision a library list reflects, and only for a library list', async () => {
    const library = await GET(req('kind=library&folder=trips'));
    expect(library.headers.get('X-Library-Revision')).toBe(libraryRevision());
    const immich = await GET(req('kind=immich'));
    expect(immich.headers.get('X-Library-Revision')).toBeNull();
  });

  it('answers a failure the source explained with its own status and body', async () => {
    mockList.mockRejectedValue(new PhotoSourceError('Immich key is missing asset.read', 403, { error: 'missing-permission', permission: 'asset.read' }));
    const res = await GET(req('kind=immich'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'missing-permission', permission: 'asset.read' });
  });

  it('answers a picture format problem with 415 and its message', async () => {
    mockList.mockRejectedValue(new UnsupportedImageFormatError());
    const res = await GET(req('kind=nasa'));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/can't show/);
  });

  it('turns a missing key into the calm setup answer, and anything else into a 500', async () => {
    mockList.mockRejectedValueOnce(new SetupError('Add an Unsplash key in Settings > API keys', 'key', 'Unsplash'));
    const setup = await GET(req('kind=unsplash&query=sea'));
    expect(setup.status).toBe(400);
    expect(await setup.json()).toMatchObject({ code: 'setup', setup: { needs: 'key', service: 'Unsplash' } });

    mockList.mockRejectedValueOnce(new Error('boom'));
    const failed = await GET(req('kind=nasa'));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toBe('Failed to load photos');
  });
});
