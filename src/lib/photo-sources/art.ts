import { createTTLCache, fetchWithTimeout, type FetchRetryOptions } from '@/lib/api-utils';
import { composeFit, paintingFits } from '@/lib/art-fit';
import { DEFAULT_ART_FIT, DEFAULT_ART_MIN_SHORT_SIDE, type PhotoSourceOf } from '@/lib/photo-source';
import { shuffleArray } from '@/lib/shuffle';
import type { ArtGenre, ArtProvider, MediaListItem } from '@/types/config';
import { PhotoSourceError, type PhotoSourceAdapter } from './types';

type ArtSource = PhotoSourceOf<'art'>;

const USER_AGENT = 'HomeScreens/1.0 (https://homescreens.dev; self-hosted display) art-source';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const AIC_API = 'https://api.artic.edu/api/v1/artworks';
const AIC_IIIF = 'https://www.artic.edu/iiif/2';
const CLEVELAND_API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const CLEVELAND_IMAGE_HOST = 'https://openaccess-cdn.clevelandart.org/';
const PAINTING = 'Q3305213';

const GENRES: Record<ArtGenre, { wikidata: string; aic: string[]; word: string }> = {
  'landscape': { wikidata: 'Q191163', aic: ['landscape', 'landscapes'], word: 'landscape' },
  'portrait': { wikidata: 'Q134307', aic: ['portrait', 'portraits'], word: 'portrait' },
  'still-life': { wikidata: 'Q170571', aic: ['still life'], word: 'still life' },
  'seascape': { wikidata: 'Q158607', aic: ['seascape', 'seascapes'], word: 'seascape' },
  'religious': { wikidata: 'Q2864737', aic: ['religion', 'religious'], word: 'religious' },
  'mythological': { wikidata: 'Q3374376', aic: ['mythology'], word: 'mythology' },
  'history': { wikidata: 'Q742333', aic: ['history'], word: 'history' },
  'genre-scene': { wikidata: 'Q1047337', aic: ['genre scene', 'genre scenes'], word: 'genre scene' },
  'cityscape': { wikidata: 'Q1935974', aic: ['cityscape', 'cityscapes'], word: 'cityscape' },
  'nude': { wikidata: 'Q40446', aic: ['nude', 'nudes'], word: 'nude' },
};

const BATCH = 50;
const STREAM_WIDTH = 1920;
const AIC_MAX_WIDTH = 1686;
const DEFAULT_CANVAS = { w: 1080, h: 1920 };
const HOUR = 60 * 60_000;

interface ArtWork {
  id: string;
  title: string;
  artist?: string;
  year?: string;
  museum: string;
  width: number;
  height: number;
  url: (width: number) => string;
  /** Only set for a licence that asks for credit (CC BY). */
  license?: string;
}

const cache = createTTLCache<unknown>(6 * HOUR);

async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== null) return hit as T;
  const value = await load();
  cache.set(key, value);
  return value;
}

const unavailable = (museum: string) => new PhotoSourceError(`${museum} isn't sending paintings right now`, 503, { error: 'art-unavailable' });

