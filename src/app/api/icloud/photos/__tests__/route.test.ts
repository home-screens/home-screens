import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/icloud-album', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-album')>();
  return {
    ...actual,
    fetchSharedStreamsAlbum: vi.fn(),
  };
});

vi.mock('@/lib/icloud-link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-link')>();
  return {
    ...actual,
    fetchCloudKitAlbum: vi.fn(),
  };
});

import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbum } from '@/lib/icloud-link';
import type { ICloudAlbumItem } from '@/lib/icloud-types';
import { GET } from '@/app/api/icloud/photos/route';

const mockFetchAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockCloudKit = vi.mocked(fetchCloudKitAlbum);

const ALBUM_URL = encodeURIComponent('https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC');
const NEW_ALBUM_URL = encodeURIComponent('https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg');

function req(query = '') {
  return new NextRequest(`http://localhost/api/icloud/photos${query}`);
}

function albumItems(): ICloudAlbumItem[] {
  return [
    { url: 'https://cvws.icloud-content.com/S/p1', type: 'image', guid: 'p1' },
    { url: 'https://cvws.icloud-content.com/S/p2', type: 'image', guid: 'p2' },
    {
      url: 'https://cvws.icloud-content.com/S/v1',
      type: 'video',
      guid: 'v1',
      posterUrl: 'https://cvws.icloud-content.com/S/v1-poster',
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAlbum.mockResolvedValue(albumItems());
});

describe('GET /api/icloud/photos', () => {
  it('parses the token out of a pasted share link', async () => {
    await GET(req(`?album=${ALBUM_URL}`));
    expect(mockFetchAlbum).toHaveBeenCalledWith('B125ON9t3mbLNC');
    expect(mockCloudKit).not.toHaveBeenCalled();
  });

  it('routes a new-format album link through the CloudKit backend', async () => {
    mockCloudKit.mockResolvedValue(albumItems());

    const res = await GET(req(`?album=${NEW_ALBUM_URL}&media=both`));
    const json: Array<{ type: string }> = await res.json();

    expect(json).toHaveLength(3);
    expect(json.filter((i) => i.type === 'video')).toHaveLength(1);
    expect(mockCloudKit).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockFetchAlbum).not.toHaveBeenCalled();
  });

  it('returns an empty list for a private or expired new-format album', async () => {
    mockCloudKit.mockResolvedValue(null);

    const res = await GET(req(`?album=${NEW_ALBUM_URL}&media=both`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('without media= returns the legacy string[] of image URLs only', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}`));
    const json: string[] = await res.json();

    expect(res.status).toBe(200);
    expect(json.sort()).toEqual([
      'https://cvws.icloud-content.com/S/p1',
      'https://cvws.icloud-content.com/S/p2',
    ]);
  });

  it('media=photos returns typed image entries without guid', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}&media=photos`));
    const json: Array<Record<string, unknown>> = await res.json();

    expect(json).toHaveLength(2);
    for (const item of json) {
      expect(item.type).toBe('image');
      expect(item).not.toHaveProperty('guid');
    }
  });

  it('media=videos returns video entries with posterUrl', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}&media=videos`));
    const json: Array<Record<string, unknown>> = await res.json();

    expect(json).toEqual([{
      url: 'https://cvws.icloud-content.com/S/v1',
      type: 'video',
      posterUrl: 'https://cvws.icloud-content.com/S/v1-poster',
    }]);
  });

  it('media=both returns the full mix', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}&media=both`));
    const json: Array<{ type: string }> = await res.json();

    expect(json).toHaveLength(3);
    expect(json.filter((i) => i.type === 'image')).toHaveLength(2);
    expect(json.filter((i) => i.type === 'video')).toHaveLength(1);
  });

  it('trims results to count', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}&media=both&count=2`));
    const json: unknown[] = await res.json();
    expect(json).toHaveLength(2);
  });

  it('rejects an unknown media value', async () => {
    const res = await GET(req(`?album=${ALBUM_URL}&media=audio`));
    expect(res.status).toBe(400);
  });

  it('returns an empty list when the album param is missing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockFetchAlbum).not.toHaveBeenCalled();
  });

  it('returns an empty list for an unparseable album link', async () => {
    const res = await GET(req('?album=not%20a%20link&media=both'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(mockFetchAlbum).not.toHaveBeenCalled();
  });

  it('surfaces upstream failures as a 500 with a friendly message', async () => {
    mockFetchAlbum.mockRejectedValue(new Error('iCloud webstream failed with status 503'));

    const res = await GET(req(`?album=${ALBUM_URL}&media=both`));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch iCloud album');
  });
});
