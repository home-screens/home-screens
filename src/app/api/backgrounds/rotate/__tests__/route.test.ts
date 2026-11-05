import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { PhotoSource, Screen, ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// `public/backgrounds` is a symlink to the real repo in the test sandbox, so the
// save path must never reach the real filesystem. Mock fs entirely.
// createWriteStream backs writeLibraryFile's streaming save; it must hand back
// a real Writable or stream.pipeline rejects.
const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
  rename: vi.fn(),
  access: vi.fn(),
}));
const createWriteStreamMock = vi.hoisted(() => vi.fn());
vi.mock('fs', () => ({ promises: fsMock, createWriteStream: createWriteStreamMock }));

// The rotation cache is a json-store: back it with an in-memory object, since
// `updateAtomic`'s merge is what the route depends on.
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
vi.mock('@/lib/display-filter', () => ({ findScreenById: vi.fn() }));
// Which picture a source hands out is each adapter's business (tested with
// the adapters); this route only saves it, caches it and prunes.
vi.mock('@/lib/photo-sources', () => ({ pickOneFromSource: vi.fn() }));
// Which keys are saved decides which sources take a turn.
const secrets = vi.hoisted(() => ({ status: {} as Record<string, boolean> }));
vi.mock('@/lib/secrets', () => ({ getSecretStatus: vi.fn(async () => secrets.status) }));
const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({ logger: () => ({ debug: vi.fn(), info: vi.fn(), log: vi.fn(), warn, error: vi.fn() }) }));

import { Writable } from 'stream';
import { findScreenById } from '@/lib/display-filter';
import { pickOneFromSource } from '@/lib/photo-sources';
import { removeThumbnails } from '@/lib/thumbnails';
import { readConfig } from '@/lib/config';
import { rotationCacheKey } from '@/lib/photo-source';
import { GET, FAILURE_BACKOFF_MS, FORCE_SPACING_MS } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockPick = vi.mocked(pickOneFromSource);

const IMMICH: PhotoSource = { kind: 'immich', albumIds: ['abc-123'] };
const UNSPLASH: PhotoSource = { kind: 'unsplash', query: 'lakes' };
const NASA: PhotoSource = { kind: 'nasa' };
const WALLS: PhotoSource = { kind: 'wall', group: 'color', ids: ['ocean', 'dusk'] };
const KEYS = { immich_url: true, immich_api_key: true, unsplash_access_key: true };

function rotateReq(query = '?screenId=s1') {
  return new NextRequest(`http://localhost/api/backgrounds/rotate${query}`);
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 's1', name: 'Home', modules: [], backgroundImage: '', ...overrides } as Screen;
}

function rotating(sources: PhotoSource[] = [IMMICH], intervalMinutes = 60): Partial<Screen> {
  return { backgroundRotation: { intervalMinutes, sources } };
}

/** Put entries in the rotation cache the route will read. */
function seedCache(entries: Record<string, unknown>): void {
  cacheState.value = entries;
}

function entry(file: string, sources: PhotoSource[] = [IMMICH], fetchedAt = Date.now(), intervalMinutes = 60, extra: Record<string, unknown> = {}) {
  return { path: `/api/backgrounds/serve?file=${encodeURIComponent(file)}`, sourceKey: rotationCacheKey({ sources, intervalMinutes }), fetchedAt, intervalMinutes, ...extra };
}

function imageResponse(type = 'image/jpeg') {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': type } });
}

function dirent(name: string, isFile = true) {
  return { name, isFile: () => isFile };
}

/** What the library root holds: names for a plain readdir, dirents for withFileTypes. */
function libraryHolds(entries: Array<{ name: string; isFile?: boolean }>) {
  fsMock.readdir.mockImplementation(async (_dir: unknown, opts?: { withFileTypes?: boolean }) => (
    opts?.withFileTypes
      ? entries.map((e) => dirent(e.name, e.isFile ?? true))
      : entries.map((e) => e.name)
  ));
}

const picked = (id: string) => ({ kind: 'download' as const, id, open: async () => imageResponse() });

