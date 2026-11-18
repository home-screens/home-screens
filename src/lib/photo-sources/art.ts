import { createTTLCache, fetchWithTimeout, type FetchRetryOptions } from '@/lib/api-utils';
import { ART_MIN_SHORT_SIDE, composeFit, paintingFits } from '@/lib/art-fit';
import { composeArtWall } from '@/lib/art-frame';
import { ART_HANGING_VERSION, artLayout, cornerLabel, matLettering, type ArtCaption, type ArtLayout } from '@/lib/art-presentation';
import { normalizeArtHidden } from '@/lib/art-hidden';
import { readConfig } from '@/lib/config';
import { importPictureToLibrary } from '@/lib/library-import';
import { DEFAULT_ART_FIT, DEFAULT_ART_FRAME, DEFAULT_ART_LABEL, DEFAULT_ART_MAT, DEFAULT_ART_WALL, type PhotoSourceOf } from '@/lib/photo-source';
import { shuffleArray } from '@/lib/shuffle';
import type { ArtGenre, MediaListItem } from '@/types/config';
import collection from './art-collection.json';
import { NUDE_TAGS, SAFE_GENRES, TITLE_WORDS, UNSAFE_GENRES } from './art-safety';
import { PhotoSourceError, type BrowseItem, type BrowseMatch, type BrowsePage, type PhotoSourceAdapter, type PickableSource } from './types';

/**
 * Paintings for the wall come from one place only: the collection that ships
 * with Home Screens (`art-collection.json`, built and looked through with
 * `scripts/build-art-collection.mts`). A wall never asks Wikidata what to
 * show, so nothing a person has not looked at can turn up on its own.
 *
 * The picture picker's Art tab is the one place that searches Wikidata live.
 * A person chooses each picture there, and the search is held to the same
 * subjects and leaves out the same tags (`art-safety.ts`).
 */

type ArtSource = PhotoSourceOf<'art'>;

const USER_AGENT = 'HomeScreens/1.0 (https://homescreens.dev; self-hosted display) art-source';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const PAINTING = 'Q3305213';

/**
 * Commons only hands out its standard thumbnail widths (mediawiki.org/wiki/Common_thumbnail_sizes) and refuses any
 * other, so the next one up from what a screen needs is asked for. A painting narrower than that is asked for whole.
 */
const COMMONS_WIDTHS = [250, 330, 500, 960, 1280, 1920, 3840];
const STREAM_WIDTH = 1920;
const IMPORT_WIDTH = 2560;
const TILE_WIDTH = 500;
const DEFAULT_CANVAS = { w: 1080, h: 1920 };
const WIKIMEDIA_ROWS = 60;
const MAX_MATCHES = 4;
// One more try after a short wait: Wikidata turns a search away now and then (429, 5xx) and takes it the second time.
const BROWSE_FETCH = { timeout: 20_000, retries: 1, baseDelayMs: 1_500 } as const;
const HOUR = 60 * 60_000;

interface Painting {
  /** Wikidata id. */
  id: string;
  /** File name on Wikimedia Commons. */
  file: string;
  title: string;
  artist?: string;
  year?: number;
  museum?: string;
  width: number;
  height: number;
  /** Only set for a licence that asks for credit (CC BY), which the picker can meet and the collection never holds. */
  license?: string;
}

type CollectionRow = [id: string, file: string, title: string, artist: string, year: number | null, museum: string | null, width: number, height: number, genre: ArtGenre];

/** Names compare without accents or case, so `Cezanne` finds Cézanne. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const COLLECTION = (collection as unknown as CollectionRow[]).map(([id, file, title, artist, year, museum, width, height, genre]) => ({
  id, file, title, artist, width, height, genre,
  ...(year !== null ? { year } : {}),
  ...(museum !== null ? { museum } : {}),
  artistFolded: fold(artist),
}));

const pictureUrl = (painting: Pick<Painting, 'file' | 'width'>, wanted: number) => {
  const width = COMMONS_WIDTHS.find((step) => step >= wanted) ?? COMMONS_WIDTHS[COMMONS_WIDTHS.length - 1];
  return `${COMMONS_FILE}/${encodeURIComponent(painting.file)}?width=${Math.min(width, painting.width)}`;
};

/** The paintings this household has said "don't show again" to. */
async function hiddenNow(): Promise<Set<string>> {
  return new Set(normalizeArtHidden((await readConfig()).settings?.artHidden));
}

