import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/icloud-media', () => ({ fetchICloudMedia: vi.fn() }));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { fetchICloudMedia } from '@/lib/icloud-media';
import { fetchWithTimeout } from '@/lib/api-utils';
import { icloudPhotoSource } from '../icloud';

const mockAlbum = vi.mocked(fetchICloudMedia);
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
});

describe('icloudPhotoSource.list', () => {
  it('reads the album from its link and answers pictures only for photos', async () => {
    const items = await icloudPhotoSource.list({ source, count: 50, media: 'photos' });
    expect(mockAlbum).toHaveBeenCalledWith(LINK);
    expect(items.map((item) => item.url).sort()).toEqual(['https://cvws.icloud-content.com/p1', 'https://cvws.icloud-content.com/p2']);
  });

  it('answers videos with their posters, and never the internal guid', async () => {
    const items = await icloudPhotoSource.list({ source, count: 50, media: 'videos' });
    expect(items).toEqual([{ url: 'https://cvws.icloud-content.com/v1', type: 'video', posterUrl: 'https://cvws.icloud-content.com/v1.jpg' }]);
    for (const item of await icloudPhotoSource.list({ source, count: 50, media: 'both' })) expect('guid' in item).toBe(false);
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