beforeEach(() => {
  vi.clearAllMocks();
  cacheState.value = {};
  secrets.status = { ...KEYS };
  fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
  fsMock.writeFile.mockResolvedValue(undefined);
  fsMock.mkdir.mockResolvedValue(undefined);
  libraryHolds([]);
  fsMock.stat.mockResolvedValue({ mtimeMs: 0 });
  fsMock.unlink.mockResolvedValue(undefined);
  fsMock.rm.mockResolvedValue(undefined);
  fsMock.rename.mockResolvedValue(undefined);
  // Every cached library file is still there unless a test says otherwise.
  fsMock.access.mockResolvedValue(undefined);
  createWriteStreamMock.mockImplementation(
    () => new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
  );
  vi.mocked(readConfig).mockResolvedValue({} as ScreenConfiguration);
});

describe('GET /api/backgrounds/rotate: validation and fallbacks', () => {
  it('returns 400 when screenId is missing', async () => {
    const res = await GET(rotateReq(''));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'screenId required' });
  });

  it('returns { path: null } when the screen is not found', async () => {
    mockFindScreen.mockReturnValue(null);
    expect(await (await GET(rotateReq())).json()).toEqual({ path: null });
  });

  it('returns the own picture when the rotation has no sources', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', ...rotating([]) }));
    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/bg.jpg' });
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('returns the own picture when no source names any pictures or reads as one', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundImage: '/bg.jpg',
      backgroundRotation: { intervalMinutes: 60, sources: [{ kind: 'wall', group: 'color', ids: [] }, { kind: 'dropbox' } as unknown as PhotoSource] },
    }));
    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/bg.jpg' });
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('gives no turn to a source whose key is not saved', async () => {
    secrets.status = { unsplash_access_key: true };
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', ...rotating([IMMICH, UNSPLASH]) }));
    mockPick.mockResolvedValue(null);

    await GET(rotateReq());

    expect(mockPick).toHaveBeenCalledTimes(1);
    expect(mockPick.mock.calls[0][0]).toEqual(UNSPLASH);
  });
});

describe('GET /api/backgrounds/rotate: picking from the sources', () => {
  it('answers a wall with its own path, with nothing downloaded or saved', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([WALLS])));
    mockPick.mockResolvedValue({ kind: 'static', path: '/starter-backgrounds/ocean.svg' });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/starter-backgrounds/ocean.svg', fresh: true });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
    expect(cacheState.value.s1).toMatchObject({ path: '/starter-backgrounds/ocean.svg', sourceKey: rotationCacheKey({ sources: [WALLS], intervalMinutes: 60 }) });
  });

  it('serves a library pick where it is, with no copy', async () => {
    const folder: PhotoSource = { kind: 'library', folder: 'trips' };
    mockFindScreen.mockReturnValue(screen(rotating([folder])));
    mockPick.mockResolvedValue({ kind: 'library', path: 'trips/a b.jpg' });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: `/api/backgrounds/serve?file=${encodeURIComponent('trips/a b.jpg')}`, fresh: true });
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('saves a download as rotation-<kind>-<id>, with the extension from its Content-Type', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    const open = vi.fn(async () => imageResponse('image/png'));
    mockPick.mockResolvedValue({ kind: 'download', id: 'asset-1', open });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-asset-1.png', fresh: true });
    expect(open).toHaveBeenCalledTimes(1);
    // Streamed to a temporary name, then renamed into place once complete.
    expect(String(fsMock.rename.mock.calls[0][1])).toMatch(/[\\/]rotation-immich-asset-1\.png$/);
  });

  it('turns odd characters in an id into underscores in the file name', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([{ kind: 'icloud', albumUrl: 'https://www.icloud.com/sharedalbum/#B0aGcD12' }])));
    mockPick.mockResolvedValue({ kind: 'download', id: 'a/b c', open: async () => imageResponse() });

    expect((await (await GET(rotateReq())).json()).path).toBe('/api/backgrounds/serve?file=rotation-icloud-a_b_c.jpg');
  });

  it('reuses a rotation file already saved for the same picture, without downloading', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    libraryHolds([{ name: 'rotation-immich-asset-1.webp' }]);
    const open = vi.fn(async () => imageResponse());
    mockPick.mockResolvedValue({ kind: 'download', id: 'asset-1', open });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-asset-1.webp', fresh: true });
    expect(open).not.toHaveBeenCalled();
    expect(createWriteStreamMock).not.toHaveBeenCalled();
  });

  it('tries every ready source, in some order, until one answers', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([IMMICH, UNSPLASH, NASA])));
    mockPick.mockImplementation(async (source) => (source.kind === 'nasa' ? picked('apod') : null));

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-nasa-apod.jpg', fresh: true });
    // Asked until one answered, never after.
    const tried = mockPick.mock.calls.map(([source]) => source.kind);
    expect(tried.at(-1)).toBe('nasa');
    expect(new Set(tried).size).toBe(tried.length);
  });

  it('moves on when a source throws, and keeps going when a download is not a picture', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([IMMICH, UNSPLASH])));
    mockPick.mockImplementation(async (source) => {
      if (source.kind === 'immich') throw new Error('Immich is away');
      return { kind: 'download', id: 'u1', open: async () => imageResponse('text/html') };
    });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: null });
    expect(mockPick).toHaveBeenCalledTimes(2);
  });

  it('asks the source for a picture shaped like the display that owns the screen, avoiding the one showing', async () => {
    vi.mocked(readConfig).mockResolvedValue({
      settings: { displayWidth: 1080, displayHeight: 1920 },
      displays: [{ id: 'den', screens: [{ id: 's1' }], displayWidth: 3840, displayHeight: 2160 }],
    } as unknown as ScreenConfiguration);
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH], 0) });
    mockPick.mockResolvedValue(null);

    await GET(rotateReq());

    expect(mockPick).toHaveBeenCalledWith(IMMICH, { w: 3840, h: 2160 }, 'rotation-immich-old.jpg');
  });

  it('falls back to the shared canvas, portrait by default', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    mockPick.mockResolvedValue(null);

    await GET(rotateReq());

    expect(mockPick).toHaveBeenCalledWith(IMMICH, { w: 1080, h: 1920 }, undefined);
  });
});