/** Whether `id` is a painting in the shipped collection. */
export const isCollectionPainting = (id: string) => COLLECTION.some((painting) => painting.id === id);

/** A painting's page on Wikimedia Commons, and a small picture of it for the phone. */
export const artAboutUrl = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
export const artThumbUrl = (file: string) => `${COMMONS_FILE}/${encodeURIComponent(file)}?width=${TILE_WIDTH}`;

/** The collection's paintings that pass the source's subject, artist, period and tall-or-wide filters, less the hidden ones. */
async function matching(source: ArtSource) {
  const artist = fold(source.artist?.trim() ?? '');
  const hidden = await hiddenNow();
  return COLLECTION.filter((painting) => (
    !hidden.has(painting.id)
    && (!source.genre || painting.genre === source.genre)
    && (!artist || painting.artistFolded.includes(artist))
    && (source.fromYear === undefined || (painting.year !== undefined && painting.year >= source.fromYear))
    && (source.toYear === undefined || (painting.year !== undefined && painting.year <= source.toYear))
    && paintingFits(painting, { orientation: source.orientation }, DEFAULT_CANVAS)
  ));
}

/** How many paintings match, for the editor. With a `canvas` the screen-shape filter counts too, as it does for a rotating background. */
export async function artCount(source: ArtSource, canvas?: { w: number; h: number }): Promise<{ count: number }> {
  const paintings = await matching(source);
  return { count: canvas ? paintings.filter((painting) => paintingFits(painting, { aspectTolerance: source.aspectTolerance }, canvas)).length : paintings.length };
}

const creditOf = (painting: Painting) => ({
  name: [painting.title, painting.artist, painting.year].filter(Boolean).join(', '),
  source: [painting.museum ?? 'Wikimedia Commons', painting.license].filter(Boolean).join(', '),
});

export const artPhotoSource: PhotoSourceAdapter<'art'> = {
  kind: 'art',

  async list({ source, count, media }) {
    if (media === 'videos') return [];
    // A slideshow fits pictures into its own box by its own setting, so the screen-shape filter is for backgrounds only.
    return shuffleArray(await matching(source)).slice(0, count)
      .map((painting): MediaListItem => ({ url: pictureUrl(painting, STREAM_WIDTH), type: 'image', credit: creditOf(painting) }));
  },

  async pickOne({ source, canvas, previous }) {
    const paintings = (await matching(source)).filter((painting) => paintingFits(painting, { aspectTolerance: source.aspectTolerance }, canvas));
    const fresh = paintings.filter((painting) => !previous?.includes(`art-${painting.id}-`));
    const pool = fresh.length > 0 ? fresh : paintings;
    const painting = pool[Math.floor(Math.random() * pool.length)];
    if (!painting) return null;
    const fit = source.fit ?? DEFAULT_ART_FIT;
    const aspect = painting.width / painting.height;
    const hung = fit === 'framed' || fit === 'mat';
    const mat = source.mat ?? DEFAULT_ART_MAT;
    const hanging = { fit: hung ? fit : 'framed' as const, wall: source.wall ?? DEFAULT_ART_WALL, mat, frame: source.frame ?? DEFAULT_ART_FRAME, texture: source.texture !== false };
    const label = source.label ?? DEFAULT_ART_LABEL;
    const layout: ArtLayout | null = hung ? artLayout(fit, aspect, canvas, mat, matLettering(mat)) : null;
    const wanted = layout ? layout.opening.w : fit === 'cover' ? Math.max(canvas.w, canvas.h * aspect) : Math.min(canvas.w, canvas.h * aspect);
    const url = pictureUrl(painting, wanted);
    const art: ArtCaption = {
      id: painting.id, file: painting.file, title: painting.title, artist: painting.artist,
      ...(painting.year !== undefined ? { year: painting.year } : {}), ...(painting.museum ? { museum: painting.museum } : {}),
      // A hanging with no place for a label leaves the details to the small corner caption.
      label: layout && !layout.label ? 'off' : label,
      place: layout?.label ?? cornerLabel(canvas),
      ...(fit === 'cover' && source.drift ? { drift: true } : {}),
    };
    // Everything that changes the painted picture is part of the id, so a new wall colour is not handed the old copy.
    const look = hung ? `${fit}-${[hanging.wall, hanging.mat, hanging.frame, hanging.texture ? 'w' : 'p', ART_HANGING_VERSION].join('.')}` : fit;
    return {
      kind: 'download',
      id: `${painting.id}-${look}-${canvas.w}x${canvas.h}`,
      credit: { ...creditOf(painting), art },
      open: async () => {
        const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 60_000 });
        if (!res.ok || fit === 'cover') return res;
        const original = Buffer.from(await res.arrayBuffer());
        const composed = layout ? await composeArtWall(original, hanging, canvas, layout) : await composeFit(original, fit, canvas);
        return new Response(new Uint8Array(composed?.data ?? original), { headers: { 'content-type': composed?.contentType ?? res.headers.get('content-type') ?? 'image/jpeg' } });
      },
    };
  },
};

