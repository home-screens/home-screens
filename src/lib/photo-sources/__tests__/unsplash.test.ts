import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/unsplash', () => ({
  UNSPLASH_API: 'https://api.unsplash.com',
  getUnsplashAccessKey: vi.fn(),
  trackDownload: vi.fn(),
}));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});
vi.mock('@/lib/library-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library-import')>();
  return { ...actual, importPictureToLibrary: vi.fn(async () => ({ path: 'unsplash/unsplash-x.jpg', reused: false })) };
});

import { fetchWithTimeout, SetupError } from '@/lib/api-utils';
import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { importPictureToLibrary } from '@/lib/library-import';
import { unsplashPhotoSource } from '../unsplash';
import { PhotoSourceError } from '../types';

const mockFetch = vi.mocked(fetchWithTimeout);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function photo(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    description: `photo ${id}`,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=1`, regular: `https://images.unsplash.com/r-${id}`, small: `https://images.unsplash.com/s-${id}` },
    links: { download_location: `https://api.unsplash.com/photos/${id}/download?ixid=1` },
    user: { name: `Taylor ${id}` },
    ...extra,
  };
}

let querySeq = 0;
/** Fresh search words per test, so the hour-long list cache never carries over. */
function freshQuery() {
  querySeq += 1;
  return `lakes ${querySeq}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUnsplashAccessKey).mockResolvedValue('KEY');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('unsplashPhotoSource.list', () => {
  it('asks for one request of random photos and hotlinks them with the photographer credited', async () => {
    const query = freshQuery();
    mockFetch.mockResolvedValue(json([photo('a'), photo('b')]));

    const items = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query }, count: 100, media: 'photos' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&count=30&content_filter=high`);
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Client-ID KEY' });
    expect(items).toEqual([
      { url: 'https://images.unsplash.com/photo-a?ixid=1&w=1920&q=80&fm=jpg&fit=max', type: 'image', credit: { name: 'Taylor a', source: 'Unsplash' } },
      { url: 'https://images.unsplash.com/photo-b?ixid=1&w=1920&q=80&fm=jpg&fit=max', type: 'image', credit: { name: 'Taylor b', source: 'Unsplash' } },
    ]);
  });

  it('tracks each photo used, and only ever against Unsplash itself', async () => {
    mockFetch.mockResolvedValue(json([photo('a'), photo('b', { links: { download_location: 'https://elsewhere.example/steal' } })]));

    await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: freshQuery() }, count: 5, media: 'photos' });

    expect(trackDownload).toHaveBeenCalledTimes(1);
    expect(trackDownload).toHaveBeenCalledWith('https://api.unsplash.com/photos/a/download?ixid=1', 'KEY');
  });

  it('keeps a search for an hour to stay under the free plan', async () => {
    vi.useFakeTimers();
    const source = { kind: 'unsplash' as const, query: freshQuery() };
    mockFetch.mockImplementation(async () => json([photo('a')]));

    await unsplashPhotoSource.list({ source, count: 10, media: 'photos' });
    await unsplashPhotoSource.list({ source: { ...source, query: source.query.toUpperCase() }, count: 10, media: 'photos' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60_000 + 1);
    await unsplashPhotoSource.list({ source, count: 10, media: 'photos' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('answers nothing for no search words, without a request', async () => {
    expect(await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: '' }, count: 10, media: 'photos' })).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('answers nothing when Unsplash finds nothing', async () => {
    mockFetch.mockResolvedValue(json({ errors: ['No photos found.'] }, 404));
    expect(await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: freshQuery() }, count: 10, media: 'photos' })).toEqual([]);
  });

  it('needs a key, and says so as a setup problem', async () => {
    vi.mocked(getUnsplashAccessKey).mockResolvedValue(null);
    const error = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: freshQuery() }, count: 10, media: 'photos' }).catch((e) => e);
    expect(error).toBeInstanceOf(SetupError);
    expect(error.needs).toBe('key');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('says a refused key is a setup problem, and any other failure is 502', async () => {
    mockFetch.mockResolvedValueOnce(json({}, 401));
    const refused = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: freshQuery() }, count: 10, media: 'photos' }).catch((e) => e);
    expect(refused).toBeInstanceOf(SetupError);
    expect(refused.needs).toBe('invalidKey');
    mockFetch.mockResolvedValueOnce(json({}, 500));
    const down = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: freshQuery() }, count: 10, media: 'photos' }).catch((e) => e);
    expect(down).toBeInstanceOf(PhotoSourceError);
    expect(down.status).toBe(502);
  });
});

