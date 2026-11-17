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
const hiddenList = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('@/lib/config', () => ({ readConfig: vi.fn(async () => ({ settings: { artHidden: hiddenList.ids } })) }));
vi.mock('../art-collection.json', () => ({
  default: [
    ['Q1', 'Wheat Field.jpg', 'Wheat Field', 'Vincent van Gogh', 1888, 'Van Gogh Museum', 4000, 3000, 'landscape'],
    ['Q2', 'Harbour.jpg', 'Harbour at Dusk', 'Paul Cézanne', 1870, null, 2000, 3000, 'seascape'],
    ['Q3', 'Apples.jpg', 'Apples', 'Paul Cézanne', null, 'Louvre Museum', 1500, 1200, 'still-life'],
    ['Q4', 'Canal.jpg', 'Canal', 'Canaletto', 1730, 'National Gallery', 1600, 1000, 'cityscape'],
  ],
}));

import { fetchWithTimeout } from '@/lib/api-utils';
import { importPictureToLibrary } from '@/lib/library-import';
import { artCount, artPhotoSource, artPickableSource, isOpenLicense, __test } from '../art';
import type { PhotoSource } from '@/types/config';

const mockFetch = vi.mocked(fetchWithTimeout);
type Art = Extract<PhotoSource, { kind: 'art' }>;
const art = (over: Partial<Art> = {}): Art => ({ kind: 'art', ...over });
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
const titles = async (source: Art) => (await artPhotoSource.list({ source, count: 10, media: 'photos' })).map((item) => item.credit?.name.split(',')[0]).sort();