async function getJson<T>(url: string, museum: string, init: FetchRetryOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(url, { timeout: 20_000, ...init, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  if (res.status === 404) throw new PhotoSourceError('That painting is no longer there', 404);
  if (!res.ok) throw unavailable(museum);
  return await res.json() as T;
}

const clean = (text: string | undefined | null) => text?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;
/** Wikidata answers an unknown value with a URL instead of a label. */
const named = (text: string | undefined) => { const label = clean(text); return label && !/^https?:\/\//.test(label) ? label : undefined; };
const yearOf = (text: string | undefined | null) => {
  const year = /(?:^|\D)(\d{3,4})(?!\d)/.exec(text ?? '')?.[1];
  return year ? String(Number(year)) : undefined;
};
const randomInt = (max: number) => Math.floor(Math.random() * max);
const clampWidth = (width: number, max: number) => Math.min(Math.max(Math.round(width), 200), max);

export function isOpenLicense(name: string | undefined | null): boolean {
  const license = (name ?? '').trim();
  return !!license && !/\b(nc|nd)\b/i.test(license) && /^(public domain|pd\b|pdm|cc0|cc[ -]by\b|no restrictions)/i.test(license);
}

type Row = Record<string, { value: string } | undefined>;
type FileInfo = { width: number; height: number; license: string | null };

const sparql = async (query: string, init: FetchRetryOptions = {}) => (await getJson<{ results?: { bindings?: Row[] } }>(
  `${WIKIDATA_SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, 'Wikidata', { ...init, headers: { Accept: 'application/sparql-results+json' } },
)).results?.bindings ?? [];

const paintingQuery = (where: string, tail = '') => `SELECT ?item ?itemLabel ?creatorLabel ?image ?date ?collectionLabel WHERE {
  ${where}
  OPTIONAL { ?item wdt:P170 ?creator } OPTIONAL { ?item wdt:P571 ?date } OPTIONAL { ?item wdt:P195 ?collection }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} ${tail}`;
const PAINTINGS = `?item wdt:P31 wd:${PAINTING} ; wdt:P18 ?image .`;

const qidOf = (value: string | undefined) => /\/(Q\d+)$/.exec(value ?? '')?.[1];

function commonsFileName(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== 'commons.wikimedia.org' || !url.pathname.includes('/Special:FilePath/')) return null;
    const name = decodeURIComponent(url.pathname.split('/Special:FilePath/')[1] ?? '');
    return /\.(jpe?g|png|webp)$/i.test(name) ? name.replace(/_/g, ' ') : null;
  } catch {
    return null;
  }
}

async function commonsInfo(names: string[]): Promise<Map<string, FileInfo>> {
  const found = new Map<string, FileInfo>();
  const missing = names.filter((name) => {
    const known = cache.get(`file:${name}`) as FileInfo | null;
    if (known) found.set(name, known);
    return !known;
  });
  for (let i = 0; i < missing.length; i += 50) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'size|extmetadata', iiextmetadatafilter: 'LicenseShortName',
      titles: missing.slice(i, i + 50).map((name) => `File:${name}`).join('|'),
    });
    const data = await getJson<{ query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ width?: number; height?: number; extmetadata?: { LicenseShortName?: { value?: string } } }> }> } }>(
      `${COMMONS_API}?${params}`, 'Wikimedia Commons',
    );
    for (const page of Object.values(data.query?.pages ?? {})) {
      const name = page.title?.replace(/^File:/, '');
      const info = page.imageinfo?.[0];
      if (!name || !info?.width || !info.height) continue;
      const entry = { width: info.width, height: info.height, license: info.extmetadata?.LicenseShortName?.value ?? null };
      cache.set(`file:${name}`, entry);
      found.set(name, entry);
    }
  }
  return found;
}

async function openWorks(rows: Row[]): Promise<ArtWork[]> {
  const byItem = new Map<string, { row: Row; name: string }>();
  for (const row of rows) {
    const qid = qidOf(row.item?.value);
    const name = row.image && commonsFileName(row.image.value);
    if (qid && name && !byItem.has(qid)) byItem.set(qid, { row, name });
  }
  const info = await commonsInfo([...new Set([...byItem.values()].map((entry) => entry.name))]);
  const works: ArtWork[] = [];
  for (const [qid, { row, name }] of byItem) {
    const file = info.get(name);
    const title = clean(row.itemLabel?.value);
    if (!file || !isOpenLicense(file.license) || !title || /^Q\d+$/.test(title)) continue;
    works.push({
      id: qid,
      title,
      artist: named(row.creatorLabel?.value),
      year: yearOf(row.date?.value),
      museum: named(row.collectionLabel?.value) ?? 'Wikimedia Commons',
      width: file.width,
      height: file.height,
      url: (width) => `${COMMONS_FILE}/${encodeURIComponent(name)}?width=${clampWidth(width, file.width)}`,
      ...(file.license && /^cc[ -]by/i.test(file.license) ? { license: file.license } : {}),
    });
  }
  return works;
}

const findEntity = (words: string) => memo(`entity:${words.toLowerCase()}`, async () => {
  const params = new URLSearchParams({ action: 'wbsearchentities', search: words, language: 'en', type: 'item', limit: '1', format: 'json' });
  const id = (await getJson<{ search?: Array<{ id?: string }> }>(`${WIKIDATA_API}?${params}`, 'Wikidata')).search?.[0]?.id;
  return id && /^Q\d+$/.test(id) ? id : '';
});

async function wikidataClauses(source: ArtSource): Promise<{ clauses: string[]; narrowed: boolean } | null> {
  const clauses: string[] = [];
  const artistName = source.artist?.trim();
  const styleName = source.style?.trim();
  const artist = artistName ? await findEntity(artistName) : undefined;
  const style = styleName ? await findEntity(styleName) : undefined;
  if (artist === '' || style === '') return null;
  if (artist) clauses.push(`?item wdt:P170 wd:${artist} .`);
  if (style) clauses.push(`{ ?item wdt:P135 wd:${style} } UNION { ?item wdt:P136 wd:${style} } .`);
  // A painting is often held by a department of the museum. One branch per museum: a VALUES list times out.
  if (source.museums?.length) clauses.push(`${source.museums.map((id) => `{ ?item wdt:P195/wdt:P361* wd:${id} }`).join(' UNION ')} .`);
  if (source.genre) clauses.push(`?item wdt:P136 wd:${GENRES[source.genre].wikidata} .`);
  if (source.fromYear !== undefined || source.toYear !== undefined) {
    const bounds = [source.fromYear !== undefined && `YEAR(?date) >= ${source.fromYear}`, source.toYear !== undefined && `YEAR(?date) <= ${source.toYear}`].filter(Boolean);
    clauses.push(`?item wdt:P571 ?date . FILTER(${bounds.join(' && ')})`);
  }
  const narrowed = clauses.length > 0;
  // The whole of Wikidata's paintings is too much to ask for, so unfiltered asks take the widely written-about ones.
  if (!narrowed) clauses.push('?item wikibase:sitelinks ?links . FILTER(?links >= 10)');
  return { clauses, narrowed };
}

async function wikimediaWorks(source: ArtSource): Promise<ArtWork[]> {
  const asked = await wikidataClauses(source);
  if (!asked) return [];
  const page = (offset: number) => memo(`wikimedia:${JSON.stringify([asked.clauses, offset])}`, async () => openWorks(await sparql(
    paintingQuery(`${PAINTINGS} ${asked.clauses.join('\n  ')}`, `LIMIT ${BATCH * 2} OFFSET ${offset}`),
  )));
  const offset = source.artist?.trim() || source.style?.trim() ? 0 : randomInt(asked.narrowed ? 10 : 40) * BATCH;
  const works = await page(offset);
  return works.length > 0 || offset === 0 ? works : page(0);
}

interface AicHit {
  id?: number;
  title?: string;
  artist_title?: string | null;
  date_display?: string | null;
  image_id?: string | null;
  thumbnail?: { width?: number; height?: number } | null;
  is_public_domain?: boolean;
  artwork_type_title?: string;
}

const AIC_BASE = [{ term: { is_public_domain: true } }, { match_phrase: { artwork_type_title: 'Painting' } }, { exists: { field: 'image_id' } }];
const AIC_FIELDS = ['id', 'title', 'artist_title', 'date_display', 'image_id', 'thumbnail'];

function aicMust(source: ArtSource): unknown[] {
  const must: unknown[] = [...AIC_BASE];
  const artist = source.artist?.trim();
  const style = source.style?.trim();
  if (artist) must.push({ match_phrase: { artist_title: artist } });
  if (style) must.push({ bool: { should: [{ match_phrase: { style_title: style } }, { match_phrase: { term_titles: style } }], minimum_should_match: 1 } });
  if (source.fromYear !== undefined) must.push({ range: { date_end: { gte: source.fromYear } } });
  if (source.toYear !== undefined) must.push({ range: { date_start: { lte: source.toYear } } });
  if (source.genre) must.push({ bool: { should: GENRES[source.genre].aic.map((term) => ({ match_phrase: { subject_titles: term } })), minimum_should_match: 1 } });
  return must;
}

function aicWork(hit: AicHit): ArtWork | null {
  const { id, title, image_id: imageId, thumbnail } = hit;
  // IIIF ids are UUIDs; anything else is not built into a URL.
  if (!id || !title || !imageId || !/^[0-9a-f-]{36}$/i.test(imageId) || !thumbnail?.width || !thumbnail.height) return null;
  return {
    id: String(id),
    title,
    artist: clean(hit.artist_title?.split('\n')[0]),
    year: yearOf(hit.date_display),
    museum: 'Art Institute of Chicago',
    // The search answer has the shape, not the true size.
    width: AIC_MAX_WIDTH,
    height: Math.round(AIC_MAX_WIDTH * thumbnail.height / thumbnail.width),
    url: (width) => `${AIC_IIIF}/${imageId}/full/${clampWidth(width, AIC_MAX_WIDTH)},/0/default.jpg`,
  };
}

function aicSearch(must: unknown[], page: number, limit: number) {
  const body = JSON.stringify({ query: { bool: { must } }, fields: AIC_FIELDS, limit, page });
  return memo(`aic:${body}`, async () => {
    const data = await getJson<{ data?: AicHit[]; pagination?: { total?: number; total_pages?: number } }>(`${AIC_API}/search`, 'The Art Institute of Chicago', {
      method: 'POST', body, headers: { 'Content-Type': 'application/json' },
    });
    return { works: (data.data ?? []).flatMap((hit) => aicWork(hit) ?? []), total: data.pagination?.total ?? 0, totalPages: data.pagination?.total_pages ?? 1 };
  });
}

async function aicWorks(source: ArtSource): Promise<ArtWork[]> {
  const must = aicMust(source);
  const { works } = await aicSearch(must, 1 + randomInt(10), BATCH);
  return works.length > 0 ? works : (await aicSearch(must, 1, BATCH)).works;
}

interface ClevelandImage { url?: string; width?: string | number; height?: string | number }
interface ClevelandHit {
  id?: number;
  title?: string;
  creation_date?: string | null;
  creators?: Array<{ description?: string }>;
  images?: { web?: ClevelandImage; print?: ClevelandImage } | null;
  type?: string;
  share_license_status?: string;
}

const CLEVELAND_FIELDS = 'id,title,creation_date,creators,images';

function clevelandWork(hit: ClevelandHit, minShortSide: number): ArtWork | null {
  const images = [hit.images?.web, hit.images?.print].flatMap((image) => {
    const width = Number(image?.width);
    const height = Number(image?.height);
    return image?.url?.startsWith(CLEVELAND_IMAGE_HOST) && width > 0 && height > 0 ? [{ url: image.url, width, height }] : [];
  });
  const image = images.find((i) => Math.min(i.width, i.height) >= minShortSide) ?? images[0];
  if (!hit.id || !hit.title || !image) return null;
  return {
    id: String(hit.id),
    title: hit.title,
    artist: clean(hit.creators?.[0]?.description?.replace(/\s*\([^)]*\)\s*$/, '')),
    year: yearOf(hit.creation_date),
    museum: 'Cleveland Museum of Art',
    width: image.width,
    height: image.height,
    url: () => image.url,
  };
}

const clevelandSearch = (params: URLSearchParams) => memo(`cleveland:${params}`, async () => {
  const data = await getJson<{ data?: ClevelandHit[]; info?: { total?: number } }>(`${CLEVELAND_API}?${params}`, 'The Cleveland Museum of Art');
  return { hits: data.data ?? [], total: data.info?.total ?? 0 };
});

function clevelandParams(source: ArtSource, extra: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({ type: 'Painting', cc0: '1', has_image: '1', ...extra });
  if (source.artist?.trim()) params.set('artists', source.artist.trim());
  const words = [source.style?.trim(), source.genre && GENRES[source.genre].word].filter(Boolean).join(' ');
  if (words) params.set('q', words);
  if (source.fromYear !== undefined) params.set('created_after', String(source.fromYear));
  if (source.toYear !== undefined) params.set('created_before', String(source.toYear));
  return params;
}

async function clevelandWorks(source: ArtSource): Promise<ArtWork[]> {
  const minShortSide = source.minShortSide ?? DEFAULT_ART_MIN_SHORT_SIDE;
  const ask = async (skip: number) => (await clevelandSearch(clevelandParams(source, { limit: String(BATCH), skip: String(skip), fields: CLEVELAND_FIELDS })))
    .hits.flatMap((hit) => clevelandWork(hit, minShortSide) ?? []);
  const filtered = !!(source.artist?.trim() || source.style?.trim() || source.genre || source.fromYear !== undefined || source.toYear !== undefined);
  const works = await ask(filtered ? 0 : randomInt(20) * BATCH);
  return works.length > 0 || filtered ? works : ask(0);
}

const creditOf = (work: ArtWork) => ({
  name: [work.title, work.artist, work.year].filter(Boolean).join(', '),
  source: work.license ? `${work.museum}, ${work.license}` : work.museum,
});

const WORKS = { wikimedia: wikimediaWorks, aic: aicWorks, cleveland: clevelandWorks } satisfies Record<ArtProvider, unknown>;

async function worksFor(source: ArtSource, canvas: { w: number; h: number }): Promise<ArtWork[]> {
  const filters = {
    ...(source.orientation && source.orientation !== 'any' ? { orientation: source.orientation } : {}),
    minShortSide: source.minShortSide ?? DEFAULT_ART_MIN_SHORT_SIDE,
    aspectTolerance: source.aspectTolerance,
  };
  return (await WORKS[source.provider](source)).filter((work) => paintingFits(work, filters, canvas));
}

export const artPhotoSource: PhotoSourceAdapter<'art'> = {
  kind: 'art',

  async list({ source, count, media }) {
    if (media === 'videos') return [];
    const works = await worksFor({ ...source, aspectTolerance: undefined }, DEFAULT_CANVAS);
    return shuffleArray(works).slice(0, count).map((work): MediaListItem => ({ url: work.url(STREAM_WIDTH), type: 'image', credit: creditOf(work) }));
  },

  async pickOne({ source, canvas, previous }) {
    const works = await worksFor(source, canvas);
    const fresh = works.filter((work) => !previous?.includes(`art-${source.provider}-${work.id}-`));
    const pool = fresh.length > 0 ? fresh : works;
    const work = pool[randomInt(pool.length)];
    if (!work) return null;
    const fit = source.fit ?? DEFAULT_ART_FIT;
    const aspect = work.width / work.height;
    const url = work.url(fit === 'cover' ? Math.max(canvas.w, canvas.h * aspect) : Math.min(canvas.w, canvas.h * aspect));
    return {
      kind: 'download',
      // The fit is part of the id so a screen changing from cover to matte is not handed the cropped copy.
      id: `${source.provider}-${work.id}-${fit}-${canvas.w}x${canvas.h}`,
      credit: creditOf(work),
      open: async () => {
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 60_000 });
        if (!res.ok || fit === 'cover') return res;
        const original = Buffer.from(await res.arrayBuffer());
        const composed = await composeFit(original, fit, canvas);
        return new Response(new Uint8Array(composed?.data ?? original), { headers: { 'content-type': composed?.contentType ?? res.headers.get('content-type') ?? 'image/jpeg' } });
      },
    };
  },
};

export const __test = { cache };
