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
import { getUnsplashAccessKey } from '@/lib/unsplash';
import { fetchWithTimeout } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockUnsplashKey = vi.mocked(getUnsplashAccessKey);
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

describe('GET /api/backgrounds/rotate — Unsplash rotation', () => {
  const unsplashRotation = {
    enabled: true,
    sources: ['unsplash'],
    query: 'mountains',
    intervalMinutes: 60,
  } as never;

  it('falls back to the static background when no Unsplash access key is configured', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: unsplashRotation }),
    );
    mockUnsplashKey.mockResolvedValue(null);

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg', fresh: false });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('fetches Unsplash metadata, downloads the image, and saves a fresh path', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'photo42',
            urls: { regular: 'https://images.unsplash.com/photo42' },
            links: { download_location: 'https://api.unsplash.com/photos/photo42/download' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-unsplash-photo42.jpg',
      fresh: true,
    });
    // Metadata fetch + image download.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(fsMock.rename).toHaveBeenCalled();
    // No owning display resolved and no global canvas configured, so canvasOf
    // falls back to DEFAULT_DISPLAY_WIDTH/HEIGHT (1080x1920 — portrait).
    expect(mockFetch.mock.calls[0][0]).toContain('orientation=portrait');
  });

  it('uses the collections param instead of query when unsplashCollections is set', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'mountains',
          unsplashCollections: ['I6rVqHIQXO0', 'abc123'],
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('collections=I6rVqHIQXO0,abc123');
    expect(requestedUrl).not.toContain('query=');
  });

  it('uses query, not a leftover unsplashCollections array, when unsplashMode is explicitly "query"', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'space',
          unsplashCollections: ['leftover-collection'],
          unsplashMode: 'query',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('query=space');
    expect(requestedUrl).not.toContain('collections=');
  });

  it('uses collections, not query, when unsplashMode is explicitly "collections"', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'space',
          unsplashCollections: ['active-collection'],
          unsplashMode: 'collections',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('collections=active-collection');
    expect(requestedUrl).not.toContain('query=');
  });

  it('includes the orientation param when the owning display resolves dimensions', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockFindDisplay.mockReturnValue({
      id: 'd1',
      name: 'Kitchen',
      screens: [],
      displayWidth: 1024,
      displayHeight: 600,
    } as never);
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('orientation=landscape');
  });

  it('invalidates the cached entry when unsplashCollections changes between requests', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'mountains',
          unsplashCollections: ['new-collection'],
          intervalMinutes: 60,
        } as never,
      }),
    );
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-unsplash-old.jpg',
        sources: JSON.stringify(['unsplash']),
        query: 'mountains',
        unsplashCollections: JSON.stringify(['old-collection']),
        fetchedAt: Date.now(),
        intervalMinutes: 60,
      },
    });
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo99', urls: { regular: 'https://images.unsplash.com/photo99' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    // A fresh fetch happened (not the stale cache), because the collections
    // key no longer matches what's stored in the cache entry.
    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-unsplash-photo99.jpg',
      fresh: true,
    });
  });
});

describe('GET /api/backgrounds/rotate: Unsplash sized to the wall', () => {
  const unsplashRotation = { enabled: true, sources: ['unsplash'], query: 'lakes', intervalMinutes: 60 } as never;

  function photoResponse() {
    return new Response(JSON.stringify({
      id: 'p9',
      urls: { raw: 'https://images.unsplash.com/photo-p9?ixid=abc', regular: 'https://images.unsplash.com/photo-p9-regular' },
    }), { status: 200 });
  }

  it('asks for a photo shaped like the display that owns the screen, cropped to its canvas', async () => {
    vi.mocked(readConfig).mockResolvedValueOnce({
      settings: { displayWidth: 1080, displayHeight: 1920 },
      displays: [{ id: 'kitchen', name: 'Kitchen', displayWidth: 1920, displayHeight: 1080, screens: [{ id: 's1' }] }],
      screens: [],
    } as never);
    // findDisplayForScreen is fully mocked in this file (not delegated to the
    // real implementation), so it must be told directly what it would have
    // resolved from the config above.
    mockFindDisplay.mockReturnValue({ id: 'kitchen', name: 'Kitchen', displayWidth: 1920, displayHeight: 1080, screens: [] } as never);
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(photoResponse())
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200 }));

    await GET(rotateReq());

    expect(String(mockFetch.mock.calls[0][0])).toContain('orientation=landscape');
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://images.unsplash.com/photo-p9?ixid=abc&fit=crop&w=1920&h=1080&q=80&fm=jpg',
    );
  });

  it('falls back to the shared canvas, portrait by default', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(photoResponse())
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200 }));

    await GET(rotateReq());

    expect(String(mockFetch.mock.calls[0][0])).toContain('orientation=portrait');
    expect(String(mockFetch.mock.calls[1][0])).toContain('&w=1080&h=1920');
  });
});
