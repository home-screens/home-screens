import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/onedrive', async () => {
  const { createTTLCache } = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  class OneDriveError extends Error {
    constructor(message: string, readonly status = 502) { super(message); }
  }
  return {
    listPhotos: vi.fn(),
    fetchThumbnail: vi.fn(),
    onedrivePhotoListCache: createTTLCache(5 * 60_000),
    OneDriveError,
  };
});

import { fetchThumbnail, listPhotos, onedrivePhotoListCache, OneDriveError } from '@/lib/onedrive';
import { onedrivePhotoSource } from '../onedrive';
import { PhotoSourceError } from '../types';

const mockList = vi.mocked(listPhotos);
const source = { kind: 'onedrive' as const, folderId: 'ABC!123', folderName: 'Family' };

beforeEach(() => {
  vi.clearAllMocks();
  onedrivePhotoListCache.clear();
  mockList.mockResolvedValue([{ id: 'X!1', name: 'a.jpg' }, { id: 'X!2', name: 'b.jpg' }]);
});

describe('onedrivePhotoSource.list', () => {
  it('serves the folder through the hub, never a Graph download URL', async () => {
    const items = await onedrivePhotoSource.list({ source, count: 40, media: 'photos' });
    expect(mockList).toHaveBeenCalledWith('ABC!123', 40);
    expect(items).toEqual([
      { url: '/api/onedrive/serve?itemId=X!1&size=preview', type: 'image' },
      { url: '/api/onedrive/serve?itemId=X!2&size=preview', type: 'image' },
    ]);
  });

  it('answers photos for both, and nothing for videos, since OneDrive plays photos only', async () => {
    expect(await onedrivePhotoSource.list({ source, count: 40, media: 'both' })).toHaveLength(2);
    expect(await onedrivePhotoSource.list({ source, count: 41, media: 'videos' })).toEqual([]);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('answers nothing without a folder, without asking Microsoft', async () => {
    expect(await onedrivePhotoSource.list({ source: { kind: 'onedrive', folderId: '' }, count: 40, media: 'photos' })).toEqual([]);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('keeps a list in the shared cache, which a renamed folder label does not change', async () => {
    await onedrivePhotoSource.list({ source, count: 40, media: 'photos' });
    await onedrivePhotoSource.list({ source: { ...source, folderName: 'Renamed' }, count: 40, media: 'photos' });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('turns a lapsed sign-in into a setup answer the wall shows calmly', async () => {
    mockList.mockRejectedValue(new OneDriveError('Sign in to OneDrive again', 401));
    const error = await onedrivePhotoSource.list({ source, count: 40, media: 'photos' }).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(401);
    expect(error.body).toEqual({ error: 'Sign in to OneDrive again', code: 'setup', setup: { needs: 'connection', service: 'OneDrive' } });
  });

  it('keeps any other OneDrive status, and passes other errors through', async () => {
    mockList.mockRejectedValueOnce(new OneDriveError('Folder not found', 404));
    expect((await onedrivePhotoSource.list({ source, count: 40, media: 'photos' }).catch((e) => e)).status).toBe(404);
    const boom = new Error('boom');
    mockList.mockRejectedValueOnce(boom);
    expect(await onedrivePhotoSource.list({ source, count: 40, media: 'photos' }).catch((e) => e)).toBe(boom);
  });
});

describe('onedrivePhotoSource.pickOne', () => {
  it('picks one photo and downloads its large thumbnail through the hub', async () => {
    mockList.mockResolvedValue([{ id: 'X!9', name: 'a.jpg' }]);
    vi.mocked(fetchThumbnail).mockResolvedValue({ data: new Uint8Array([1, 2]).buffer, contentType: 'image/jpeg' });

    const picked = await onedrivePhotoSource.pickOne({ source, canvas: { w: 1, h: 1 } });

    expect(mockList).toHaveBeenCalledWith('ABC!123', 1);
    expect(picked).toMatchObject({ kind: 'download', id: 'X_9' });
    const res = await (picked as { open: () => Promise<Response> }).open();
    expect(fetchThumbnail).toHaveBeenCalledWith('X!9', 'preview');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2]);
  });

  it('has nothing for an empty folder or no folder', async () => {
    mockList.mockResolvedValue([]);
    expect(await onedrivePhotoSource.pickOne({ source, canvas: { w: 1, h: 1 } })).toBeNull();
    expect(await onedrivePhotoSource.pickOne({ source: { kind: 'onedrive', folderId: '' }, canvas: { w: 1, h: 1 } })).toBeNull();
  });
});
