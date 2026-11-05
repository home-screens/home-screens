import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/immich', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/immich')>();
  return { ...actual, immichFetch: vi.fn() };
});
vi.mock('@/lib/media-token', () => ({ mintMediaToken: vi.fn(async () => 'tok') }));
vi.mock('@/lib/library-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library-import')>();
  return { ...actual, importPictureToLibrary: vi.fn(async () => ({ path: 'immich/immich-x.jpg', reused: false })) };
});

import { immichFetch } from '@/lib/immich';
import { importPictureToLibrary } from '@/lib/library-import';
import { immichPhotoSource, IMMICH_BROWSE_PAGE_SIZE } from '../immich';
import { PhotoSourceError } from '../types';

const mockFetch = vi.mocked(immichFetch);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** What the last call to an Immich path sent as its JSON body. */
function bodyOf(call: number) {
  return JSON.parse(String((mockFetch.mock.calls[call][1] as RequestInit).body));
}

let albumSeq = 0;
/** A distinct album per test, so the module's list cache never carries over. */
function freshAlbum() {
  albumSeq += 1;
  return `a${albumSeq.toString(16)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('immichPhotoSource.list', () => {
  it('asks random search for pictures with every filter and the count', async () => {
    const albumId = freshAlbum();
    mockFetch.mockResolvedValue(json([{ id: 'p1', type: 'IMAGE' }, { id: 'p2', type: 'IMAGE' }]));

    const items = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [albumId], personIds: ['b1'], favoritesOnly: true }, count: 20, media: 'photos' });

    expect(mockFetch).toHaveBeenCalledWith('/api/search/random', expect.objectContaining({ method: 'POST' }));
    expect(bodyOf(0)).toEqual({ albumIds: [albumId], personIds: ['b1'], isFavorite: true, type: 'IMAGE', size: 20 });
    expect(items).toEqual([
      { url: '/api/immich/serve?assetId=p1&size=preview', type: 'image' },
      { url: '/api/immich/serve?assetId=p2&size=preview', type: 'image' },
    ]);
  });

  it('hands videos over with a media token, a poster and the reported length', async () => {
    mockFetch.mockResolvedValue(json([{ id: 'v1', type: 'VIDEO', duration: '0:00:12.500' }]));

    const items = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [freshAlbum()] }, count: 5, media: 'videos' });

    expect(bodyOf(0).type).toBe('VIDEO');
    expect(items).toEqual([{
      url: '/api/immich/video?assetId=v1&mt=tok',
      type: 'video',
      posterUrl: '/api/immich/serve?assetId=v1&size=preview',
      durationMs: 12_500,
    }]);
  });

  it('runs one search per type for both, and keeps to the count', async () => {
    mockFetch.mockImplementation(async (_path, init) => {
      const type = JSON.parse(String(init?.body)).type;
      return json(type === 'IMAGE' ? [{ id: 'p1', type: 'IMAGE' }, { id: 'p2', type: 'IMAGE' }] : [{ id: 'v1', type: 'VIDEO' }, { id: 'v2', type: 'VIDEO' }]);
    });

    const items = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [freshAlbum()] }, count: 3, media: 'both' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(3);
  });

  it('keeps a list for five minutes, so walls refreshing together share one search', async () => {
    vi.useFakeTimers();
    const source = { kind: 'immich' as const, albumIds: [freshAlbum()] };
    mockFetch.mockImplementation(async () => json([{ id: 'p1', type: 'IMAGE' }]));

    await immichPhotoSource.list({ source, count: 10, media: 'photos' });
    await immichPhotoSource.list({ source, count: 10, media: 'photos' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // A different count is a different list.
    await immichPhotoSource.list({ source, count: 11, media: 'photos' });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    await immichPhotoSource.list({ source, count: 10, media: 'photos' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('names the missing permission when the key cannot search', async () => {
    mockFetch.mockResolvedValue(json({ message: 'Missing required permission: asset.read' }, 403));

    const error = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [freshAlbum()] }, count: 5, media: 'photos' }).catch((e) => e);

    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(403);
    expect(error.body).toEqual({ error: 'missing-permission', permission: 'asset.read' });
  });

  it('answers 502 for any other failure', async () => {
    mockFetch.mockResolvedValue(json({}, 500));
    const error = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [freshAlbum()] }, count: 5, media: 'photos' }).catch((e) => e);
    expect(error.status).toBe(502);
  });
});

describe('immichPhotoSource.pickOne', () => {
  it('picks one random picture and downloads its display-sized preview', async () => {
    mockFetch.mockResolvedValueOnce(json([{ id: 'p9', type: 'IMAGE' }]));
    const picked = await immichPhotoSource.pickOne({ source: { kind: 'immich', personIds: ['b1'] }, canvas: { w: 1080, h: 1920 } });

    expect(bodyOf(0)).toEqual({ personIds: ['b1'], type: 'IMAGE', size: 1 });
    expect(picked).toMatchObject({ kind: 'download', id: 'p9' });
    mockFetch.mockResolvedValueOnce(new Response('img'));
    await (picked as { open: () => Promise<Response> }).open();
    expect(mockFetch).toHaveBeenLastCalledWith('/api/assets/p9/thumbnail?size=preview', expect.objectContaining({ timeout: 30_000 }));
  });

  it('has nothing when nothing matches', async () => {
    mockFetch.mockResolvedValue(json([]));
    expect(await immichPhotoSource.pickOne({ source: { kind: 'immich' }, canvas: { w: 1, h: 1 } })).toBeNull();
  });

  it('picks one of the hand-picked photos without a search, avoiding the one showing', async () => {
    const picked = await immichPhotoSource.pickOne({ source: { kind: 'immich', assetIds: ['a1', 'b2'] }, canvas: { w: 1, h: 1 }, previous: 'rotation-immich-a1.jpg' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(picked).toMatchObject({ kind: 'download', id: 'b2' });
    expect(await immichPhotoSource.pickOne({ source: { kind: 'immich', assetIds: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
  });

  it('asks for a handful and leaves out anyone on the exclude list, checking the candidates all at once', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path === '/api/search/random') return json([{ id: 'p1', type: 'IMAGE' }, { id: 'p2', type: 'IMAGE' }]);
      if (path === '/api/assets/p1') return json({ id: 'p1', people: [{ id: 'bad' }] });
      if (path === '/api/assets/p2') return json({ id: 'p2', people: [{ id: 'fine' }] });
      return json({}, 404);
    });

    const picked = await immichPhotoSource.pickOne({ source: { kind: 'immich', excludePersonIds: ['bad'] }, canvas: { w: 1, h: 1 } });

    expect(bodyOf(0)).toEqual({ type: 'IMAGE', size: 10 });
    expect(picked).toMatchObject({ kind: 'download', id: 'p2' });
    // Both detail lookups went out before either answered.
    expect(mockFetch.mock.calls.map(([path]) => path)).toEqual(['/api/search/random', '/api/assets/p1', '/api/assets/p2']);
  });

  it('keeps a photo whose people cannot be read rather than dropping it', async () => {
    mockFetch.mockImplementation(async (path: string) => {
      if (path === '/api/search/random') return json([{ id: 'p1', type: 'IMAGE' }]);
      return json({ error: 'no permission' }, 403);
    });
    const picked = await immichPhotoSource.pickOne({ source: { kind: 'immich', excludePersonIds: ['bad'] }, canvas: { w: 1, h: 1 } });
    expect(picked).toMatchObject({ kind: 'download', id: 'p1' });
  });
});

describe('immichPhotoSource.list with picks and left-out people', () => {
  it('plays the hand-picked photos as they are, never videos, without a search', async () => {
    const items = await immichPhotoSource.list({ source: { kind: 'immich', assetIds: ['a1', 'b2'] }, count: 20, media: 'both' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(items).toEqual([
      { url: '/api/immich/serve?assetId=a1&size=preview', type: 'image' },
      { url: '/api/immich/serve?assetId=b2&size=preview', type: 'image' },
    ]);
    expect(await immichPhotoSource.list({ source: { kind: 'immich', assetIds: ['a1'] }, count: 20, media: 'videos' })).toEqual([]);
  });

  it('leaves out the photos showing anyone on the exclude list', async () => {
    const albumId = freshAlbum();
    mockFetch.mockImplementation(async (path: string) => {
      if (path === '/api/search/random') return json([{ id: 'p1', type: 'IMAGE', people: [{ id: 'bad' }] }, { id: 'p2', type: 'IMAGE', people: [] }]);
      return json({}, 404);
    });
    const items = await immichPhotoSource.list({ source: { kind: 'immich', albumIds: [albumId], excludePersonIds: ['bad'] }, count: 5, media: 'photos' });
    expect(items.map((item) => item.url)).toEqual(['/api/immich/serve?assetId=p2&size=preview']);
    // People already on the asset need no second lookup.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('immichPhotoSource.browse', () => {
  it('pages search/metadata newest first, still pictures only', async () => {
    mockFetch.mockResolvedValue(json({ assets: { items: [
      { id: 'p1', originalFileName: 'IMG_1.jpg', isFavorite: true },
      { id: 'p2', originalFileName: 'IMG_2.jpg', isFavorite: false },
    ], nextPage: '2' } }));

    const page = await immichPhotoSource.browse({ collection: 'all', page: 1 });

    expect(mockFetch).toHaveBeenCalledWith('/api/search/metadata', expect.objectContaining({ method: 'POST' }));
    expect(bodyOf(0)).toEqual({ type: 'IMAGE', order: 'desc', page: 1, size: IMMICH_BROWSE_PAGE_SIZE });
    expect(page).toEqual({
      items: [
        { ref: 'p1', thumbUrl: '/api/immich/serve?assetId=p1&size=thumbnail', label: 'IMG_1.jpg', favorite: true },
        { ref: 'p2', thumbUrl: '/api/immich/serve?assetId=p2&size=thumbnail', label: 'IMG_2.jpg' },
      ],
      nextPage: 2,
    });
  });

  it.each([
    ['favorites', { isFavorite: true }],
    ['album:abc-1', { albumIds: ['abc-1'] }],
    ['person:def-2', { personIds: ['def-2'] }],
  ])('reads the %s sidebar entry as filters', async (collection, filters) => {
    mockFetch.mockResolvedValue(json({ assets: { items: [], nextPage: null } }));
    await immichPhotoSource.browse({ collection, page: 3 });
    expect(bodyOf(0)).toEqual({ ...filters, type: 'IMAGE', order: 'desc', page: 3, size: IMMICH_BROWSE_PAGE_SIZE });
  });

  it('stops at the last page', async () => {
    mockFetch.mockResolvedValue(json({ assets: { items: [{ id: 'p1' }], nextPage: null } }));
    expect((await immichPhotoSource.browse({ collection: 'all', page: 4 })).nextPage).toBeNull();
  });

  it('refuses a sidebar entry it does not know, without asking Immich', async () => {
    const error = await immichPhotoSource.browse({ collection: 'album:../x', page: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('names asset.read when the key cannot list photos', async () => {
    mockFetch.mockResolvedValue(json({}, 403));
    const error = await immichPhotoSource.browse({ collection: 'all', page: 1 }).catch((e) => e);
    expect(error.body).toEqual({ error: 'missing-permission', permission: 'asset.read' });
  });
});

describe('immichPhotoSource.importOne', () => {
  it('copies the preview into the given folder through the library import', async () => {
    const result = await immichPhotoSource.importOne({ ref: 'p7', folder: 'immich' });

    expect(result).toEqual({ path: 'immich/immich-x.jpg', reused: false });
    const pick = vi.mocked(importPictureToLibrary).mock.calls[0][0];
    expect(pick).toMatchObject({ kind: 'immich', id: 'p7', folder: 'immich' });
    mockFetch
      .mockResolvedValueOnce(new Response('img'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'p7', originalFileName: 'IMG_2041.HEIC' })));
    const opened = await pick.open();
    expect(mockFetch).toHaveBeenCalledWith('/api/assets/p7/thumbnail?size=preview', expect.objectContaining({ timeout: 30_000 }));
    // The photo's own file name names the copy.
    expect(opened).toMatchObject({ title: 'IMG_2041.HEIC' });
  });

  it('names asset.view when the key cannot show the picture', async () => {
    await immichPhotoSource.importOne({ ref: 'p7', folder: 'immich' });
    const pick = vi.mocked(importPictureToLibrary).mock.calls[0][0];
    mockFetch.mockResolvedValueOnce(json({}, 403));
    const error = await pick.open().catch((e: unknown) => e) as PhotoSourceError;
    expect(error.body).toEqual({ error: 'missing-permission', permission: 'asset.view' });
  });
});