describe('unsplashPhotoSource.pickOne', () => {
  it.each([
    [{ w: 1080, h: 1920 }, 'portrait'],
    [{ w: 3840, h: 2160 }, 'landscape'],
    [{ w: 1000, h: 1050 }, 'squarish'],
  ])('asks for a photo shaped like a %j wall and crops the download to it', async (canvas, orientation) => {
    mockFetch.mockResolvedValueOnce(json(photo('p')));

    const picked = await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'sea' }, canvas });

    expect(mockFetch.mock.calls[0][0]).toBe(`https://api.unsplash.com/photos/random?query=sea&orientation=${orientation}&content_filter=high`);
    expect(picked).toMatchObject({ kind: 'download', id: 'p' });
    expect(trackDownload).toHaveBeenCalledTimes(1);
    mockFetch.mockResolvedValueOnce(new Response('img'));
    await (picked as { open: () => Promise<Response> }).open();
    expect(mockFetch.mock.calls[1][0]).toBe(`https://images.unsplash.com/photo-p?ixid=1&fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`);
  });

  it('has nothing without search words or when Unsplash fails', async () => {
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '' }, canvas: { w: 1, h: 1 } })).toBeNull();
    mockFetch.mockResolvedValueOnce(json({}, 500));
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'x' }, canvas: { w: 1, h: 1 } })).toBeNull();
  });

  it('draws from the collections instead of the words when any are named, after checking each one', async () => {
    mockFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/collections/11') || u.endsWith('/collections/22')) return json({ id: u.slice(-2), total_photos: 5 });
      return json(photo('c'));
    });
    const picked = await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'ignored', collections: ['11', '22'] }, canvas: { w: 1080, h: 1920 } });
    const urls = mockFetch.mock.calls.map(([url]) => String(url));
    expect(urls.slice(0, 2).sort()).toEqual(['https://api.unsplash.com/collections/11', 'https://api.unsplash.com/collections/22']);
    expect(urls[2]).toBe('https://api.unsplash.com/photos/random?collections=11%2C22&orientation=portrait&content_filter=high');
    expect(picked).toMatchObject({ kind: 'download', id: 'c' });
    // The check is remembered: the next pick goes straight to the photos.
    mockFetch.mockClear();
    await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'ignored', collections: ['11', '22'] }, canvas: { w: 1080, h: 1920 } });
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual(['https://api.unsplash.com/photos/random?collections=11%2C22&orientation=portrait&content_filter=high']);
  });

  it('never asks for random photos of a collection Unsplash does not know', async () => {
    // `/photos/random?collections=<unknown>` answers random photos from all of
    // Unsplash, so a typo would put anything on the wall. Unknown ids are
    // dropped; when none is known the source says so.
    mockFetch.mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/collections/typo')) return json({ errors: ['Not found'] }, 404);
      if (u.endsWith('/collections/33')) return json({ id: '33', total_photos: 2 });
      if (u.endsWith('/collections/bare')) return json({ id: 'bare', total_photos: 0 });
      return json(photo('k'));
    });
    await expect(unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '', collections: ['typo'] }, canvas: { w: 1, h: 1 } }))
      .rejects.toMatchObject({ status: 404, body: { error: 'unsplash-collection-missing' } });
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual(['https://api.unsplash.com/collections/typo']);

    mockFetch.mockClear();
    const picked = await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '', collections: ['typo', '33'] }, canvas: { w: 1, h: 1 } });
    expect(picked).toMatchObject({ kind: 'download', id: 'k' });
    expect(mockFetch.mock.calls.map(([url]) => String(url)).at(-1)).toBe('https://api.unsplash.com/photos/random?collections=33&orientation=squarish&content_filter=high');

    // Known but empty: nothing to show, and no random request either.
    mockFetch.mockClear();
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '', collections: ['bare'] }, canvas: { w: 1, h: 1 } })).toBeNull();
    expect(await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: '', collections: ['bare'] }, count: 5, media: 'photos' })).toEqual([]);
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual(['https://api.unsplash.com/collections/bare']);
  });

  it('reads the list that exists as the mode, whatever the other fields hold', async () => {
    // The editor keeps words and collections on the entry while picks are
    // the mode, and words while collections are: only the mode's list counts.
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'lake', collections: ['11'], photoIds: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: 'lake', collections: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('picks one of the hand-picked photos by id, avoiding the one showing, and tracks it', async () => {
    mockFetch.mockResolvedValueOnce(json(photo('p2')));
    const picked = await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '', photoIds: ['p1', 'p2'] }, canvas: { w: 1080, h: 1920 }, previous: 'rotation-unsplash-p1.jpg' });
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.unsplash.com/photos/p2');
    expect(picked).toMatchObject({ kind: 'download', id: 'p2' });
    expect(trackDownload).toHaveBeenCalledTimes(1);
    expect(await unsplashPhotoSource.pickOne({ source: { kind: 'unsplash', query: '', photoIds: [] }, canvas: { w: 1, h: 1 } })).toBeNull();
  });
});