describe('GET /api/backgrounds/rotate: when every source fails', () => {
  it('keeps the cached picture, says so once, and rests the sources', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', ...rotating([IMMICH, UNSPLASH]) }));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH, UNSPLASH], 0) });
    mockPick.mockRejectedValue(new Error('away'));

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-old.jpg' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('immich: away');
    expect(cacheState.value.s1).toMatchObject({ path: '/api/backgrounds/serve?file=rotation-immich-old.jpg', failedAt: expect.any(Number) });
  });

  it('answers the own picture when nothing was cached, and records the rest', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', ...rotating() }));
    mockPick.mockResolvedValue(null);

    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/bg.jpg' });
    expect(cacheState.value.s1).toMatchObject({ path: '', failedAt: expect.any(Number) });
  });

  it('asks no source again inside the back-off, and asks again after it', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundImage: '/bg.jpg', ...rotating() }));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH], 0, 60, { failedAt: Date.now() - FAILURE_BACKOFF_MS + 10_000 }) });

    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-old.jpg', fresh: false });
    expect(mockPick).not.toHaveBeenCalled();

    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH], 0, 60, { failedAt: Date.now() - FAILURE_BACKOFF_MS - 1 }) });
    mockPick.mockResolvedValue(picked('fresh'));
    expect((await (await GET(rotateReq())).json()).path).toBe('/api/backgrounds/serve?file=rotation-immich-fresh.jpg');
  });
});