beforeEach(() => {
  vi.clearAllMocks();
  hiddenList.ids = [];
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

describe('the collection on a wall', () => {
  it('lists paintings from the shipped collection with their credit, and asks nobody', async () => {
    const items = await artPhotoSource.list({ source: art(), count: 10, media: 'photos' });

    expect(items).toHaveLength(4);
    expect(items).toEqual(expect.arrayContaining([{
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Wheat%20Field.jpg?width=1920',
      type: 'image',
      credit: { name: 'Wheat Field, Vincent van Gogh, 1888', source: 'Van Gogh Museum' },
    }, {
      // No museum on record, and narrower than the screen asks for: credited to Commons and asked for at its own width.
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Apples.jpg?width=1500',
      type: 'image',
      credit: { name: 'Apples, Paul Cézanne', source: 'Louvre Museum' },
    }]));
    expect(items.find((item) => item.url.includes('Harbour'))?.credit).toEqual({ name: 'Harbour at Dusk, Paul Cézanne, 1870', source: 'Wikimedia Commons' });
    expect(await artPhotoSource.list({ source: art(), count: 2, media: 'photos' })).toHaveLength(2);
    expect(await artPhotoSource.list({ source: art(), count: 10, media: 'videos' })).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('narrows by subject, by part of an artist\'s name without accents, by period and by tall or wide', async () => {
    expect(await titles(art({ genre: 'cityscape' }))).toEqual(['Canal']);
    expect(await titles(art({ artist: ' cezanne ' }))).toEqual(['Apples', 'Harbour at Dusk']);
    // A painting with no year on record is left out once a period is asked for.
    expect(await titles(art({ fromYear: 1800 }))).toEqual(['Harbour at Dusk', 'Wheat Field']);
    expect(await titles(art({ fromYear: 1700, toYear: 1880 }))).toEqual(['Canal', 'Harbour at Dusk']);
    expect(await titles(art({ orientation: 'portrait' }))).toEqual(['Harbour at Dusk']);
    expect(await titles(art({ artist: 'Rembrandt' }))).toEqual([]);
  });

  it('counts the matches exactly', async () => {
    expect(await artCount(art())).toEqual({ count: 4 });
    expect(await artCount(art({ artist: 'Cézanne', genre: 'still-life' }))).toEqual({ count: 1 });
    expect(await artCount(art({ genre: 'seascape', orientation: 'landscape' }))).toEqual({ count: 0 });
    // The screen-shape filter counts only once the screen's size is known: the harbour alone is near 1080x1920.
    expect(await artCount(art({ aspectTolerance: 0.25 }))).toEqual({ count: 4 });
    expect(await artCount(art({ aspectTolerance: 0.25 }), CANVAS)).toEqual({ count: 1 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves out the paintings the household said "don\'t show again" to, everywhere', async () => {
    hiddenList.ids = ['Q2', 'Q4', 'not-an-id'];
    expect(await titles(art())).toEqual(['Apples', 'Wheat Field']);
    expect(await artCount(art())).toEqual({ count: 2 });
    expect(await artPhotoSource.pickOne({ source: art({ genre: 'cityscape' }), canvas: CANVAS })).toBeNull();
  });
});

describe('background picks', () => {
  const open = async (fit?: Art['fit']) => {
    const image = await sharp({ create: { width: 160, height: 100, channels: 3, background: '#2060c0' } }).jpeg().toBuffer();
    upstream({ 'Special:FilePath': () => new Response(new Uint8Array(image), { headers: { 'content-type': 'image/jpeg' } }) });
    const picked = await artPhotoSource.pickOne({ source: art({ genre: 'cityscape', fit }), canvas: { w: 108, h: 192 } });
    const res = await (picked as { open: () => Promise<Response> }).open();
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    return { id: (picked as { id: string }).id, size: [meta.width, meta.height] };
  };

  it('hands cover the painting itself and paints every other fit to the canvas', async () => {
    expect((await open('cover')).size).toEqual([160, 100]);
    expect(await open('contain')).toEqual({ id: 'Q4-contain-108x192', size: [108, 192] });
    expect(await open('matte')).toEqual({ id: 'Q4-matte-108x192', size: [108, 192] });
    expect(await open('mat')).toEqual({ id: 'Q4-mat-charcoal.cream.black.w.2-108x192', size: [108, 192] });
    // Framed on a wall is what a source gets when it says nothing; the colours are part of the id.
    expect(await open()).toEqual({ id: 'Q4-framed-charcoal.cream.black.w.2-108x192', size: [108, 192] });
  });

  it('tells the wall how to label the painting, where the label goes, and when it may drift', async () => {
    const pick = async (source: Art) => (await artPhotoSource.pickOne({ source, canvas: CANVAS })) as unknown as { id: string; credit: { name: string; source: string; art: Record<string, unknown> } };
    const framed = await pick(art({ genre: 'landscape', wall: 'sage', mat: 'none', frame: 'oak', texture: false, label: 'always' }));
    // The trailing 2 is the hanging's version: a wall is never handed a copy painted an older way.
    expect(framed.id).toBe('Q1-framed-sage.none.oak.p.2-1080x1920');
    expect(framed.credit).toMatchObject({ name: 'Wheat Field, Vincent van Gogh, 1888', source: 'Van Gogh Museum' });
    expect(framed.credit.art).toMatchObject({
      id: 'Q1', file: 'Wheat Field.jpg', title: 'Wheat Field', artist: 'Vincent van Gogh', year: 1888, museum: 'Van Gogh Museum', label: 'always',
      // A card on the wall, its right edge under the frame's.
      place: { style: 'placard', w: 330, unit: 1 },
    });
    expect(framed.credit.art.drift).toBeUndefined();

    const matted = await pick(art({ genre: 'landscape', fit: 'mat', mat: 'charcoal' }));
    expect(matted.credit.art).toMatchObject({ label: 'brief', place: { style: 'printed', tone: 'light', x: 92, w: 896 } });

    const filled = await pick(art({ genre: 'landscape', fit: 'cover', drift: true }));
    expect(filled.credit.art).toMatchObject({ drift: true, place: { style: 'placard' } });
    // Drift is for a painting that fills the screen only.
    expect((await pick(art({ genre: 'landscape', fit: 'matte', drift: true }))).credit.art.drift).toBeUndefined();
  });

  it('asks Commons for the next ready width up from what the screen needs, never more than the painting has', async () => {
    const image = await sharp({ create: { width: 160, height: 100, channels: 3, background: '#2060c0' } }).jpeg().toBuffer();
    upstream({ 'Special:FilePath': () => new Response(new Uint8Array(image), { headers: { 'content-type': 'image/jpeg' } }) });
    const ask = async (source: Art, canvas = CANVAS) => {
      await ((await artPhotoSource.pickOne({ source, canvas })) as { open: () => Promise<Response> }).open();
      return new URL(lastUrl()).searchParams.get('width');
    };
    // Whole painting inside 1080x1920: 1080 wide, so 1280 is the next width Commons keeps.
    expect(await ask(art({ genre: 'landscape', fit: 'matte' }))).toBe('1280');
    // In a frame the painting is 700 wide on this screen.
    expect(await ask(art({ genre: 'landscape' }))).toBe('960');
    // Cover on a tall screen needs 1920 x (4000/3000) = 2560 across.
    expect(await ask(art({ genre: 'landscape', fit: 'cover' }))).toBe('3840');
    // The canal is only 1600 wide.
    expect(await ask(art({ genre: 'cityscape', fit: 'cover' }))).toBe('1600');
  });

  it('avoids the painting showing now, keeps to the screen\'s shape when asked, and answers null when nothing matches', async () => {
    const picked = await artPhotoSource.pickOne({ source: art({ artist: 'Cézanne' }), canvas: CANVAS, previous: 'rotation-art-Q2-matte-1080x1920.jpg' });
    expect(picked).toMatchObject({ id: expect.stringMatching(/^Q3-framed-/), credit: { name: 'Apples, Paul Cézanne', source: 'Louvre Museum' } });

    // Only the harbour (2000x3000) is near a 1080x1920 screen's shape.
    expect(await artPhotoSource.pickOne({ source: art({ aspectTolerance: 0.25 }), canvas: CANVAS })).toMatchObject({ id: expect.stringMatching(/^Q2-/) });
    // On a wide screen only the canal (1600x1000) is close.
    expect(await artPhotoSource.pickOne({ source: art({ aspectTolerance: 0.15 }), canvas: { w: 1920, h: 1080 } })).toMatchObject({ id: expect.stringMatching(/^Q4-.*-1920x1080$/) });
    expect(await artPhotoSource.pickOne({ source: art({ artist: 'Rembrandt' }), canvas: CANVAS })).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('picker search', () => {
  const entities = (...pairs: Array<[string, string]>) => json({ results: { bindings: pairs.map(([id, role]) => ({ e: { value: `http://www.wikidata.org/entity/${id}` }, role: { value: role } })) } });
  /** The answer to "which of these carry a tag that keeps them out". */
  const flagged = (...ids: string[]) => wikidata(...ids.map((id) => ({ item: { value: `http://www.wikidata.org/entity/${id}` } })));
  const SAFE = '?item wdt:P136 ?safe . VALUES ?safe { wd:Q191163 wd:Q158607 wd:Q1935974 wd:Q170571 }';

  it('reads the keyword as the museum and artist it names, in one query held to the safe subjects', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }, { id: 'Q1461794', label: 'Louvre - Rivoli' }, { id: 'Q551652', label: 'Mihály Munkácsy' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum'], ['Q551652', 'artist']),
      'VALUES ?flag': () => flagged(),
      'LIMIT 60': () => wikidata(row('Q1', 'Dusty Road', 'Road.jpg'), row('Q2', 'Locked', 'Locked.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Road.jpg', 'CC BY-SA 4.0'], ['Locked.jpg', 'CC BY-NC 4.0']),
    });

    const page = await artPickableSource.browse({ collection: 'search', page: 1, query: 'Louvre Munkácsy' });

    expect(page.matched).toEqual([{ type: 'museum', label: 'Louvre Museum' }, { type: 'artist', label: 'Mihály Munkácsy' }]);
    expect(page.items).toEqual([{
      ref: 'Q1', label: 'Dusty Road', credit: { name: 'Mihály Munkácsy' }, secondary: '1869, Louvre Museum, CC BY-SA 4.0',
      thumbUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Road.jpg?width=500',
    }]);
    const paintings = sparqls().find((q) => q.includes('LIMIT 60'))!;
    // The page is cut inside, before titles and artists are looked up.
    expect(paintings).toContain(`{ SELECT DISTINCT ?item ?image WHERE { ?item wdt:P31 wd:Q3305213 ; wdt:P18 ?image . ${SAFE} { ?item wdt:P195/wdt:P361* wd:Q19675 } UNION { ?item wdt:P170 wd:Q551652 } } LIMIT 60 OFFSET 0 }`);
  });

  it('leaves out scans too small for a wall', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum']),
      'VALUES ?flag': () => flagged(),
      'LIMIT 60': () => wikidata(row('Q1', 'Thumbnail', 'Small.jpg'), row('Q2', 'Just Enough', 'Enough.jpg'), row('Q3', 'Narrow Strip', 'Strip.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Small.jpg', 'Public domain', 574, 341], ['Enough.jpg', 'Public domain', 1600, 1000], ['Strip.jpg', 'Public domain', 4000, 999]),
    });
    const page = await artPickableSource.browse({ collection: 'search', page: 1, query: 'louvre' });
    expect(page.items.map((item) => item.label)).toEqual(['Just Enough']);
  });

  it('drops a painting tagged as bare skin or an unsafe subject, and one named like it', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum']),
      'VALUES ?flag': () => flagged('Q1'),
      'LIMIT 60': () => wikidata(row('Q1', 'Quiet Pool', 'Pool.jpg'), row('Q2', 'Landscape with Bathers', 'Bathers.jpg'), row('Q3', 'Haystacks', 'Hay.jpg'), row('Q4', 'Q4', 'NoLabel.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Pool.jpg', 'Public domain'], ['Bathers.jpg', 'Public domain'], ['Hay.jpg', 'Public domain'], ['NoLabel.jpg', 'Public domain']),
    });

    const page = await artPickableSource.browse({ collection: 'search', page: 1, query: 'louvre' });

    expect(page.items.map((item) => item.label)).toEqual(['Haystacks']);
    const asked = sparqls().find((q) => q.includes('VALUES ?flag'))!;
    expect(asked).toContain('VALUES ?item { wd:Q1 wd:Q2 wd:Q3 wd:Q4 }');
    expect(asked).toContain('?item wdt:P136|wdt:P180 ?flag');
    // Nude and nudity, and mythological, religious and history painting.
    for (const tag of ['Q40446', 'Q10791', 'Q3374376', 'Q2864737', 'Q742333']) expect(asked).toContain(`wd:${tag}`);
  });

  it('pages by painting: a full page has a next one and page 2 starts after the first', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`Q${i + 1}`, `P${i + 1}`, `P${i + 1}.jpg`));
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q19675', label: 'Louvre Museum' }] }),
      'SELECT ?e ?role': () => entities(['Q19675', 'museum']),
      'VALUES ?flag': () => flagged(),
      'LIMIT 60': () => wikidata(...rows),
      'commons.wikimedia.org/w/api.php': () => commons(),
    });
    expect((await artPickableSource.browse({ collection: 'search', page: 1, query: 'louvre' })).nextPage).toBe(2);
    await artPickableSource.browse({ collection: 'search', page: 2, query: 'louvre' });
    expect(sparqls().some((q) => q.includes('LIMIT 60 OFFSET 60'))).toBe(true);
  });

  it('falls back to a text search of safe-subject paintings when the words name no museum, artist, movement or subject', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q5', label: 'Human' }] }),
      'SELECT ?e ?role': () => entities(),
      'VALUES ?flag': () => flagged(),
      'mwapi:gsrsearch': () => wikidata(row('Q9', 'Sunset', 'Sunset.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Sunset.jpg', 'CC0']),
    });
    const page = await artPickableSource.browse({ collection: 'search', page: 1, query: 'sunset "quoted"' });
    expect(page).toMatchObject({ matched: [], nextPage: null, items: [{ ref: 'Q9', secondary: '1869, Louvre Museum' }] });
    const search = sparqls().find((q) => q.includes('mwapi:gsrsearch'))!;
    expect(search).toContain('gsrsearch "sunset quoted haswbstatement:P31=Q3305213 haswbstatement:P136=Q191163|P136=Q158607|P136=Q1935974|P136=Q170571"');
    expect(search).toContain(SAFE);
  });

  it('searches a subject outside the safe four as text instead of following it', async () => {
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q134307', label: 'portrait' }, { id: 'Q191163', label: 'landscape painting' }] }),
      'SELECT ?e ?role': () => entities(['Q134307', 'genre'], ['Q191163', 'genre']),
      'VALUES ?flag': () => flagged(),
      'LIMIT 60': () => wikidata(row('Q9', 'Valley', 'Valley.jpg')),
      'mwapi:gsrsearch': () => wikidata(),
      'commons.wikimedia.org/w/api.php': () => commons(['Valley.jpg', 'CC0']),
    });
    const page = await artPickableSource.browse({ collection: 'search', page: 1, query: 'portrait landscape' });
    expect(page.matched).toEqual([{ type: 'genre', label: 'landscape painting' }]);
    expect(sparqls().find((q) => q.includes('LIMIT 60'))).not.toContain('Q134307');

    __test.cache.clear();
    mockFetch.mockClear();
    upstream({
      wbsearchentities: () => json({ search: [{ id: 'Q134307', label: 'portrait' }] }),
      'SELECT ?e ?role': () => entities(['Q134307', 'genre']),
      'mwapi:gsrsearch': () => wikidata(),
    });
    expect(await artPickableSource.browse({ collection: 'search', page: 1, query: 'portrait' })).toEqual({ items: [], nextPage: null, matched: [] });
    expect(sparqls().some((q) => q.includes('LIMIT 60'))).toBe(false);
  });

  it('asks nobody for empty words, and explains Wikidata not answering', async () => {
    expect(await artPickableSource.browse({ collection: 'search', page: 1, query: ' ' })).toEqual({ items: [], nextPage: null });
    expect(mockFetch).not.toHaveBeenCalled();
    mockFetch.mockRejectedValue(new Error('timeout'));
    await expect(artPickableSource.browse({ collection: 'search', page: 1, query: 'monet' })).rejects.toMatchObject({ status: 503, body: { error: 'art-unavailable' } });
  });
});