describe('unsplashPhotoSource.list with collections and picks', () => {
  it('asks the collections for random photos once each is known to hold some', async () => {
    mockFetch.mockResolvedValueOnce(json({ id: '77', total_photos: 3 }));
    mockFetch.mockResolvedValueOnce(json([photo('a')]));
    const items = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: '', collections: ['77'] }, count: 10, media: 'photos' });
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.unsplash.com/collections/77',
      'https://api.unsplash.com/photos/random?collections=77&count=10&content_filter=high',
    ]);
    expect(items).toHaveLength(1);
  });

  it('looks each hand-picked photo up and hotlinks it with its credit', async () => {
    mockFetch.mockImplementation(async (url) => json(photo(String(url).endsWith('/x1') ? 'x1' : 'x2')));
    const items = await unsplashPhotoSource.list({ source: { kind: 'unsplash', query: '', photoIds: ['x1', 'x2'] }, count: 10, media: 'photos' });
    expect(mockFetch.mock.calls.map(([url]) => url).sort()).toEqual(['https://api.unsplash.com/photos/x1', 'https://api.unsplash.com/photos/x2']);
    expect(items).toEqual([
      { url: 'https://images.unsplash.com/photo-x1?ixid=1&w=1920&q=80&fm=jpg&fit=max', type: 'image', credit: { name: 'Taylor x1', source: 'Unsplash' } },
      { url: 'https://images.unsplash.com/photo-x2?ixid=1&w=1920&q=80&fm=jpg&fit=max', type: 'image', credit: { name: 'Taylor x2', source: 'Unsplash' } },
    ]);
    expect(trackDownload).toHaveBeenCalledTimes(2);
  });
});