describe('GET /api/backgrounds/rotate: the cache', () => {
  it('serves a fresh entry for the same sources and interval without asking any source', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-now.jpg') });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-now.jpg', fresh: false });
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('picks again once the interval has passed', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([IMMICH], 30)));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH], Date.now() - 31 * 60_000, 30) });
    mockPick.mockResolvedValue(picked('new'));

    expect((await (await GET(rotateReq())).json()).path).toBe('/api/backgrounds/serve?file=rotation-immich-new.jpg');
  });

  it('picks again at once when a source changes, even mid-interval', async () => {
    const otherAlbum: PhotoSource = { kind: 'immich', albumIds: ['def-456'] };
    mockFindScreen.mockReturnValue(screen(rotating([otherAlbum])));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH]) });
    mockPick.mockResolvedValue(picked('new'));

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-new.jpg', fresh: true });
    expect(cacheState.value.s1).toMatchObject({ sourceKey: rotationCacheKey({ sources: [otherAlbum], intervalMinutes: 60 }) });
  });

  it('keys the cache on the sources as a set, so their order does not refetch', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([UNSPLASH, IMMICH])));
    seedCache({ s1: entry('rotation-immich-now.jpg', [IMMICH, UNSPLASH]) });

    expect(await (await GET(rotateReq())).json()).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-now.jpg', fresh: false });
  });

  it('picks again at once when the interval changes', async () => {
    mockFindScreen.mockReturnValue(screen(rotating([IMMICH], 15)));
    seedCache({ s1: entry('rotation-immich-old.jpg', [IMMICH], Date.now(), 60) });
    mockPick.mockResolvedValue(null);

    await GET(rotateReq());

    expect(mockPick).toHaveBeenCalledTimes(1);
  });

  it('does not answer a cached library picture whose file is gone', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-gone.jpg') });
    fsMock.access.mockRejectedValue(new Error('ENOENT'));
    mockPick.mockResolvedValue(picked('new'));

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-new.jpg', fresh: true });
    expect(mockPick).toHaveBeenCalledWith(IMMICH, expect.anything(), undefined);
  });

  it('keeps an entry another screen committed while this pick was in flight', async () => {
    // The route reads the whole cache, then waits on the network; a rotation
    // that finished for another screen in between must survive the write.
    mockFindScreen.mockReturnValue(screen(rotating()));
    mockPick.mockImplementation(async () => {
      cacheState.value = { ...cacheState.value, s2: entry('rotation-unsplash-other.jpg', [UNSPLASH]) };
      return picked('mine');
    });

    await GET(rotateReq());

    expect(Object.keys(cacheState.value).sort()).toEqual(['s1', 's2']);
  });
});

describe('GET /api/backgrounds/rotate?force=true', () => {
  it('picks again mid-interval and records when', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-now.jpg') });
    mockPick.mockResolvedValue(picked('forced'));

    const json = await (await GET(rotateReq('?screenId=s1&force=true'))).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-forced.jpg', fresh: true });
    expect(cacheState.value.s1).toMatchObject({ forcedAt: expect.any(Number) });
  });

  it('answers the cache when the last forced refresh was moments ago', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-now.jpg', [IMMICH], 0, 60, { forcedAt: Date.now() - FORCE_SPACING_MS + 1_000 }) });

    const json = await (await GET(rotateReq('?screenId=s1&force=true'))).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-now.jpg', fresh: false });
    expect(mockPick).not.toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate: rotation file pruning', () => {
  it('deletes old unreferenced rotation files but never user files or referenced ones', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    // Another screen's cache entry still references one rotation file.
    seedCache({ s2: entry('rotation-unsplash-kept.jpg', [UNSPLASH], 0) });
    mockPick.mockResolvedValue(picked('now'));

    const stale = Array.from({ length: 10 }, (_, i) => `rotation-icloud-stale${i}.jpg`);
    libraryHolds([
      ...stale.map((name) => ({ name })),
      { name: 'icloud-userimport.jpg' },        // a household import, no rotation- prefix
      { name: 'rotation-unsplash-kept.jpg' },   // referenced by s2's cache entry
      { name: 'icloud-imports', isFile: false }, // a folder, not a file
    ]);
    // mtimeMs grows with the stale index, so stale0 and stale1 are the oldest.
    fsMock.stat.mockImplementation(async (p: unknown) => ({
      mtimeMs: Number(String(p).match(/stale(\d+)/)?.[1] ?? 99),
    }));

    await GET(rotateReq());

    const unlinked = fsMock.unlink.mock.calls.map(([p]) => String(p).split(/[\\/]/).pop()).sort();
    // 10 unreferenced candidates (the new file is referenced by s1 now), newest 8 kept.
    expect(unlinked).toEqual(['rotation-icloud-stale0.jpg', 'rotation-icloud-stale1.jpg']);
    // Their wall-sized copies go with them.
    expect(vi.mocked(removeThumbnails).mock.calls.map(([name]) => name).sort()).toEqual(unlinked);
  });

  it('does not prune on a request that served from cache', async () => {
    mockFindScreen.mockReturnValue(screen(rotating()));
    seedCache({ s1: entry('rotation-immich-old.jpg') });

    await GET(rotateReq());

    expect(fsMock.readdir).not.toHaveBeenCalled();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });
});
