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
import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbum } from '@/lib/icloud-link';
import { fetchWithTimeout } from '@/lib/api-utils';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockICloudAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockCloudKit = vi.mocked(fetchCloudKitAlbum);
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

describe('GET /api/backgrounds/rotate — iCloud rotation', () => {
  const icloudRotation = {
    enabled: true,
    sources: ['icloud'],
    icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
    intervalMinutes: 60,
  } as never;

  function pngResponse() {
    return new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }

  it('picks only images (a video cannot be a CSS background) and keys the file by sanitized GUID', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/v', type: 'video', guid: 'vid-1' },
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'pic/1!' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const res = await GET(rotateReq());
    const json = await res.json();

    // One image in the album → random can only pick it. GUID sanitized to
    // alphanumerics; extension mapped from the response Content-Type.
    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-pic1.png', fresh: true });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://cvws.icloud-content.com/p');
    // The image streams to disk (writeLibraryFile) rather than buffering whole.
    expect(String(createWriteStreamMock.mock.calls[0][0])).toContain('rotation-icloud-pic1.png');
  });

  it('rotates from a new-format album through the CloudKit backend', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['icloud'],
        icloudAlbumUrl: 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg',
        intervalMinutes: 60,
      } as never,
    }));
    mockCloudKit.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'ck-1' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-ck-1.png', fresh: true });
    expect(mockCloudKit).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockICloudAlbum).not.toHaveBeenCalled();
  });

  it('falls back to the static background when the album has no photos', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: icloudRotation }),
    );
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/v', type: 'video', guid: 'vid-1' },
    ]);

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/bg.jpg', fresh: false });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('serves the cached image while fresh, without re-resolving the album', async () => {
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

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg', fresh: false });
    expect(mockICloudAlbum).not.toHaveBeenCalled();
  });

  it('refetches immediately when the configured album changes, even mid-interval', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        icloudAlbum: 'https://www.icloud.com/sharedalbum/#DIFFERENTALBUM',
      },
    });
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'new' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-new.png', fresh: true });
    expect(mockICloudAlbum).toHaveBeenCalledTimes(1);
  });

  it('keeps an entry another screen committed while this fetch was in flight', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({});
    mockICloudAlbum.mockImplementation(async () => {
      cacheState.value = {
        ...cacheState.value,
        s2: {
          path: '/api/backgrounds/serve?file=rotation-unsplash-other.jpg',
          sources: JSON.stringify(['unsplash']),
          query: 'x',
          fetchedAt: Date.now(),
          intervalMinutes: 60,
        },
      };
      return [{ url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'new' }];
    });
    mockFetch.mockResolvedValue(pngResponse());

    await GET(rotateReq());

    expect(Object.keys(cacheState.value).sort()).toEqual(['s1', 's2']);
  });
});
