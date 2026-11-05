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
import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { getUnsplashAccessKey } from '@/lib/unsplash';
import { getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout } from '@/lib/api-utils';
import { removeThumbnails } from '@/lib/thumbnails';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockImmichFetch = vi.mocked(immichFetch);
const mockICloudAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockUnsplashKey = vi.mocked(getUnsplashAccessKey);
const mockNasaKey = vi.mocked(getNasaApiKey);
const mockFetch = vi.mocked(fetchWithTimeout);

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

describe('GET /api/backgrounds/rotate — validation & fallbacks', () => {
  it('returns 400 when screenId is missing', async () => {
    const res = await GET(rotateReq(''));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'screenId required' });
  });

  it('returns { path: null } when the screen is not found', async () => {
    mockFindScreen.mockReturnValue(null);

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: null });
  });

  it('returns the static background when rotation is disabled', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: { enabled: false } as never }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('returns the static background when unsplash source has no query', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundImage: '/bg.jpg',
        backgroundRotation: { enabled: true, sources: ['unsplash'] } as never,
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
  });

  it('returns the static background for an unknown source', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundImage: '/bg.jpg',
        backgroundRotation: { enabled: true, sources: ['bogus'] } as never,
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
  });
});

describe('GET /api/backgrounds/rotate — force refresh', () => {
  it('bypasses a fresh cache entry when force=true, and always picks a new photo', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: { enabled: true, sources: ['immich'], intervalMinutes: 60 } as never,
    }));
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
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'fresh' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    const res = await GET(rotateReq('?screenId=s1&force=true'));
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-fresh.jpg', fresh: true });
    expect(mockImmichFetch).toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — NASA APOD rotation', () => {
  const apodRotation = {
    enabled: true,
    sources: ['nasa-apod'],
    intervalMinutes: 60,
  } as never;

  it('fetches the APOD image and saves a fresh path keyed by date', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: apodRotation }));
    mockNasaKey.mockResolvedValue('nasa-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_type: 'image',
            date: '2024-05-01',
            hdurl: 'https://apod.nasa.gov/hd.jpg',
            url: 'https://apod.nasa.gov/std.jpg',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-nasa-apod-20240501.jpg',
      fresh: true,
    });
    expect(fsMock.rename).toHaveBeenCalled();
  });

  it('falls back to the static background when the APOD entry is not an image', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: apodRotation }),
    );
    mockNasaKey.mockResolvedValue('nasa-key');
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ media_type: 'video', date: '2024-05-01' }), { status: 200 }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg', fresh: false });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — cache input changes', () => {
  it('refetches when the selected local folder changes mid-interval', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', backgroundRotation: {
      sources: ['local'], query: '', intervalMinutes: 60, localFolder: 'new',
    } as never }));
    seedCache({ s1: {
      path: '/api/backgrounds/serve?file=old/picture.jpg',
      sources: JSON.stringify(['local']), query: '', intervalMinutes: 60,
      localFolder: 'old', fetchedAt: Date.now(),
    } });
    fsMock.readdir.mockResolvedValue([{ name: 'photo.jpg', isFile: () => true }]);

    expect(await (await GET(rotateReq())).json()).toEqual({
      path: '/api/backgrounds/serve?file=new%2Fphoto.jpg', fresh: true,
    });
  });

  it('refetches an Unsplash crop when the display canvas changes mid-interval', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', backgroundRotation: {
      sources: ['unsplash'], query: 'sky', intervalMinutes: 60,
    } as never }));
    mockFindDisplay.mockReturnValue({ displayWidth: 1920, displayHeight: 1080 } as never);
    seedCache({ s1: {
      path: '/api/backgrounds/serve?file=rotation-unsplash-old.jpg',
      sources: JSON.stringify(['unsplash']), query: 'sky', intervalMinutes: 60,
      canvas: JSON.stringify({ w: 1080, h: 1920 }), fetchedAt: Date.now(),
    } });
    mockUnsplashKey.mockResolvedValue('key');
    mockFetch.mockResolvedValue(new Response('', { status: 503 }));

    expect(await (await GET(rotateReq())).json()).toEqual({
      path: '/api/backgrounds/serve?file=rotation-unsplash-old.jpg', fresh: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a failed forced fetch without marking its cached photo as new', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: {
      sources: ['immich'], query: '', intervalMinutes: 60,
    } as never }));
    seedCache({ s1: {
      path: '/api/backgrounds/serve?file=rotation-immich-old.jpg',
      sources: JSON.stringify(['immich']), query: '', intervalMinutes: 60,
      fetchedAt: Date.now(),
    } });
    mockImmichFetch.mockResolvedValue(new Response('', { status: 503 }));

    expect(await (await GET(rotateReq('?screenId=s1&force=true'))).json()).toEqual({
      path: '/api/backgrounds/serve?file=rotation-immich-old.jpg', fresh: false,
    });
  });
});

describe('GET /api/backgrounds/rotate — rotation file pruning', () => {
  const icloudRotation = {
    enabled: true,
    sources: ['icloud'],
    icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
    intervalMinutes: 60,
  } as never;

  function dirent(name: string, isFile = true) {
    return { name, isFile: () => isFile };
  }

  it('deletes old unreferenced rotation files but never user files or referenced ones', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    // Another screen's cache entry still references one rotation file.
    seedCache({
      s2: {
        path: '/api/backgrounds/serve?file=rotation-unsplash-kept.jpg',
        sources: JSON.stringify(['unsplash']),
        query: 'x',
        fetchedAt: 0,
        intervalMinutes: 60,
      },
    });
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'now' },
    ]);
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));

    const stale = Array.from({ length: 10 }, (_, i) => `rotation-icloud-stale${i}.jpg`);
    fsMock.readdir.mockResolvedValue([
      ...stale.map((name) => dirent(name)),
      dirent('icloud-userimport.jpg'),        // user import — no rotation- prefix
      dirent('rotation-unsplash-kept.jpg'),   // referenced by s2's cache entry
      dirent('icloud-imports', false),        // a folder, not a file
    ]);
    // mtimeMs increases with the stale index, so stale0/stale1 are the oldest.
    fsMock.stat.mockImplementation(async (p: unknown) => ({
      mtimeMs: Number(String(p).match(/stale(\d+)/)?.[1] ?? 99),
    }));

    await GET(rotateReq());

    const unlinked = fsMock.unlink.mock.calls.map(([p]) => String(p).split('/').pop()).sort();
    // 10 unreferenced candidates, newest 8 kept as the grace buffer.
    expect(unlinked).toEqual(['rotation-icloud-stale0.jpg', 'rotation-icloud-stale1.jpg']);
    // Their wall-sized copies go with them.
    expect(vi.mocked(removeThumbnails).mock.calls.map(([name]) => name).sort()).toEqual(unlinked);
  });

  it('does not prune on a request that served from cache', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        icloudAlbum: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
      },
    });

    await GET(rotateReq());

    expect(fsMock.readdir).not.toHaveBeenCalled();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });
});