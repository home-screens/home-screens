import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Screen } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// `public/backgrounds` is a symlink to the real repo in the test sandbox, so the
// fetch-and-save path must never reach the real filesystem. Mock fs entirely.
// vi.hoisted so the object exists when the hoisted vi.mock factory references it.
const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('fs', () => ({ promises: fsMock }));

vi.mock('@/lib/config', () => ({ readConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/display-filter', () => ({ findScreenById: vi.fn() }));
vi.mock('@/lib/immich', () => ({ immichFetch: vi.fn() }));
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

import { findScreenById } from '@/lib/display-filter';
import { immichFetch } from '@/lib/immich';
import { getUnsplashAccessKey } from '@/lib/unsplash';
import { getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout } from '@/lib/api-utils';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockImmichFetch = vi.mocked(immichFetch);
const mockUnsplashKey = vi.mocked(getUnsplashAccessKey);
const mockNasaKey = vi.mocked(getNasaApiKey);
const mockFetch = vi.mocked(fetchWithTimeout);

function rotateReq(query = '?screenId=s1') {
  return new NextRequest(`http://localhost/api/backgrounds/rotate${query}`);
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 's1', name: 'Home', modules: [], ...overrides } as Screen;
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.readFile.mockRejectedValue(new Error('ENOENT')); // no cache file by default
  fsMock.writeFile.mockResolvedValue(undefined);
  fsMock.mkdir.mockResolvedValue(undefined);
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
        backgroundRotation: { enabled: true, source: 'unsplash' } as never,
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
        backgroundRotation: { enabled: true, source: 'bogus' } as never,
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
  });
});

describe('GET /api/backgrounds/rotate — Immich rotation', () => {
  const immichRotation = {
    enabled: true,
    source: 'immich',
    intervalMinutes: 60,
  } as never;

  it('serves the cached image without re-fetching when the interval has not elapsed', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: immichRotation }));
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        s1: {
          path: '/api/backgrounds/serve?file=immich-old.jpg',
          source: 'immich',
          query: undefined,
          fetchedAt: Date.now(),
          intervalMinutes: 60,
          immichFilters: JSON.stringify({ a: undefined, p: undefined, f: undefined }),
        },
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=immich-old.jpg', fresh: false });
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
      path: '/api/backgrounds/serve?file=immich-asset1.jpg',
      fresh: true,
    });
    // Random search + thumbnail download.
    expect(mockImmichFetch).toHaveBeenCalledTimes(2);
    // Image + cache both written.
    expect(fsMock.writeFile).toHaveBeenCalled();
  });

  it('falls back to the static background when the Immich search fails', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: immichRotation }),
    );
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — Unsplash rotation', () => {
  const unsplashRotation = {
    enabled: true,
    source: 'unsplash',
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

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
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
      path: '/api/backgrounds/serve?file=unsplash-photo42.jpg',
      fresh: true,
    });
    // Metadata fetch + image download.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(fsMock.writeFile).toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — NASA APOD rotation', () => {
  const apodRotation = {
    enabled: true,
    source: 'nasa-apod',
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
      path: '/api/backgrounds/serve?file=nasa-apod-20240501.jpg',
      fresh: true,
    });
    expect(fsMock.writeFile).toHaveBeenCalled();
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

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});
