import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});
vi.mock('@/lib/library-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library-import')>();
  return { ...actual, importPictureToLibrary: vi.fn(async () => ({ path: 'art/x.jpg', reused: false })) };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { importPictureToLibrary } from '@/lib/library-import';
import { artCount, artPhotoSource, artPickableSource, isOpenLicense, __test } from '../art';
import { PhotoSourceError } from '../types';
import type { PhotoSource } from '@/types/config';

const mockFetch = vi.mocked(fetchWithTimeout);
type Art = Extract<PhotoSource, { kind: 'art' }>;
const art = (over: Partial<Art> = {}): Art => ({ kind: 'art', provider: 'wikimedia', ...over });
const CANVAS = { w: 1080, h: 1920 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function upstream(routes: Record<string, (url: string, init?: RequestInit) => Response>) {
  mockFetch.mockImplementation(async (input, init) => {
    const url = String(input);
    const text = decodeURIComponent(url.replace(/\+/g, ' '));
    const hit = Object.keys(routes).find((fragment) => text.includes(fragment));
    if (!hit) throw new Error(`unexpected request ${url}`);
    return routes[hit](url, init);
  });
}
const sparqls = () => mockFetch.mock.calls.map((call) => String(call[0])).filter((u) => u.includes('query.wikidata.org'))
  .map((u) => new URL(u).searchParams.get('query')!.replace(/\s+/g, ' '));
const lastUrl = () => String(mockFetch.mock.calls.at(-1)![0]);

const row = (qid: string, label: string, file: string) => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  itemLabel: { value: label },
  creatorLabel: { value: 'Mihály Munkácsy' },
  image: { value: `http://commons.wikimedia.org/wiki/Special:FilePath/${file}` },
  date: { value: '1869-01-01T00:00:00Z' },
  collectionLabel: { value: 'Louvre Museum' },
});
const commons = (...files: Array<[string, string, number?, number?]>) => json({ query: { pages: Object.fromEntries(files.map(([name, license, width = 3000, height = 2000], i) => [i, {
  title: `File:${name}`, imageinfo: [{ width, height, extmetadata: { LicenseShortName: { value: license } } }],
}])) } });
const wikidata = (...rows: unknown[]) => json({ results: { bindings: rows } });
const aicHit = (over: object = {}) => ({ id: 1, title: 'Water Lilies', artist_title: 'Claude Monet', date_display: '1906', image_id: '3c27b499-af56-f0d5-93b5-a7f2f1ad5813', thumbnail: { width: 800, height: 600 }, ...over });
const clevelandHit = (id: number, over: object = {}) => ({
  id, title: `Painting ${id}`, creation_date: '1880', creators: [], images: { web: { url: `https://openaccess-cdn.clevelandart.org/${id}.jpg`, width: '1200', height: '1600' } }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  __test.cache.clear();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('licences', () => {
  it('accepts public domain, CC0 and CC BY; rejects non-commercial, no-derivatives and unknown', () => {
    for (const ok of ['Public domain', 'CC0', 'CC BY-SA 4.0', 'PDM 1.0']) expect(isOpenLicense(ok)).toBe(true);
    for (const no of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'All rights reserved', '', null]) expect(isOpenLicense(no)).toBe(false);
  });
});

describe('wikimedia stream', () => {
  const wire = (rows: unknown[], files: Array<[string, string, number?, number?]>) => upstream({
    wbsearchentities: () => json({ search: [{ id: 'Q551652' }] }),
    'query.wikidata.org': () => wikidata(...rows),
    'commons.wikimedia.org/w/api.php': () => commons(...files),
  });

  it('keeps only open licences and credits the ones that ask for it', async () => {
    wire(
      [row('Q1', 'Christ before Pilate', 'Pilate.jpg'), row('Q2', 'Locked', 'Locked.jpg'), row('Q3', 'Q3', 'NoLabel.jpg'), { ...row('Q4', 'Unattributed', 'Orphan.jpg'), creatorLabel: { value: 'http://www.wikidata.org/.well-known/genid/a' }, collectionLabel: { value: 'http://www.wikidata.org/.well-known/genid/b' } }],
      [['Pilate.jpg', 'CC BY-SA 4.0'], ['Locked.jpg', 'CC BY-NC 4.0'], ['NoLabel.jpg', 'Public domain'], ['Orphan.jpg', 'Public domain']],
    );
    const items = await artPhotoSource.list({ source: art({ artist: 'Munkácsy' }), count: 10, media: 'photos' });

    expect(items).toHaveLength(2);
    expect(items).toEqual(expect.arrayContaining([{
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Pilate.jpg?width=1920',
      type: 'image',
      credit: { name: 'Christ before Pilate, Mihály Munkácsy, 1869', source: 'Louvre Museum, CC BY-SA 4.0' },
    }, {
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Orphan.jpg?width=1920',
      type: 'image',
      credit: { name: 'Unattributed, 1869', source: 'Wikimedia Commons' },
    }]));
    expect(sparqls()[0]).toContain('wdt:P170 wd:Q551652');
    expect(sparqls()[0]).not.toContain('wikibase:sitelinks');
  });

  it('builds the museum, period, genre and style clauses, and limits an unfiltered ask to well-known paintings', async () => {
    wire([], []);
    await artPhotoSource.list({ source: art({ museums: ['Q19675', 'Q160236'], fromYear: 1800, toYear: 1900, genre: 'portrait', style: 'Realism' }), count: 5, media: 'photos' });
    await artPhotoSource.list({ source: art(), count: 5, media: 'photos' });
    const [filtered, unfiltered] = sparqls();
    expect(filtered).toContain('{ ?item wdt:P195/wdt:P361* wd:Q19675 } UNION { ?item wdt:P195/wdt:P361* wd:Q160236 }');
    expect(filtered).toContain('YEAR(?date) >= 1800 && YEAR(?date) <= 1900');
    expect(filtered).toContain('wdt:P136 wd:Q134307');
    expect(filtered).toContain('wdt:P135 wd:Q551652 } UNION { ?item wdt:P136 wd:Q551652');
    expect(unfiltered).toContain('wikibase:sitelinks');
  });

  it('applies size and shape from Commons pixel sizes, and never asks for more than the file has', async () => {
    wire([row('Q1', 'Wide', 'Wide.jpg'), row('Q2', 'Tall', 'Tall.jpg'), row('Q3', 'Small', 'Small.jpg')], [['Wide.jpg', 'CC0', 3000, 2000], ['Tall.jpg', 'CC0', 1500, 2400], ['Small.jpg', 'CC0', 500, 700]]);
    const items = await artPhotoSource.list({ source: art({ orientation: 'portrait' }), count: 10, media: 'photos' });
    expect(items.map((i) => i.url)).toEqual(['https://commons.wikimedia.org/wiki/Special:FilePath/Tall.jpg?width=1500']);
  });

  it('answers nothing for an artist Wikidata does not know, and asks again from the start when a jumped-to page is empty', async () => {
    upstream({ wbsearchentities: () => json({ search: [] }) });
    expect(await artPhotoSource.list({ source: art({ artist: 'Nobody' }), count: 5, media: 'photos' })).toEqual([]);

    vi.mocked(Math.random).mockReturnValue(0.5);
    upstream({ 'OFFSET 0': () => wikidata(row('Q1', 'One', 'One.jpg')), 'OFFSET': () => wikidata(), 'commons.wikimedia.org/w/api.php': () => commons(['One.jpg', 'CC0']) });
    expect(await artPhotoSource.list({ source: art({ genre: 'seascape' }), count: 5, media: 'photos' })).toHaveLength(1);
  });

  it('says so when Wikidata is away', async () => {
    upstream({ 'query.wikidata.org': () => new Response('', { status: 503 }) });
    await expect(artPhotoSource.list({ source: art(), count: 5, media: 'photos' })).rejects.toMatchObject({ status: 503, body: { error: 'art-unavailable' } });
  });
});

describe('museum collections', () => {
  it('posts the Art Institute filters as one query and skips hits without a usable image', async () => {
    let body: { query: { bool: { must: unknown[] } } } | undefined;
    upstream({ 'artworks/search': (_url, init) => {
      body = JSON.parse(String(init?.body));
      return json({ data: [aicHit(), aicHit({ id: 2, image_id: 'not-a-uuid' })] });
    } });

    const items = await artPhotoSource.list({ source: art({ provider: 'aic', artist: 'Monet', fromYear: 1870, toYear: 1900, genre: 'landscape' }), count: 5, media: 'photos' });

    const text = JSON.stringify(body!.query.bool.must);
    for (const part of ['"is_public_domain":true', '"artwork_type_title":"Painting"', '"artist_title":"Monet"', '"date_end":{"gte":1870}', '"date_start":{"lte":1900}', '"subject_titles":"landscape"']) expect(text).toContain(part);
    expect(items).toEqual([{ url: 'https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg', type: 'image', credit: { name: 'Water Lilies, Claude Monet, 1906', source: 'Art Institute of Chicago' } }]);
  });

  it('asks Cleveland for CC0 paintings with the filters as search words, preferring the print copy when the web copy is too small', async () => {
    const small = clevelandHit(7, { images: { web: { url: 'https://openaccess-cdn.clevelandart.org/w.jpg', width: '400', height: '500' }, print: { url: 'https://openaccess-cdn.clevelandart.org/p.jpg', width: '3000', height: '4000' } } });
    upstream({ 'openaccess-api': () => json({ data: [small, clevelandHit(8, { images: { web: { url: 'https://elsewhere.example/x.jpg', width: '900', height: '900' } } })] }) });

    const items = await artPhotoSource.list({ source: art({ provider: 'cleveland', style: 'Impressionism', genre: 'still-life', fromYear: 1860 }), count: 5, media: 'photos' });

    const params = new URL(lastUrl()).searchParams;
    expect([params.get('cc0'), params.get('type'), params.get('q'), params.get('created_after')]).toEqual(['1', 'Painting', 'Impressionism still life', '1860']);
    expect(items.map((i) => i.url)).toEqual(['https://openaccess-cdn.clevelandart.org/p.jpg']);
  });
});

describe('background picks', () => {
  const body = () => sharp({ create: { width: 160, height: 100, channels: 3, background: '#2060c0' } }).jpeg().toBuffer();
  const wire = async () => {
    const image = await body();
    upstream({ 'openaccess-api': () => json({ data: [clevelandHit(5, { images: { web: { url: 'https://openaccess-cdn.clevelandart.org/w.jpg', width: '1600', height: '1000' } } })] }), 'openaccess-cdn': () => new Response(new Uint8Array(image), { headers: { 'content-type': 'image/jpeg' } }) });
  };
  const open = async (fit?: Art['fit']) => {
    const picked = await artPhotoSource.pickOne({ source: art({ provider: 'cleveland', minShortSide: 100, fit }), canvas: { w: 108, h: 192 } });
    const res = await (picked as { open: () => Promise<Response> }).open();
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    return { id: (picked as { id: string }).id, size: [meta.width, meta.height] };
  };

  it('hands cover the painting itself and shapes matte and contain to the canvas', async () => {
    await wire();
    expect((await open('cover')).size).toEqual([160, 100]);
    expect((await open('contain')).size).toEqual([108, 192]);
    expect(await open()).toEqual({ id: 'cleveland-5-matte-108x192', size: [108, 192] });
  });

  it('avoids the painting showing now, and answers null when nothing passes the filters', async () => {
    upstream({ 'openaccess-api': () => json({ data: [clevelandHit(1), clevelandHit(2)] }) });
    const picked = await artPhotoSource.pickOne({ source: art({ provider: 'cleveland' }), canvas: CANVAS, previous: 'rotation-art-cleveland-1-matte-1080x1920.jpg' });
    expect(picked).toMatchObject({ id: expect.stringContaining('cleveland-2-') });

    upstream({ 'openaccess-api': () => json({ data: [] }) });
    __test.cache.clear();
    expect(await artPhotoSource.pickOne({ source: art({ provider: 'cleveland' }), canvas: CANVAS })).toBeNull();
  });
});

describe('counts', () => {
  it('reads the museums\' own totals as exact', async () => {
    upstream({ 'artworks/search': () => json({ data: [], pagination: { total: 123 } }), 'openaccess-api': () => json({ data: [], info: { total: 45 } }) });
    expect(await artCount(art({ provider: 'aic' }))).toEqual({ count: 123, approximate: false });
    expect(await artCount(art({ provider: 'cleveland' }))).toEqual({ count: 45, approximate: false });
  });

  it('counts Wikidata approximately, and calls a timeout unknown without asking again at once', async () => {
    upstream({ 'COUNT(DISTINCT': () => wikidata({ n: { value: '812' } }) });
    expect(await artCount(art())).toEqual({ count: 812, approximate: true });

    __test.cache.clear();
    upstream({ 'COUNT(DISTINCT': () => { throw new Error('timeout'); } });
    expect(await artCount(art({ genre: 'nude' }))).toEqual({ count: null, approximate: true });
    await artCount(art({ genre: 'nude' }));
    expect(sparqls()).toHaveLength(2);
  });
});

describe('picker search', () => {
  const entities = (...pairs: Array<[string, string]>) => json({ results: { bindings: pairs.map(([id, role]) => ({ e: { value: `http://www.wikidata.org/entity/${id}` }, role: { value: role } })) } });

  it('reads the keyword as the museum and artist it names, in one query, and drops licence-blocked paintings', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }, { id: 'Q1461794', label: 'Louvre - Rivoli' }, { id: 'Q551652', label: 'Mihály Munkácsy' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum'], ['Q551652', 'artist']),
      'LIMIT 60': () => wikidata(row('Q1', 'Christ before Pilate', 'Pilate.jpg'), row('Q2', 'Locked', 'Locked.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Pilate.jpg', 'CC BY-SA 4.0'], ['Locked.jpg', 'CC BY-NC 4.0']),
    });

    const page = await artPickableSource.browse({ collection: 'wikimedia', page: 1, query: 'Louvre Munkácsy' });

    expect(page.matched).toEqual([{ type: 'museum', label: 'Louvre Museum' }, { type: 'artist', label: 'Mihály Munkácsy' }]);
    expect(page.items).toMatchObject([{ ref: 'wikimedia:Q1', label: 'Christ before Pilate', credit: { name: 'Mihály Munkácsy' }, secondary: '1869, Louvre Museum, CC BY-SA 4.0' }]);
    const paintings = sparqls().find((q) => q.includes('LIMIT 60'))!;
    expect(paintings).toContain('{ ?item wdt:P195/wdt:P361* wd:Q19675 } UNION { ?item wdt:P170 wd:Q551652 }');
  });

  it('pages by Wikidata rows: a full page has a next one and page 2 starts after the first', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`Q${i + 1}`, `P${i + 1}`, `P${i + 1}.jpg`));
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum']),
      'LIMIT 60': () => wikidata(...rows),
      'commons.wikimedia.org/w/api.php': () => commons(),
    });
    expect((await artPickableSource.browse({ collection: 'wikimedia', page: 1, query: 'louvre' })).nextPage).toBe(2);
    await artPickableSource.browse({ collection: 'wikimedia', page: 2, query: 'louvre' });
    expect(sparqls().at(-1)).toContain('OFFSET 60');
  });

  it('falls back to the paintings\' titles when the words name no museum, artist, movement or subject', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q5', label: 'Human' }] }),
      'SELECT ?e ?role': () => entities(),
      'mwapi:gsrsearch': () => wikidata(row('Q9', 'Sunset', 'Sunset.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Sunset.jpg', 'CC0']),
    });
    const page = await artPickableSource.browse({ collection: 'wikimedia', page: 1, query: 'sunset "quoted"' });
    expect(page).toMatchObject({ matched: [], nextPage: null, items: [{ ref: 'wikimedia:Q9' }] });
    expect(sparqls().at(-1)).toContain('gsrsearch "sunset quoted haswbstatement:P31=Q3305213"');
  });

  it('pages the Art Institute and Cleveland by their own totals', async () => {
    upstream({ 'artworks/search': () => json({ data: [aicHit()], pagination: { total_pages: 2 } }), 'openaccess-api': () => json({ data: [clevelandHit(1)], info: { total: 45 } }) });
    expect(await artPickableSource.browse({ collection: 'aic', page: 2, query: 'monet' })).toMatchObject({ nextPage: null, items: [{ ref: 'aic:1' }] });
    expect(await artPickableSource.browse({ collection: 'cleveland', page: 1, query: 'monet' })).toMatchObject({ nextPage: 2, items: [{ ref: 'cleveland:1' }] });
    expect(new URL(lastUrl()).searchParams.get('skip')).toBe('0');
  });

  it('asks nobody for empty words, and explains a museum that does not answer', async () => {
    expect(await artPickableSource.browse({ collection: 'aic', page: 1, query: ' ' })).toEqual({ items: [], nextPage: null });
    expect(mockFetch).not.toHaveBeenCalled();
    mockFetch.mockRejectedValue(new Error('timeout'));
    await expect(artPickableSource.browse({ collection: 'cleveland', page: 1, query: 'monet' })).rejects.toMatchObject({ status: 503, body: { error: 'art-unavailable' } });
  });
});

