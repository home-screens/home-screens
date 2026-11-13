import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/icloud-media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/icloud-media')>();
  return { ...actual, fetchICloudMedia: vi.fn() };
});
vi.mock('@/lib/media-token', () => ({ mintMediaToken: vi.fn() }));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchICloudMedia } from '@/lib/icloud-media';
import { fetchWithTimeout } from '@/lib/api-utils';
import { mintMediaToken } from '@/lib/media-token';
import { icloudPhotoSource } from '../icloud';

const mockAlbum = vi.mocked(fetchICloudMedia);
const mockMint = vi.mocked(mintMediaToken);
const LINK = 'https://www.icloud.com/sharedalbum/#B0aG';
const source = { kind: 'icloud' as const, albumUrl: LINK };

const ALBUM = [
  { url: 'https://cvws.icloud-content.com/p1', type: 'image' as const, guid: 'G1' },
  { url: 'https://cvws.icloud-content.com/p2', type: 'image' as const, guid: 'G2' },
  { url: 'https://cvws.icloud-content.com/v1', type: 'video' as const, guid: 'G3', posterUrl: 'https://cvws.icloud-content.com/v1.jpg' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAlbum.mockResolvedValue(ALBUM);
  mockMint.mockResolvedValue(null);
});

const SERVE = '/api/icloud/serve?link=https%3A%2F%2Fwww.icloud.com%2Fsharedalbum%2F%23B0aG';
const VIDEO = '/api/icloud/video?link=https%3A%2F%2Fwww.icloud.com%2Fsharedalbum%2F%23B0aG';

describe('icloudPhotoSource.list', () => {
  it('reads the album from its link and answers pictures only for photos', async () => {
    const items = await icloudPhotoSource.list({ source, count: 50, media: 'photos' });
    expect(mockAlbum).toHaveBeenCalledWith(LINK);
    expect(items.map((item) => item.url).sort()).toEqual([`${SERVE}&id=G1`, `${SERVE}&id=G2`]);
  });

  it('hands the wall hub addresses by guid, never one of Apple\'s signed links', async () => {
    const items = await icloudPhotoSource.list({ source, count: 50, media: 'both' });
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(JSON.stringify(item)).not.toContain('icloud-content.com');
      expect('guid' in item).toBe(false);
    }
  });

  it('answers videos through the video route, with their poster through the photo route', async () => {
    const items = await icloudPhotoSource.list({ source, count: 50, media: 'videos' });
    // No media-token secret in a test (sign-in is off), so no `mt` is added.
    expect(items).toEqual([{ url: `${VIDEO}&id=G3`, type: 'video', posterUrl: `${SERVE}&id=G3&poster=1` }]);
  });

  it('signs a video address for the album item it names', async () => {
    mockMint.mockImplementation(async (resource) => `tok(${resource})`);
    const [item] = await icloudPhotoSource.list({ source, count: 50, media: 'videos' });
    expect(item.url).toBe(`${VIDEO}&id=G3&mt=${encodeURIComponent(`tok(icloud:${LINK}#G3)`)}`);
  });

  it('leaves the poster off a video that has none', async () => {
    mockAlbum.mockResolvedValue([{ url: 'https://cvws.icloud-content.com/v2', type: 'video', guid: 'G4' }]);
    const [item] = await icloudPhotoSource.list({ source, count: 50, media: 'both' });
    expect(item).not.toHaveProperty('posterUrl');
  });

  it('escapes a guid that is not address-safe', async () => {
    mockAlbum.mockResolvedValue([{ ...ALBUM[0], guid: 'Aq1w2e/0200==' }]);
    const [item] = await icloudPhotoSource.list({ source, count: 50, media: 'photos' });
    expect(item.url).toBe(`${SERVE}&id=Aq1w2e%2F0200%3D%3D`);
  });

  it('keeps to the count', async () => {
    expect(await icloudPhotoSource.list({ source, count: 2, media: 'both' })).toHaveLength(2);
  });
});

describe('icloudPhotoSource.pickOne', () => {
  it('picks a still picture, keyed by its guid, and downloads it from Apple', async () => {
    mockAlbum.mockResolvedValue([ALBUM[0], ALBUM[2]]);
    const picked = await icloudPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 } });
    expect(picked).toMatchObject({ kind: 'download', id: 'G1' });
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response('img'));
    await (picked as { open: () => Promise<Response> }).open();
    expect(fetchWithTimeout).toHaveBeenCalledWith('https://cvws.icloud-content.com/p1', { timeout: 30_000 });
  });

  it('keeps only letters, digits and dashes of a guid', async () => {
    mockAlbum.mockResolvedValue([{ ...ALBUM[0], guid: 'A/b.c-1' }]);
    expect(await icloudPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 } })).toMatchObject({ id: 'Abc-1' });
  });

  it('has nothing for an album of videos only', async () => {
    mockAlbum.mockResolvedValue([ALBUM[2]]);
    expect(await icloudPhotoSource.pickOne({ source, canvas: { w: 1, h: 1 } })).toBeNull();
  });
});
