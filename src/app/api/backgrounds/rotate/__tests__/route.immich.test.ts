import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Screen } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
}));
const createWriteStreamMock = vi.hoisted(() => vi.fn());
vi.mock('fs', () => ({ promises: fsMock, createWriteStream: createWriteStreamMock }));

const cacheState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/json-store', () => ({
  createJsonStore: () => ({
    read: async () => cacheState.value,
    write: async (next: Record<string, unknown>) => { cacheState.value = next; },
    updateAtomic: async (mutator: (c: Record<string, unknown>) => Record<string, unknown>) => {
      cacheState.value = await mutator(cacheState.value);
      return cacheState.value;
    },
  }),
}));

vi.mock('@/lib/config', () => ({ readConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/thumbnails', () => ({ removeThumbnails: vi.fn() }));
vi.mock('@/lib/display-filter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/display-filter')>();
  return { ...actual, findScreenById: vi.fn(), findDisplayForScreen: vi.fn() };
});
vi.mock('@/lib/immich', () => ({ immichFetch: vi.fn() }));
vi.mock('@/lib/icloud-album', () => ({ fetchSharedStreamsAlbum: vi.fn() }));
vi.mock('@/lib/icloud-link', () => ({ fetchCloudKitAlbum: vi.fn() }));
vi.mock('@/lib/unsplash', () => ({
  getUnsplashAccessKey: vi.fn(),
  trackDownload: vi.fn(),
}));
vi.mock('@/lib/nasa', () => ({
  NASA_APOD_API: 'https://api.nasa.gov/planetary/apod',
  getNasaApiKey: vi.fn(),
}));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { Writable } from 'stream';
import { findScreenById, findDisplayForScreen } from '@/lib/display-filter';
import { immichFetch } from '@/lib/immich';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockImmichFetch = vi.mocked(immichFetch);

function rotateReq(query = '?screenId=s1') {
  return new NextRequest(`http://localhost/api/backgrounds/rotate${query}`);
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 's1', name: 'Home', modules: [], ...overrides } as Screen;
}

function seedCache(entries: Record<string, unknown>): void {
  cacheState.value = entries;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindDisplay.mockReturnValue(null);
  cacheState.value = {}; // empty rotation cache by default
  fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
  fsMock.rename.mockResolvedValue(undefined);
  fsMock.mkdir.mockResolvedValue(undefined);
  fsMock.readdir.mockResolvedValue([]); // nothing to prune by default
  fsMock.stat.mockResolvedValue({ mtimeMs: 0 });
  fsMock.unlink.mockResolvedValue(undefined);
  fsMock.rm.mockResolvedValue(undefined);
  createWriteStreamMock.mockImplementation(
    () => new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
  );
});

describe('GET /api/backgrounds/rotate — Immich rotation', () => {
  const immichRotation = {
    enabled: true,
    sources: ['immich'],
    intervalMinutes: 60,
  } as never;

  it('serves the cached image without re-fetching when the interval has not elapsed', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: immichRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-immich-old.jpg',
        sources: JSON.stringify(['immich']),
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        immichFilters: JSON.stringify({ a: [], p: [], px: [], f: undefined }),
      },
    });

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-old.jpg', fresh: false });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('fetches and saves a fresh image when there is no cache entry', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: immichRotation }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'asset1' }]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-immich-asset1.jpg',
      fresh: true,
    });
    // Random search + thumbnail download.
    expect(mockImmichFetch).toHaveBeenCalledTimes(2);
    // The image file is written through fs; the cache entry lands in the store.
    expect(fsMock.rename).toHaveBeenCalled();
    expect(cacheState.value).toHaveProperty('s1');
  });

  it('falls back to the static background when the Immich search fails', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: immichRotation }),
    );
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg', fresh: false });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('narrows to one randomly-picked album and one person from a multi-select list, not all of them', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichAlbumIds: ['album-1', 'album-2'],
        immichPersonIds: ['person-1', 'person-2'],
      } as never,
    }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'asset1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    await GET(rotateReq());

    const body = JSON.parse(String(mockImmichFetch.mock.calls[0][1]?.body));
    expect(body.albumIds).toEqual(['album-1']);
    expect(body.personIds).toEqual(['person-1']);
    randomSpy.mockRestore();
  });

  it('excludes a candidate tagged with a person on the exclude list, picking the next one in the batch', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichPersonIdsExclude: ['nope'],
      } as never,
    }));
    mockImmichFetch
      // Random batch of candidates.
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'excluded' }, { id: 'ok' }]), { status: 200 }))
      // Asset-detail check for the first candidate: tagged with the excluded person.
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [{ id: 'nope' }] }), { status: 200 }))
      // Asset-detail check for the second candidate: clean.
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [] }), { status: 200 }))
      // Thumbnail download for the surviving candidate.
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-ok.jpg', fresh: true });
  });

  it('falls back when every candidate in the batch is excluded', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundImage: '/bg.jpg',
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichPersonIdsExclude: ['nope'],
      } as never,
    }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'a' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [{ id: 'nope' }] }), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg', fresh: false });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });
  it.each([
    new Response('', { status: 503 }),
    new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  ])('never accepts an unverified person-exclusion candidate', async (detailResponse) => {
    mockFindScreen.mockReturnValue(screen({
      backgroundImage: '/bg.jpg',
      backgroundRotation: {
        sources: ['immich'], intervalMinutes: 60, immichPersonIdsExclude: ['nope'],
      } as never,
    }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'unverified' }]), { status: 200 }))
      .mockResolvedValueOnce(detailResponse);

    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/bg.jpg', fresh: false });
    expect(mockImmichFetch).toHaveBeenCalledTimes(2);
  });


  it('keeps legacy cache keys unchanged but invalidates when pick mode and its picks change', async () => {
    const legacy = JSON.stringify({ a: [], p: [], px: [], f: undefined });
    const entryFor = (immichFilters: string) => ({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-immich-old.jpg',
        sources: JSON.stringify(['immich']),
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        immichFilters,
      },
    });
    // Filters mode (explicit or legacy) hits the old key.
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: { ...(immichRotation as object), immichMode: 'filters' } as never }));
    seedCache(entryFor(legacy));
    expect((await (await GET(rotateReq())).json()).fresh).toBe(false);

    // Switching to pick mode misses the cache (no picks: falls back to filters, a random fetch).
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: { ...(immichRotation as object), immichMode: 'pick', immichImages: [] } as never }));
    mockImmichFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    seedCache(entryFor(legacy));
    await GET(rotateReq());
    expect(mockImmichFetch).toHaveBeenCalled();
  });

  it('pick mode serves one of the chosen files that still exist, without calling Immich', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: { ...(immichRotation as object), immichMode: 'pick', immichImages: ['/api/backgrounds/serve?file=rotation-immich-pick-abc.jpg'] } as never,
    }));
    fsMock.stat.mockResolvedValue({ mtimeMs: 0, isFile: () => true });
    const json = await (await GET(rotateReq())).json();
    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-pick-abc.jpg', fresh: true });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });
});