// The picture picker's live search.

const cache = createTTLCache<unknown>(6 * HOUR);

async function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== null) return hit as T;
  const value = await load();
  cache.set(key, value);
  return value;
}

const unavailable = () => new PhotoSourceError("Wikidata isn't sending paintings right now", 503, { error: 'art-unavailable' });

async function getJson<T>(url: string, init: FetchRetryOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(url, { ...BROWSE_FETCH, ...init, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  if (res.status === 404) throw new PhotoSourceError('That painting is no longer there', 404);
  if (!res.ok) throw unavailable();
  return await res.json() as T;
}

async function explained<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw error instanceof PhotoSourceError ? error : unavailable();
  }
}

const clean = (text: string | undefined | null) => text?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || undefined;
/** Wikidata answers a missing label with the bare id or a URL. */
const named = (text: string | undefined) => { const label = clean(text); return label && !/^(Q\d+|https?:\/\/.*)$/.test(label) ? label : undefined; };
const yearOf = (text: string | undefined | null) => {
  const year = /(?:^|\D)(\d{3,4})(?!\d)/.exec(text ?? '')?.[1];
  return year ? Number(year) : undefined;
};

export function isOpenLicense(name: string | undefined | null): boolean {
  const license = (name ?? '').trim();
  return !!license && !/\b(nc|nd)\b/i.test(license) && /^(public domain|pd\b|pdm|cc0|cc[ -]by\b|no restrictions)/i.test(license);
}

type Row = Record<string, { value: string } | undefined>;
type FileInfo = { width: number; height: number; license: string | null };

