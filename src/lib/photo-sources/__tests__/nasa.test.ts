import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});
vi.mock('@/lib/library-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library-import')>();
  return { ...actual, importPictureToLibrary: vi.fn(async () => ({ path: 'nasa/nasa-x.jpg', reused: false })) };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { importPictureToLibrary, UnsupportedImageFormatError } from '@/lib/library-import';
import { nasaPhotoSource, __test } from '../nasa';
import { PhotoSourceError } from '../types';

const mockFetch = vi.mocked(fetchWithTimeout);

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const ASSETS = 'https://assets.science.nasa.gov/dynamicimage/assets/science/cds/apod/apod';

/** One Astronomy Picture of the Day post as science.nasa.gov's WordPress API answers it. */
function post(date: string, title: string, picture: string | null = `${ASSETS}/${date}.jpg`) {
  return {
    date: `${date}T00:05:00`,
    title: { rendered: `APOD: ${date.slice(0, 4)} November 1 &#8211; ${title}` },
    _embedded: picture ? { 'wp:featuredmedia': [{ source_url: picture, mime_type: 'image/jpeg' }] } : {},
  };
}

/** The query of the n-th upstream request. */
function queryOf(n: number): URLSearchParams {
  return new URL(String(mockFetch.mock.calls[n][0])).searchParams;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('APOD posts', () => {
  it('reads the title without its date, with HTML entities decoded', () => {
    expect(__test.apodTitle('APOD: 2026 November 1 \u2013 Colors of the Moon')).toBe('Colors of the Moon');
    expect(__test.apodTitle('APOD: 2026 October 9 &#8211; Saturn&#8217;s Rings &amp; Moons')).toBe('Saturn\u2019s Rings & Moons');
  });

  it('counts a day forward across months and years', () => {
    expect(__test.nextDay('2026-10-31')).toBe('2026-11-01');
    expect(__test.nextDay('2026-12-31')).toBe('2027-01-01');
  });
});

describe('nasaPhotoSource.list', () => {
  it('lists the newest pictures of the day from science.nasa.gov, with no key', async () => {
    mockFetch.mockResolvedValue(json([post('2026-11-01', 'Colors of the Moon'), post('2026-10-31', 'A day with no picture', null), post('2026-10-30', 'Cepheus')], 200, { 'x-wp-totalpages': '1' }));

    const items = await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 3, media: 'photos' });

    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://science.nasa.gov/wp-json/wp/v2/image-article');
    expect(queryOf(0).get('categories')).toBe('22766');
    expect(queryOf(0).get('per_page')).toBe('3');
    expect(queryOf(0).get('_embed')).toBe('wp:featuredmedia');
    expect(queryOf(0).has('api_key')).toBe(false);
    expect(items).toEqual([
      { url: `${ASSETS}/2026-11-01.jpg`, type: 'image' },
      { url: `${ASSETS}/2026-10-30.jpg`, type: 'image' },
    ]);
  });

  it('keeps a list for an hour', async () => {
    mockFetch.mockResolvedValue(json([post('2026-11-01', 'Moon')]));
    await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 4, media: 'photos' });
    await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 4, media: 'both' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('pages past the 100 posts WordPress hands out at once', async () => {
    const many = (n: number, from: number) => Array.from({ length: n }, (_, i) => post(`2026-01-${String(((from + i) % 28) + 1).padStart(2, '0')}`, `Day ${from + i}`));
    mockFetch
      .mockResolvedValueOnce(json(many(100, 0), 200, { 'x-wp-totalpages': '40' }))
      .mockResolvedValueOnce(json(many(100, 100), 200, { 'x-wp-totalpages': '40' }));
    const items = await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 150, media: 'photos' });
    expect(items).toHaveLength(150);
    expect(queryOf(1).get('page')).toBe('2');
  });

  it('has no videos to give', async () => {
    expect(await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 5, media: 'videos' })).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("says NASA isn't sending pictures when the site fails", async () => {
    mockFetch.mockResolvedValue(json({ code: 'oops' }, 503));
    const error = await nasaPhotoSource.list({ source: { kind: 'nasa' }, count: 7, media: 'photos' }).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error).toMatchObject({ status: 503, body: { error: 'apod-unavailable' } });
  });
});

describe('nasaPhotoSource.pickOne', () => {
  it("downloads the newest picture, keyed by its day", async () => {
    mockFetch.mockResolvedValueOnce(json([post('2026-11-01', 'Moon')]));
    const picked = await nasaPhotoSource.pickOne({ source: { kind: 'nasa' }, canvas: { w: 1080, h: 1920 } });
    expect(picked).toMatchObject({ kind: 'download', id: '2026-11-01' });
    expect(queryOf(0).get('per_page')).toBe('1');
    mockFetch.mockResolvedValueOnce(new Response('img'));
    if (picked?.kind === 'download') await picked.open();
    expect(mockFetch.mock.calls[1][0]).toBe(`${ASSETS}/2026-11-01.jpg`);
  });

  it('has nothing when no day has a picture', async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    expect(await nasaPhotoSource.pickOne({ source: { kind: 'nasa' }, canvas: { w: 1080, h: 1920 } })).toBeNull();
  });
});