describe('import', () => {
  const open = async () => vi.mocked(importPictureToLibrary).mock.calls.at(-1)![0].open();

  it('copies an open-licence painting named after its title and artist, at library size', async () => {
    upstream({
      'query.wikidata.org': () => wikidata(row('Q1', 'Christ before Pilate', 'Pilate.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Pilate.jpg', 'Public domain']),
      'Special:FilePath': () => new Response('img'),
    });
    await artPickableSource.importOne({ ref: 'wikimedia:Q1', folder: 'art' });
    expect(vi.mocked(importPictureToLibrary).mock.calls[0][0]).toMatchObject({ kind: 'art', id: 'wikimedia:Q1', folder: 'art' });
    expect(await open()).toMatchObject({ title: 'Christ before Pilate Mihály Munkácsy' });
    expect(lastUrl()).toContain('Special:FilePath/Pilate.jpg?width=2560');
  });

  it('re-checks the licence and refuses what is not open on every provider', async () => {
    upstream({ 'query.wikidata.org': () => wikidata(row('Q2', 'Locked', 'Locked.jpg')), 'commons.wikimedia.org/w/api.php': () => commons(['Locked.jpg', 'CC BY-NC 4.0']) });
    await artPickableSource.importOne({ ref: 'wikimedia:Q2', folder: 'art' });
    expect(await open().catch((e) => e)).toMatchObject({ status: 404 });

    upstream({ 'artworks/1?': () => json({ data: { ...aicHit(), is_public_domain: false, artwork_type_title: 'Painting' } }) });
    await artPickableSource.importOne({ ref: 'aic:1', folder: 'art' });
    expect(await open().catch((e) => e)).toBeInstanceOf(PhotoSourceError);

    upstream({ 'artworks/9?': () => json({ data: { ...clevelandHit(9), type: 'Painting', share_license_status: 'Copyrighted' } }) });
    await artPickableSource.importOne({ ref: 'cleveland:9', folder: 'art' });
    expect(await open().catch((e) => e)).toMatchObject({ status: 404 });
  });
});