const sparql = async (query: string) => (await getJson<{ results?: { bindings?: Row[] } }>(
  `${WIKIDATA_SPARQL}?${new URLSearchParams({ query, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } },
)).results?.bindings ?? [];

const wd = (ids: readonly string[]) => ids.map((id) => `wd:${id}`).join(' ');
const PAINTINGS = `?item wdt:P31 wd:${PAINTING} ; wdt:P18 ?image .`;
/** Only the subjects the source offers. */
const SAFE = `?item wdt:P136 ?safe . VALUES ?safe { ${wd(Object.values(SAFE_GENRES))} }`;
const FLAGS = wd([...new Set([...NUDE_TAGS, ...UNSAFE_GENRES])]);
/** A painting's title, artist, year and museum, for the paintings `where` finds. */
const paintingQuery = (where: string) => `SELECT ?item ?itemLabel ?creatorLabel ?image ?date ?collectionLabel WHERE {
  ${where}
  OPTIONAL { ?item wdt:P170 ?creator } OPTIONAL { ?item wdt:P571 ?date } OPTIONAL { ?item wdt:P195 ?collection }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}`;
// The page is cut first and its paintings described afterwards: describing everything a big museum or a whole subject
// holds before cutting takes Wikidata 20 s or more.
const pageOf = (where: string, page: number) => `{ SELECT DISTINCT ?item ?image WHERE { ${where} } LIMIT ${WIKIMEDIA_ROWS} OFFSET ${(page - 1) * WIKIMEDIA_ROWS} }`;

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
      `${COMMONS_API}?${params}`,
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

/** Which of the paintings carry a tag that keeps them out (`art-safety.ts`). Asked on its own, for one page: joined into the search it slows every answer. */
async function flaggedAmong(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sparql(`SELECT DISTINCT ?item WHERE { VALUES ?item { ${wd(ids)} } VALUES ?flag { ${FLAGS} } ?item wdt:P136|wdt:P180 ?flag }`);
  return new Set(rows.flatMap((row) => qidOf(row.item?.value) ?? []));
}

/** The rows' paintings that are open to use, big enough for a wall, not flagged and not named like something to leave out. */
async function openPaintings(rows: Row[]): Promise<Painting[]> {
  const byItem = new Map<string, { row: Row; name: string }>();
  for (const row of rows) {
    const qid = qidOf(row.item?.value);
    const name = row.image && commonsFileName(row.image.value);
    if (qid && name && !byItem.has(qid)) byItem.set(qid, { row, name });
  }
  const flagged = await flaggedAmong([...byItem.keys()]);
  const info = await commonsInfo([...new Set([...byItem.values()].filter((entry) => !flagged.has(qidOf(entry.row.item?.value) ?? '')).map((entry) => entry.name))]);
  const paintings: Painting[] = [];
  for (const [qid, { row, name }] of byItem) {
    const file = info.get(name);
    const title = named(row.itemLabel?.value);
    if (flagged.has(qid) || !file || !isOpenLicense(file.license) || !title || TITLE_WORDS.test(title)) continue;
    if (Math.min(file.width, file.height) < ART_MIN_SHORT_SIDE) continue;
    const artist = named(row.creatorLabel?.value);
    const year = yearOf(row.date?.value);
    const museum = named(row.collectionLabel?.value);
    paintings.push({
      id: qid, file: name, title, width: file.width, height: file.height,
      ...(artist ? { artist } : {}), ...(year ? { year } : {}), ...(museum ? { museum } : {}),
      ...(file.license && /^cc[ -]by/i.test(file.license) ? { license: file.license } : {}),
    });
  }
  return paintings;
}

type MatchType = BrowseMatch['type'];
const PROPERTY: Record<MatchType, string> = { museum: 'P195', artist: 'P170', movement: 'P135', genre: 'P136' };
const ROLES = Object.keys(PROPERTY) as MatchType[];
type Match = BrowseMatch & { id: string; roles: MatchType[] };

/** The Wikidata entities for the words that paintings actually point to as museum, artist, movement or subject. */
const resolveKeyword = (words: string) => memo(`resolve:${words.toLowerCase()}`, async (): Promise<Match[]> => {
  const params = new URLSearchParams({ action: 'wbsearchentities', search: words, language: 'en', type: 'item', limit: '7', format: 'json' });
  const found = await getJson<{ search?: Array<{ id?: string; label?: string }> }>(`${WIKIDATA_API}?${params}`);
  const candidates = (found.search ?? []).flatMap((hit) => (hit.id && /^Q\d+$/.test(hit.id) ? [{ id: hit.id, label: clean(hit.label) ?? hit.id }] : []));
  if (candidates.length === 0) return [];
  const exists = (type: MatchType) => `{ BIND("${type}" AS ?role) FILTER EXISTS { ?p wdt:${PROPERTY[type]} ?e ; wdt:P31 wd:${PAINTING} ; wdt:P18 ?i } }`;
  const rows = await sparql(`SELECT ?e ?role WHERE {
  VALUES ?e { ${wd(candidates.map((c) => c.id))} }
  ${ROLES.map(exists).join(' UNION ')}
}`);
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = qidOf(row.e?.value);
    if (id && row.role) seen.set(id, (seen.get(id) ?? new Set()).add(row.role.value));
  }
  return candidates.flatMap(({ id, label }) => {
    const roles = ROLES.filter((role) => seen.get(id)?.has(role));
    return roles.length > 0 ? [{ id, label, type: roles[0], roles }] : [];
  }).slice(0, MAX_MATCHES);
});

const tileOf = (painting: Painting): BrowseItem => ({
  ref: painting.id,
  thumbUrl: pictureUrl(painting, TILE_WIDTH),
  label: painting.title,
  secondary: [painting.year, painting.museum ?? 'Wikimedia Commons', painting.license].filter(Boolean).join(', '),
  ...(painting.artist ? { credit: { name: painting.artist } } : {}),
});

const SAFE_GENRE_IDS = new Set(Object.values(SAFE_GENRES));

async function browseWikidata(words: string, page: number): Promise<BrowsePage> {
  // A subject outside the four the search keeps to (portrait, nude, ...) is not followed as a subject: nearly none of
  // its paintings would pass, and crossing two whole subjects outruns Wikidata's time limit. The word is searched as text instead.
  const matches = (await resolveKeyword(words)).flatMap((match) => {
    const roles = match.roles.filter((role) => role !== 'genre' || SAFE_GENRE_IDS.has(match.id));
    return roles.length > 0 ? [{ ...match, roles, type: roles[0] }] : [];
  });
  if (matches.length > 0) {
    // One branch per entity with the id written in; a museum list under the department path is far slower.
    const branches = matches.flatMap((m) => m.roles.map((role) => `{ ?item ${role === 'museum' ? 'wdt:P195/wdt:P361*' : `wdt:${PROPERTY[role]}`} wd:${m.id} }`));
    // No sort: ordering the union of a big museum and a movement outruns Wikidata's time limit.
    const rows = await sparql(paintingQuery(pageOf(`${PAINTINGS} ${SAFE} ${branches.join(' UNION ')}`, page)));
    if (rows.length > 0 || page > 1) {
      const pictures = new Set(rows.map((row) => `${row.item?.value} ${row.image?.value}`)).size;
      return {
        items: (await openPaintings(rows)).map(tileOf),
        nextPage: pictures >= WIKIMEDIA_ROWS ? page + 1 : null,
        matched: matches.map(({ type, label }) => ({ type, label })),
      };
    }
  }
  const safe = words.replace(/["\\\n\r]/g, ' ').trim();
  const subjects = Object.values(SAFE_GENRES).map((id) => `P136=${id}`).join('|');
  const rows = await sparql(paintingQuery(`SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "Generator" ; wikibase:endpoint "www.wikidata.org" ;
      mwapi:generator "search" ; mwapi:gsrsearch "${safe} haswbstatement:P31=${PAINTING} haswbstatement:${subjects}" ; mwapi:gsrlimit "50" ; mwapi:gsroffset "${(page - 1) * 50}" .
    ?item wikibase:apiOutputItem mwapi:title .
  }
  ?item wdt:P18 ?image . ${SAFE}`));
  const paintings = new Set(rows.map((row) => row.item?.value)).size;
  return { items: (await openPaintings(rows)).map(tileOf), nextPage: paintings >= 20 ? page + 1 : null, matched: [] };
}

/** One painting by id, for a copy into the library: the person has already seen and chosen it. */
const paintingById = async (id: string) => (await openPaintings(await sparql(paintingQuery(`VALUES ?item { wd:${id} } ${PAINTINGS} ${SAFE}`))))[0] ?? null;

export const artPickableSource: PickableSource = {
  kind: 'art',

  async browse({ page, query }) {
    const words = query?.trim();
    if (!words) return { items: [], nextPage: null };
    return memo(`browse:${JSON.stringify([words.toLowerCase(), page])}`, () => explained(() => browseWikidata(words, page)));
  },

  async importOne({ ref, folder }) {
    return importPictureToLibrary({
      kind: 'art',
      id: ref,
      folder,
      open: async () => {
        const painting = await explained(() => paintingById(ref));
        if (!painting) throw new PhotoSourceError('That painting is no longer there', 404);
        return {
          response: await fetchWithTimeout(pictureUrl(painting, IMPORT_WIDTH), { headers: { 'User-Agent': USER_AGENT }, timeout: 60_000 }),
          title: [painting.title, painting.artist].filter(Boolean).join(' '),
        };
      },
    });
  },
};

export const __test = { cache };