describe('nasaPhotoSource.browse', () => {
  it('pages the pictures of the day 30 at a time, newest first, with small tiles', async () => {
    mockFetch.mockResolvedValueOnce(json([post('2026-11-01', 'Colors of the Moon')], 200, { 'x-wp-totalpages': '330' }));

    const page = await nasaPhotoSource.browse({ collection: 'apod', page: 2 });

    expect(queryOf(0).get('per_page')).toBe('30');
    expect(queryOf(0).get('page')).toBe('2');
    expect(page).toEqual({
      items: [{
        ref: 'apod:2026-11-01',
        thumbUrl: `${ASSETS}/2026-11-01.jpg?w=480&h=480&fit=crop`,
        label: 'Colors of the Moon',
        secondary: '2026-11-01',
      }],
      nextPage: 3,
    });
  });

  it('stops at the last page, and treats a page past the end as empty', async () => {
    mockFetch.mockResolvedValueOnce(json([post('1995-06-16', 'Neutron Star')], 200, { 'x-wp-totalpages': '330' }));
    expect((await nasaPhotoSource.browse({ collection: 'apod', page: 330 })).nextPage).toBeNull();
    mockFetch.mockResolvedValueOnce(json({ code: 'rest_post_invalid_page_number' }, 400));
    expect(await nasaPhotoSource.browse({ collection: 'apod', page: 331 })).toEqual({ items: [], nextPage: null });
  });

  it("searches NASA's image library, which needs no key, and pages by hits", async () => {
    mockFetch.mockImplementation(async () => json({ collection: {
      items: [
        { data: [{ nasa_id: 'PIA123', title: 'Nebula', date_created: '2020-01-02T00:00:00Z' }], links: [{ href: 'https://images-assets.nasa.gov/image/PIA123/PIA123~thumb.jpg' }] },
        { data: [{ nasa_id: 'bad/id', title: 'Odd' }], links: [{ href: 'https://x' }] },
        { data: [{ nasa_id: 'NOLINK' }] },
      ],
      metadata: { total_hits: 75 },
    } }));

    const page = await nasaPhotoSource.browse({ collection: 'search', query: 'nebula', page: 2 });

    expect(mockFetch.mock.calls[0][0]).toBe('https://images-api.nasa.gov/search?q=nebula&media_type=image&page=2&page_size=30');
    expect(page).toEqual({
      items: [{ ref: 'image:PIA123', thumbUrl: 'https://images-assets.nasa.gov/image/PIA123/PIA123~thumb.jpg', label: 'Nebula', secondary: '2020-01-02' }],
      nextPage: 3,
    });
    expect((await nasaPhotoSource.browse({ collection: 'search', query: 'nebula', page: 3 })).nextPage).toBeNull();
  });

  it('answers nothing for a search without words, and 502 when the library is away', async () => {
    expect(await nasaPhotoSource.browse({ collection: 'search', query: '', page: 1 })).toEqual({ items: [], nextPage: null });
    expect(mockFetch).not.toHaveBeenCalled();
    mockFetch.mockResolvedValue(json({}, 500));
    const error = await nasaPhotoSource.browse({ collection: 'search', query: 'moon', page: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(502);
  });
});

describe('nasaPhotoSource.importOne', () => {
  it("copies one day's picture, asking the site for that day only", async () => {
    mockFetch.mockResolvedValueOnce(json([post('2026-10-15', 'Comet')]));

    await nasaPhotoSource.importOne({ ref: 'apod:2026-10-15', folder: 'nasa' });

    expect(queryOf(0).get('after')).toBe('2026-10-15T00:00:00');
    expect(queryOf(0).get('before')).toBe('2026-10-16T00:00:00');
    const pick = vi.mocked(importPictureToLibrary).mock.calls[0][0];
    expect(pick).toMatchObject({ kind: 'nasa', id: '2026-10-15', folder: 'nasa', urlHint: `${ASSETS}/2026-10-15.jpg` });
    mockFetch.mockResolvedValueOnce(new Response('img'));
    await pick.open();
    expect(mockFetch.mock.calls[1][0]).toBe(`${ASSETS}/2026-10-15.jpg`);
  });

  it('says a day without a picture has nothing to save', async () => {
    mockFetch.mockResolvedValueOnce(json([]));
    const error = await nasaPhotoSource.importOne({ ref: 'apod:2026-10-15', folder: 'nasa' }).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoSourceError);
    expect(error.status).toBe(404);
    expect(importPictureToLibrary).not.toHaveBeenCalled();
  });

  it("copies the largest web picture of a library entry, over https", async () => {
    mockFetch.mockResolvedValueOnce(json({ collection: { items: [
      { href: 'http://images-assets.nasa.gov/image/PIA1/PIA1~orig.tif' },
      { href: 'http://images-assets.nasa.gov/image/PIA1/PIA1~large.jpg' },
      { href: 'http://images-assets.nasa.gov/image/PIA1/PIA1~orig.jpg' },
      { href: 'http://images-assets.nasa.gov/image/PIA1/metadata.json' },
    ] } }));

    await nasaPhotoSource.importOne({ ref: 'image:PIA1', folder: 'nasa' });

    expect(mockFetch.mock.calls[0][0]).toBe('https://images-api.nasa.gov/asset/PIA1');
    expect(vi.mocked(importPictureToLibrary).mock.calls[0][0]).toMatchObject({
      kind: 'nasa', id: 'PIA1', urlHint: 'https://images-assets.nasa.gov/image/PIA1/PIA1~orig.jpg',
    });
  });

  it('refuses an entry that only has TIFFs, which the display cannot show', async () => {
    mockFetch.mockResolvedValueOnce(json({ collection: { items: [{ href: 'https://images-assets.nasa.gov/image/T/T~orig.tif' }] } }));
    const error = await nasaPhotoSource.importOne({ ref: 'image:T', folder: 'nasa' }).catch((e) => e);
    expect(error).toBeInstanceOf(UnsupportedImageFormatError);
    expect(importPictureToLibrary).not.toHaveBeenCalled();
  });

  it('says a library entry that is gone is gone', async () => {
    mockFetch.mockResolvedValueOnce(json({}, 404));
    const error = await nasaPhotoSource.importOne({ ref: 'image:GONE', folder: 'nasa' }).catch((e) => e);
    expect(error.status).toBe(404);
  });
});