describe('import', () => {
  const open = async () => vi.mocked(importPictureToLibrary).mock.calls.at(-1)![0].open();

  it('copies an open-licence painting named after its title and artist, at library size', async () => {
    upstream({
      'VALUES ?flag': () => wikidata(),
      'query.wikidata.org': () => wikidata(row('Q1', 'Dusty Road', 'Road.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Road.jpg', 'Public domain', 6000, 4000]),
      'Special:FilePath': () => new Response('img'),
    });
    await artPickableSource.importOne({ ref: 'Q1', folder: 'art' });
    expect(vi.mocked(importPictureToLibrary).mock.calls[0][0]).toMatchObject({ kind: 'art', id: 'Q1', folder: 'art' });
    expect(await open()).toMatchObject({ title: 'Dusty Road Mihály Munkácsy' });
    expect(lastUrl()).toContain('Special:FilePath/Road.jpg?width=3840');
    expect(sparqls()[0]).toContain('VALUES ?item { wd:Q1 }');
  });

  it('re-checks the licence and the tags, and refuses what does not pass', async () => {
    upstream({ 'VALUES ?flag': () => wikidata(), 'query.wikidata.org': () => wikidata(row('Q2', 'Locked', 'Locked.jpg')), 'commons.wikimedia.org/w/api.php': () => commons(['Locked.jpg', 'CC BY-NC 4.0']) });
    await artPickableSource.importOne({ ref: 'Q2', folder: 'art' });
    expect(await open().catch((e) => e)).toMatchObject({ status: 404 });

    __test.cache.clear();
    upstream({
      'VALUES ?flag': () => wikidata({ item: { value: 'http://www.wikidata.org/entity/Q3' } }),
      'query.wikidata.org': () => wikidata(row('Q3', 'Quiet Pool', 'Pool.jpg')),
      'commons.wikimedia.org/w/api.php': () => commons(['Pool.jpg', 'Public domain']),
    });
    await artPickableSource.importOne({ ref: 'Q3', folder: 'art' });
    expect(await open().catch((e) => e)).toMatchObject({ status: 404 });
  });
});