describe('unsplashPhotoSource.browse: the photos already picked', () => {
  it('answers a tile for a photo a search already showed without asking Unsplash again', async () => {
    mockFetch.mockResolvedValue(json({ results: [photo('seen1'), photo('seen2')], total_pages: 1 }));
    await unsplashPhotoSource.browse({ collection: 'search', query: freshQuery(), page: 1 });
    mockFetch.mockClear();

    const page = await unsplashPhotoSource.browse({ collection: 'picked', page: 1, refs: ['seen2', 'seen1'] });

    expect(page).toEqual({
      items: [
        { ref: 'seen2', thumbUrl: 'https://images.unsplash.com/s-seen2', label: 'photo seen2', credit: { name: 'Taylor seen2' } },
        { ref: 'seen1', thumbUrl: 'https://images.unsplash.com/s-seen1', label: 'photo seen1', credit: { name: 'Taylor seen1' } },
      ],
      nextPage: null,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('looks up a photo it has not seen, once', async () => {
    mockFetch.mockResolvedValue(json(photo('new1')));

    const first = await unsplashPhotoSource.browse({ collection: 'picked', page: 1, refs: ['new1'] });
    const again = await unsplashPhotoSource.browse({ collection: 'picked', page: 1, refs: ['new1'] });

    expect(first.items.map((item) => item.ref)).toEqual(['new1']);
    expect(again).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://api.unsplash.com/photos/new1');
  });

  it('leaves out a photo that is gone or could not be asked about, and keeps the rest', async () => {
    mockFetch.mockImplementation(async (url) => (
      String(url).endsWith('/gone1') ? json({}, 404)
        : String(url).endsWith('/limit1') ? new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
          : json(photo('here1'))
    ));

    const page = await unsplashPhotoSource.browse({ collection: 'picked', page: 1, refs: ['gone1', 'here1', 'limit1'] });

    expect(page.items.map((item) => item.ref)).toEqual(['here1']);
  });

  it('looks up at most twenty photos in one request', async () => {
    mockFetch.mockImplementation(async (url) => json(photo(String(url).split('/').pop()!)));
    const refs = Array.from({ length: 30 }, (_, i) => `many${i}`);

    const page = await unsplashPhotoSource.browse({ collection: 'picked', page: 1, refs });

    expect(mockFetch).toHaveBeenCalledTimes(20);
    expect(page.items).toHaveLength(20);
  });

  it('asks nothing when nothing is picked', async () => {
    expect(await unsplashPhotoSource.browse({ collection: 'picked', page: 1 })).toEqual({ items: [], nextPage: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('unsplashPhotoSource.browse', () => {
  it('searches a page at a time with small tiles and credits, and pages until the last', async () => {
    mockFetch.mockResolvedValue(json({ results: [photo('a'), { id: 'no-pictures' }], total_pages: 3 }));

    const page = await unsplashPhotoSource.browse({ collection: 'search', query: ' mountains ', page: 2, orientation: 'portrait' });

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.unsplash.com/search/photos?query=mountains&page=2&per_page=30&content_filter=high&orientation=portrait');
    expect(page).toEqual({
      items: [{ ref: 'a', thumbUrl: 'https://images.unsplash.com/s-a', label: 'photo a', credit: { name: 'Taylor a' } }],
      nextPage: 3,
    });
    mockFetch.mockResolvedValue(json({ results: [], total_pages: 3 }));
    expect((await unsplashPhotoSource.browse({ collection: 'search', query: 'mountains', page: 3 })).nextPage).toBeNull();
  });

  it('keeps a page for an hour, so going back to an idea costs no request', async () => {
    mockFetch.mockResolvedValue(json({ results: [photo('c')], total_pages: 1 }));
    await unsplashPhotoSource.browse({ collection: 'search', query: 'Lakes', page: 1 });
    await unsplashPhotoSource.browse({ collection: 'search', query: 'lakes', page: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("says when the free plan's hourly requests are used up", async () => {
    mockFetch.mockResolvedValue(new Response('Rate Limit Exceeded', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
    const error = await unsplashPhotoSource.browse({ collection: 'search', query: 'rivers', page: 1 }).catch((e: unknown) => e) as PhotoSourceError;
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error).toMatchObject({ status: 429, body: { error: 'unsplash-rate-limit' } });
  });

  it('answers nothing without search words, without a request', async () => {
    expect(await unsplashPhotoSource.browse({ collection: 'search', query: '  ', page: 1 })).toEqual({ items: [], nextPage: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('unsplashPhotoSource.importOne', () => {
  it('looks the photo up by id, tracks it, and copies a large version into the folder', async () => {
    await unsplashPhotoSource.importOne({ ref: 'abc', folder: 'unsplash' });
    const pick = vi.mocked(importPictureToLibrary).mock.calls[0][0];
    expect(pick).toMatchObject({ kind: 'unsplash', id: 'abc', folder: 'unsplash' });

    mockFetch.mockResolvedValueOnce(json(photo('abc'))).mockResolvedValueOnce(new Response('img'));
    const opened = await pick.open();
    // The photo's own description names the copy.
    expect(opened).toMatchObject({ title: 'photo abc' });
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.unsplash.com/photos/abc');
    expect(mockFetch.mock.calls[1][0]).toBe('https://images.unsplash.com/photo-abc?ixid=1&w=2560&q=85&fm=jpg&fit=max');
    expect(trackDownload).toHaveBeenCalledWith('https://api.unsplash.com/photos/abc/download?ixid=1', 'KEY');
  });

  it('says a photo that is gone is gone', async () => {
    await unsplashPhotoSource.importOne({ ref: 'gone', folder: 'unsplash' });
    const pick = vi.mocked(importPictureToLibrary).mock.calls[0][0];
    mockFetch.mockResolvedValueOnce(json({}, 404));
    const error = await pick.open().catch((e: unknown) => e) as PhotoSourceError;
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(404);
  });
});
