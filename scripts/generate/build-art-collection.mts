// Builds the paintings the `art` photo source shows: src/lib/photo-sources/art-collection.json.
//
// The wall only ever shows paintings from that file, and every painting in it
// has been looked at by a person. Nothing here runs on a wall or in CI; run it
// by hand to grow or refresh the collection:
//
//   npm run art:build -- candidates   # ask Wikidata and Commons, write <work>/candidates.json
//   npm run art:build -- sheets       # write <work>/sheets/*.jpg to look through
//   npm run art:build -- apply        # write the collection from the candidates that were kept
//
// `--work <dir>` names the working folder (default: .art-collection, not committed). The candidates step keeps what
// it has fetched there, so a run that stops half way picks up where it was; delete the folder to start over.
// `sheets --all` draws every candidate again; without it only the ones nobody
// has looked at yet are drawn (not in the collection and not turned down).
//
// Looking through the sheets: every tile has a number. Write the numbers to
// turn down into <work>/turned-down.txt, one sheet per line, with a word on why:
//
//   012: 17 nude, 33 frame
//
// `apply` adds those to scripts/generate/art-collection-turned-down.json (committed, so a
// later run never offers them again) and keeps every other candidate that was
// drawn on a sheet.
//
// What makes a candidate:
// - a painting on Wikidata with a picture, by a named artist (named as their English Wikipedia page is), whose genre is
//   landscape, seascape, cityscape or still life, and no other genre from UNSAFE_GENRES,
//   with a title of its own (not "Untitled", not a file name): in English, or else as it was named in its own
//   language, never translated (paintingTitle in scripts/generate/art-collection-title.ts)
// - none of the NUDE_TAGS as a genre or as something it depicts, no TITLE_WORDS in its title
//   (all three lists are in src/lib/photo-sources/art-safety.ts, shared with the picture picker's search)
// - the Commons file is public domain or CC0, at least ART_MIN_SHORT_SIDE pixels on its shorter side
// - at most PER_ARTIST paintings by one artist in each subject, better-known artists first
//
// Famous paintings are gathered as well, whatever their subject: a painting written about in FAMOUS_LINKS or more
// languages of Wikipedia, at most PER_ARTIST_FAMOUS by one artist. The same checks apply, except that a religious,
// mythological or history scene is not left out by its tag: the person looking decides. One that is not a landscape,
// seascape, cityscape or still life gets the subject `famous`; the others keep their subject and a mark.
//
// The tags are only a first sieve. They are added by volunteers and miss a lot,
// which is why a person looks at every picture before it ships.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ART_MIN_SHORT_SIDE } from '../../src/lib/art-fit';
import { NUDE_TAGS, SAFE_GENRES, TITLE_WORDS, UNSAFE_GENRES } from '../../src/lib/photo-sources/art-safety';
import type { ArtGenre } from '../../src/types/config';
import { paintingTitle, type TitleSources } from './art-collection-title';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COLLECTION_PATH = join(root, 'src/lib/photo-sources/art-collection.json');
const TURNED_DOWN_PATH = join(root, 'scripts/generate/art-collection-turned-down.json');

const USER_AGENT = 'HomeScreens/1.0 (https://homescreens.dev; self-hosted display) art-collection-build';
const SPARQL = 'https://query.wikidata.org/sparql';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const PAINTING = 'Q3305213';

/** How many candidates to gather for each subject. `famous` counts the well-known paintings of any other subject. */
const WANT: Record<ArtGenre, number> = { 'famous': 700, 'landscape': 3000, 'still-life': 1300, 'cityscape': 1300, 'seascape': 1000 };
type Subject = keyof typeof SAFE_GENRES;
/**
 * A painting written about in at least this many languages of Wikipedia counts as famous. Asked for in slices,
 * because Wikidata gives up on the whole range in one go.
 */
const FAMOUS_LINKS = [13, 15, 17, 20, 25, 100000];
/** Most famous paintings by one artist, so the famous set is not a hundred Van Goghs. */
const PER_ARTIST_FAMOUS = 12;

/** Wider or taller than this and a painting is a strip on any screen. */
const MAX_ASPECT = 2.6;
const PER_ARTIST = 30;
const PER_ARTIST_FOUND = PER_ARTIST * 3;
/** A file on Commons marked public domain for a painting later than this is more often a mistake than not. */
const LATEST_YEAR = 1955;
/** Wikidata's mark for a date given to the year (a decade is 8, a century 7). */
const YEAR_PRECISION = 9;
/** Names Wikidata gives as the collection that read wrongly in a caption: a department is credited as its museum, a sale room not at all. */
const MUSEUM_NAMES: Record<string, string | null> = {
  'Department of Paintings of the Louvre': 'Louvre Museum',
  "Christie's": null,
  "Sotheby's": null,
  "Sotheby's New York": null,
};
const SHEET = { cols: 8, rows: 6, cell: 190, label: 16 };
const THUMB_WIDTH = 250;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const qidOf = (uri: string | undefined) => /\/(Q\d+)$/.exec(uri ?? '')?.[1];
const readJson = <T,>(path: string, fallback: T): T => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback);
const log = (text: string) => process.stderr.write(`${text}\n`);

async function fetchRetry(url: string, init: RequestInit = {}, tries = 6): Promise<Response | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return res;
      if (res.status === 404) return null;
      if (attempt >= tries) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
      log(`  HTTP ${res.status}, trying again (${attempt})`);
      await sleep((Number(res.headers.get('retry-after')) || 4 * attempt) * 1000);
    } catch (error) {
      if (attempt >= tries) throw error;
      await sleep(4000 * attempt);
    }
  }
}

type Binding = Record<string, { value: string } | undefined>;

async function sparql(query: string): Promise<Binding[]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchRetry(SPARQL, {
      method: 'POST',
      body: new URLSearchParams({ query, format: 'json' }),
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    try {
      return ((await res!.json()) as { results: { bindings: Binding[] } }).results.bindings;
    } catch (error) {
      // Wikidata sometimes cuts a long answer short, which arrives as broken JSON.
      if (attempt >= 4) throw error;
      log(`  answer cut short, asking again (${attempt})`);
      await sleep(5000 * attempt);
    }
  }
}

/**
 * Runs `run` over `items` a batch at a time, keeping the answers in `cachePath` so a stopped run resumes. A kept
 * answer that `settled` turns down is asked for again.
 */
async function inBatches<T extends { key: string }>(items: string[], size: number, cachePath: string, run: (batch: string[]) => Promise<T[]>, settled: (entry: T) => boolean = () => true): Promise<Map<string, T>> {
  const known = new Map(readJson<T[]>(cachePath, []).filter(settled).map((entry) => [entry.key, entry]));
  const todo = items.filter((item) => !known.has(item));
  for (let i = 0; i < todo.length; i += size) {
    for (const entry of await run(todo.slice(i, i + size))) known.set(entry.key, entry);
    if ((i / size) % 10 === 9 || i + size >= todo.length) {
      writeFileSync(cachePath, JSON.stringify([...known.values()]));
      log(`  ${Math.min(i + size, todo.length)} / ${todo.length}`);
    }
    await sleep(300);
  }
  return known;
}

function commonsFileName(imageUrl: string): string | null {
  const name = decodeURIComponent(new URL(imageUrl).pathname.split('/Special:FilePath/')[1] ?? '');
  return /\.(jpe?g|png|webp)$/i.test(name) ? name.replace(/_/g, ' ') : null;
}

const isPublicDomain = (license: string | null) => /^(public domain|pd\b|pdm|cc0|no restrictions)/i.test((license ?? '').trim());
/** Wikidata answers a missing label with the bare id or a URL. */
const named = (label: string | undefined) => (label && !/^(Q\d+|https?:\/\/.*)$/.test(label) ? label.replace(/\s+/g, ' ').trim() : undefined);
/**
 * The name an artist is known by is the title of their English Wikipedia page ("Canaletto"), which Wikidata's own
 * label is not always ("Giovanni Antonio Canal"). A page title can end in a note to tell namesakes apart.
 */
const artistName = (page: string | undefined) => named(page?.replace(/\s*\([^)]*\)$/, ''));
const yearOf = (date: string | undefined) => { const year = /^(-?\d{1,4})-/.exec(date ?? '')?.[1]; return year && Number(year) > 0 ? Number(year) : undefined; };

/** Every painting of a genre that has a picture and a named artist, with how widely the artist is written about. */
interface Found { id: string; file: string; links: number; artistId: string; artistLinks: number }
type Chosen = Found & { genre: ArtGenre; famous?: true };
interface Fact { key: string; title?: string; artist?: string; /** Each artist's Wikidata label, with the name they go by. */ artistNames: Record<string, string>; year?: number; genres: string[]; museums: Array<[name: string, links: number]>; nude: boolean }
interface FileInfo { key: string; width: number; height: number; license: string | null }
interface Candidate { id: string; file: string; title: string; artist: string; year?: number; museum?: string; width: number; height: number; genre: ArtGenre; famous?: true }
type CollectionRow = [id: string, file: string, title: string, artist: string, year: number | null, museum: string | null, width: number, height: number, genre: ArtGenre, famous?: 1];

async function paintingsOf(genreId: string): Promise<Found[]> {
  const rows = await sparql(`SELECT ?item ?image ?links ?creator ?clinks WHERE {
  ?item wdt:P136 wd:${genreId} ; wdt:P31 wd:${PAINTING} ; wdt:P18 ?image ; wdt:P170 ?creator ; wikibase:sitelinks ?links .
  ?creator wikibase:sitelinks ?clinks .
}`);
  return foundFrom(rows);
}

const foundFrom = (rows: Binding[]): Found[] => {
  const byItem = new Map<string, Found>();
  for (const row of rows) {
    const id = qidOf(row.item?.value);
    const artistId = qidOf(row.creator?.value);
    const file = row.image && commonsFileName(row.image.value);
    if (!id || !file || !artistId || byItem.has(id)) continue;
    byItem.set(id, { id, file, links: Number(row.links?.value), artistId, artistLinks: Number(row.clinks?.value) });
  }
  return [...byItem.values()];
};

/** The famous paintings of any subject that have a picture and a named artist, best known first. */
async function famousPaintings(): Promise<Found[]> {
  const ids: string[] = [];
  for (let i = 0; i + 1 < FAMOUS_LINKS.length; i++) {
    const rows = await sparql(`SELECT ?item WHERE {
  ?item wikibase:sitelinks ?links . hint:Prior hint:rangeSafe true .
  FILTER(?links >= ${FAMOUS_LINKS[i]} && ?links < ${FAMOUS_LINKS[i + 1]}) ?item wdt:P31 wd:${PAINTING} .
}`);
    ids.push(...rows.flatMap((row) => qidOf(row.item?.value) ?? []));
    log(`  ${ids.length} famous paintings so far`);
    await sleep(2000);
  }
  const found: Found[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    found.push(...foundFrom(await sparql(`SELECT ?item ?image ?links ?creator ?clinks WHERE {
  VALUES ?item { ${ids.slice(i, i + 200).map((id) => `wd:${id}`).join(' ')} }
  ?item wdt:P18 ?image ; wdt:P170 ?creator ; wikibase:sitelinks ?links . ?creator wikibase:sitelinks ?clinks .
}`)));
    await sleep(500);
  }
  return found.sort((a, b) => b.links - a.links || a.id.localeCompare(b.id));
}

/**
 * Better-known artists first, each artist's better-known paintings first. Up to PER_ARTIST_FOUND from one artist go
 * forward, because the checks that follow drop a good share: a cut to PER_ARTIST here left Chardin with 17 of his 120.
 */
function choose(paintings: Found[], want: number, taken: Set<string>): Found[] {
  const perArtist = new Map<string, number>();
  const sorted = [...paintings].sort((a, b) => b.artistLinks - a.artistLinks || b.links - a.links || a.id.localeCompare(b.id));
  const chosen: Found[] = [];
  for (const painting of sorted) {
    if (chosen.length >= want) break;
    const count = perArtist.get(painting.artistId) ?? 0;
    if (taken.has(painting.id) || count >= PER_ARTIST_FOUND) continue;
    taken.add(painting.id);
    perArtist.set(painting.artistId, count + 1);
    chosen.push(painting);
  }
  return chosen;
}

async function details(ids: string[]): Promise<Fact[]> {
  const values = ids.map((id) => `wd:${id}`).join(' ');
  const facts = new Map(ids.map((id) => [id, { key: id, artistNames: {}, genres: [], museums: [], nude: false } as Fact]));
  for (const row of await sparql(`SELECT ?item ?itemLabel ?creatorLabel ?creatorPage ?date ?precision ?genre ?collectionLabel ?colLinks WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item wdt:P170 ?creator OPTIONAL { ?page schema:about ?creator ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?creatorPage } }
  OPTIONAL { ?item wdt:P136 ?genre }
  OPTIONAL { ?item p:P571/psv:P571 ?when . ?when wikibase:timeValue ?date ; wikibase:timePrecision ?precision }
  OPTIONAL { ?item wdt:P195 ?collection . ?collection wikibase:sitelinks ?colLinks }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
}`)) {
    const fact = facts.get(qidOf(row.item?.value) ?? '');
    if (!fact) continue;
    fact.title ??= named(row.itemLabel?.value);
    const label = named(row.creatorLabel?.value);
    const artist = artistName(row.creatorPage?.value) ?? label;
    fact.artist ??= artist;
    if (label && artist) fact.artistNames[label] = artist;
    // Only a date known to the year: "19th century" and "the 1880s" are stored as a year too, and would read as one.
    if (Number(row.precision?.value) >= YEAR_PRECISION) fact.year ??= yearOf(row.date?.value);
    const genre = qidOf(row.genre?.value);
    if (genre && !fact.genres.includes(genre)) fact.genres.push(genre);
    const museum = named(row.collectionLabel?.value);
    if (museum && !fact.museums.some(([name]) => name === museum)) fact.museums.push([museum, Number(row.colLinks?.value ?? 0)]);
  }
  // A painting with no title in English or `mul` keeps the one it was given in its own language.
  const untitled = [...facts.values()].filter((fact) => !fact.title).map((fact) => fact.key);
  if (untitled.length > 0) {
    const sources = new Map(untitled.map((id) => [id, { labels: {}, ownTitles: {}, artistLanguages: [] } as TitleSources]));
    const spoken = new Map<string, string[]>();
    for (const row of await sparql(`SELECT ?item ?kind ?text ?lang WHERE {
  VALUES ?item { ${untitled.map((id) => `wd:${id}`).join(' ')} }
  { ?item rdfs:label ?text . BIND("label" AS ?kind) BIND(LANG(?text) AS ?lang) }
  UNION { ?item wdt:P1476 ?text . BIND("own" AS ?kind) BIND(LANG(?text) AS ?lang) }
  UNION { ?item wdt:P170/wdt:P103/wdt:P424 ?lang . BIND("native" AS ?kind) }
  UNION { ?item wdt:P170/wdt:P1412/wdt:P424 ?lang . BIND("spoken" AS ?kind) }
}`)) {
      const id = qidOf(row.item?.value) ?? '';
      const source = sources.get(id);
      const lang = row.lang?.value;
      const text = row.text?.value;
      if (!source || !lang) continue;
      if (row.kind?.value === 'label' && text) source.labels[lang] = text;
      else if (row.kind?.value === 'own' && text) source.ownTitles[lang] ??= text;
      else if (row.kind?.value === 'native' && !source.artistLanguages.includes(lang)) source.artistLanguages.push(lang);
      else if (row.kind?.value === 'spoken') spoken.set(id, [...(spoken.get(id) ?? []), lang]);
    }
    for (const [id, source] of sources) {
      // The languages an artist wrote in come in no order of their own, so in the order of their codes.
      source.artistLanguages.push(...[...new Set(spoken.get(id))].sort().filter((lang) => !source.artistLanguages.includes(lang)));
      facts.get(id)!.title = named(paintingTitle(source));
    }
  }
  for (const row of await sparql(`SELECT DISTINCT ?item WHERE {
  VALUES ?item { ${values} } VALUES ?tag { ${NUDE_TAGS.map((id) => `wd:${id}`).join(' ')} }
  ?item wdt:P136|wdt:P180 ?tag .
}`)) {
    const fact = facts.get(qidOf(row.item?.value) ?? '');
    if (fact) fact.nude = true;
  }
  return [...facts.values()];
}

async function commonsInfo(files: string[]): Promise<FileInfo[]> {
  const params = new URLSearchParams({
    action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'size|extmetadata', iiextmetadatafilter: 'LicenseShortName',
    titles: files.map((name) => `File:${name}`).join('|'),
  });
  const data = await (await fetchRetry(`${COMMONS_API}?${params}`))!.json() as {
    query?: {
      normalized?: Array<{ from: string; to: string }>;
      pages?: Record<string, { title?: string; imageinfo?: Array<{ width?: number; height?: number; extmetadata?: { LicenseShortName?: { value?: string } } }> }>;
    };
  };
  // Commons answers under its own spelling of a title, so map each back to the name that was asked for.
  const spelled = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const found = new Map(Object.values(data.query?.pages ?? {}).map((page) => [(spelled.get(page.title ?? '') ?? page.title ?? '').replace(/^File:/, ''), page.imageinfo?.[0]]));
  // A file with no answer is remembered too (as size 0), so it is not asked about again.
  return files.map((key) => {
    const info = found.get(key);
    return { key, width: info?.width ?? 0, height: info?.height ?? 0, license: info?.extmetadata?.LicenseShortName?.value ?? null };
  });
}

async function candidates(work: string) {
  const taken = new Set<string>();
  const chosen: Chosen[] = [];
  const subjects = Object.keys(SAFE_GENRES) as Subject[];
  const found = {} as Record<Subject, Found[]>;
  for (const genre of subjects) {
    const cachePath = join(work, `found-${genre}.json`);
    let all = readJson<Found[] | null>(cachePath, null);
    if (!all) {
      log(`${genre}: asking Wikidata`);
      all = await paintingsOf(SAFE_GENRES[genre]);
      writeFileSync(cachePath, JSON.stringify(all));
      await sleep(2000);
    }
    found[genre] = all;
  }

  // The famous paintings go first, so no limit on a subject or an artist leaves one out. One that is a landscape,
  // seascape, cityscape or still life keeps that subject and is marked famous as well.
  const famousPath = join(work, 'found-famous.json');
  let famous = readJson<Found[] | null>(famousPath, null);
  if (!famous) {
    log('famous: asking Wikidata');
    famous = await famousPaintings();
    writeFileSync(famousPath, JSON.stringify(famous));
  }
  for (const painting of famous) {
    const genre = subjects.find((subject) => found[subject].some((other) => other.id === painting.id)) ?? 'famous';
    taken.add(painting.id);
    chosen.push({ ...painting, genre, famous: true });
  }
  log(`famous: ${famous.length} paintings taken forward`);

  for (const genre of subjects) {
    const all = found[genre];
    // Twice what is wanted: the checks below drop a good share.
    const picked = choose(all, WANT[genre] * 2, taken).map((painting) => ({ ...painting, genre }));
    log(`${genre}: ${all.length} paintings, ${picked.length} taken forward`);
    chosen.push(...picked);
  }

  const dropped: Record<string, number> = {};
  const drop = <T,>(why: string): T[] => { dropped[why] = (dropped[why] ?? 0) + 1; return []; };

  // The file first: Commons answers fifty at a time, and about a third of the pictures are too small, which saves
  // asking Wikidata about them at all.
  log('Sizes and licences');
  const files = await inBatches([...new Set(chosen.map((c) => c.file))], 50, join(work, 'files.json'), commonsInfo);
  const usable = chosen.flatMap((painting) => {
    const file = files.get(painting.file);
    if (!file || !file.width) return drop<typeof painting & { width: number; height: number }>('no file on Commons');
    if (!isPublicDomain(file.license)) return drop<typeof painting & { width: number; height: number }>('licence');
    const aspect = file.width / file.height;
    if (Math.min(file.width, file.height) < ART_MIN_SHORT_SIDE || aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) return drop<typeof painting & { width: number; height: number }>('too small or a strip');
    return [{ ...painting, width: file.width, height: file.height }];
  });

  log('Titles, artists, museums and tags');
  // A painting with no title at all is asked about again, as it may have been given one since.
  const facts = await inBatches(usable.map((c) => c.id), 100, join(work, 'facts.json'), details, (fact) => fact.title !== undefined);
  const kept = usable.flatMap((painting): Candidate[] => {
    const fact = facts.get(painting.id);
    if (!fact?.title || !fact.artist) return drop('no title or artist');
    const title = fact.title.replace(/_/g, ' ').replace(/\s*\(\d{4}\)$/, '').trim();
    // "Untitled", "Painting", or a file name that starts with the artist.
    if (/^(untitled|painting)$/i.test(title) || title.toLowerCase().startsWith(fact.artist.toLowerCase())) return drop('no title of its own');
    // A famous painting may be a religious or a history scene; whether it suits a family room is for the person looking.
    if (fact.nude || (!painting.famous && UNSAFE_GENRES.some((id) => fact.genres.includes(id)))) return drop('tagged nude or an unsafe subject');
    if (TITLE_WORDS.test(title)) return drop('title word');
    const year = fact.year;
    if (year && year > LATEST_YEAR) return drop('too recent');
    // The best-known collection: a painting often also names a former owner.
    const known = [...fact.museums].sort((a, b) => b[1] - a[1])[0]?.[0];
    const museum = known !== undefined && known in MUSEUM_NAMES ? MUSEUM_NAMES[known] : known;
    return [{
      id: painting.id, file: painting.file, title, artist: fact.artist, ...(year ? { year } : {}),
      ...(museum ? { museum } : {}), width: painting.width, height: painting.height, genre: painting.genre,
      ...(painting.famous ? { famous: true as const } : {}),
    }];
  });
  const counts: Record<string, number> = {};
  const count = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  // The paintings already in the collection are counted first, so a refresh only fills the room left under each
  // limit and never pushes out one that was looked at (`apply` keeps it either way, and the limit would be passed).
  const inCollection = new Set(readJson<CollectionRow[]>(COLLECTION_PATH, []).map((row) => row[0]));
  const final = [...kept.filter((painting) => inCollection.has(painting.id)), ...kept.filter((painting) => !inCollection.has(painting.id))]
    // Past an artist's share of the famous set, a painting is kept only as one of its subject.
    .flatMap((painting): Candidate[] => {
      if (!painting.famous || count(`famous ${painting.artist}`) <= PER_ARTIST_FAMOUS) return [painting];
      const { famous: _dropped, ...plain } = painting;
      return plain.genre === 'famous' ? [] : [plain];
    })
    .filter((painting) => painting.genre === 'famous' || count(`${painting.genre} ${painting.artist}`) <= PER_ARTIST)
    .filter((painting) => count(painting.genre) <= WANT[painting.genre]);
  writeFileSync(join(work, 'candidates.json'), JSON.stringify(final, null, 1));
  console.log(`Left out: ${JSON.stringify(dropped)}`);
  console.log(`Wrote ${final.length} candidates to ${join(work, 'candidates.json')}`);
}

const pad = (n: number) => String(n).padStart(3, '0');

async function thumb(painting: Candidate, dir: string): Promise<Buffer | null> {
  const path = join(dir, `${painting.id}.jpg`);
  if (existsSync(path)) return readFileSync(path);
  const res = await fetchRetry(`${COMMONS_FILE}/${encodeURIComponent(painting.file)}?width=${THUMB_WIDTH}`);
  if (!res) return null;
  const data = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, data);
  await sleep(250);
  return data;
}

type SheetIndex = Record<string, Record<string, string>>;

async function sheets(work: string, all: boolean) {
  const seen = new Set([...readJson<CollectionRow[]>(COLLECTION_PATH, []).map((row) => row[0]), ...Object.keys(readJson<Record<string, string>>(TURNED_DOWN_PATH, {}))]);
  const todo = readJson<Candidate[]>(join(work, 'candidates.json'), []).filter((painting) => all || !seen.has(painting.id));
  const thumbs = join(work, 'thumbs');
  const out = join(work, 'sheets');
  mkdirSync(thumbs, { recursive: true });
  mkdirSync(out, { recursive: true });
  const { cols, rows, cell, label } = SHEET;
  const per = cols * rows;
  const index: SheetIndex = {};
  const missing: string[] = [];
  for (let start = 0; start < todo.length; start += per) {
    const sheet = pad(start / per + 1);
    const tiles: Array<{ input: Buffer; left: number; top: number }> = [];
    index[sheet] = {};
    const page = todo.slice(start, start + per);
    // Two at a time, as Wikimedia's robot policy asks.
    for (let i = 0; i < page.length; i += 2) {
      await Promise.all(page.slice(i, i + 2).map(async (painting, offset) => {
        const n = i + offset + 1;
        const left = ((n - 1) % cols) * cell;
        const top = Math.floor((n - 1) / cols) * (cell + label);
        let picture = null;
        try {
          const data = await thumb(painting, thumbs);
          picture = data && await sharp(data).resize({ width: cell - 4, height: cell - 4, fit: 'inside' }).jpeg().toBuffer({ resolveWithObject: true });
        } catch {
          // A picture that will not load is listed as missing below and stays out of the collection.
        }
        if (!picture) { missing.push(painting.id); return; }
        index[sheet][n] = painting.id;
        tiles.push({ input: picture.data, left: left + Math.round((cell - picture.info.width) / 2), top: top + Math.round((cell - picture.info.height) / 2) });
        tiles.push({
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${label}"><text x="4" y="13" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="bold" fill="#ffe14d">${n}</text></svg>`),
          left, top: top + cell,
        });
      }));
    }
    await sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: '#202020' } })
      .composite(tiles).jpeg({ quality: 82 }).toFile(join(out, `${sheet}.jpg`));
    log(`  sheet ${sheet} of ${pad(Math.ceil(todo.length / per))}`);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify(index));
  console.log(`Wrote ${Object.keys(index).length} sheets to ${out}${missing.length > 0 ? `; ${missing.length} pictures would not load and are left out` : ''}`);
}

function apply(work: string) {
  const index = readJson<SheetIndex | null>(join(work, 'sheets/index.json'), null);
  if (!index) throw new Error('No sheets yet: run the sheets step and look through them first');
  const turnedDown = readJson<Record<string, string>>(TURNED_DOWN_PATH, {});
  const notes = existsSync(join(work, 'turned-down.txt')) ? readFileSync(join(work, 'turned-down.txt'), 'utf8') : '';
  for (const line of notes.split('\n')) {
    const [, sheet, rest] = /^\s*(\d{3})\s*:(.*)$/.exec(line) ?? [];
    if (!sheet) continue;
    for (const entry of rest.split(',')) {
      const [, n, why] = /^\s*(\d+)\s*(.*)$/.exec(entry) ?? [];
      if (!n) continue;
      const id = index[sheet]?.[n];
      if (!id) throw new Error(`turned-down.txt names tile ${n} on sheet ${sheet}, which is not there`);
      turnedDown[id] = why.trim() || 'turned down';
    }
  }
  const looked = new Set(Object.values(index).flatMap((tiles) => Object.values(tiles)));
  const byId = new Map(readJson<CollectionRow[]>(COLLECTION_PATH, []).map((row) => [row[0], row]));
  for (const p of readJson<Candidate[]>(join(work, 'candidates.json'), [])) {
    if (looked.has(p.id)) byId.set(p.id, [p.id, p.file, p.title, p.artist, p.year ?? null, p.museum ?? null, p.width, p.height, p.genre]);
    // A painting that was already in the collection has been looked at; being famous is only a mark on it.
    const row = byId.get(p.id);
    if (!row) continue;
    row.length = 9;
    // The mark is only for a famous painting kept under its own subject; `famous` as the subject says it already.
    if (p.famous && p.genre !== 'famous') row[9] = 1;
  }
  // A painting already in the collection keeps what was looked at, and takes its artist's name as it is written now,
  // so one artist is never in the collection under two names.
  const artistNames = Object.assign({}, ...readJson<Fact[]>(join(work, 'facts.json'), []).map((fact) => fact.artistNames)) as Record<string, string>;
  for (const row of byId.values()) row[3] = artistNames[row[3]] ?? row[3];
  const rows = [...byId.values()].filter((row) => !turnedDown[row[0]]).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));
  // One painting per line keeps a refresh readable in a diff.
  writeFileSync(COLLECTION_PATH, `[\n${rows.map((row) => JSON.stringify(row)).join(',\n')}\n]\n`);
  const sortedDown = Object.fromEntries(Object.entries(turnedDown).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1))));
  writeFileSync(TURNED_DOWN_PATH, `${JSON.stringify(sortedDown, null, 1)}\n`);
  const perGenre = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row[8]]: (acc[row[8]] ?? 0) + 1 }), {});
  console.log(`Wrote ${rows.length} paintings to ${COLLECTION_PATH} (${JSON.stringify(perGenre)}); ${Object.keys(sortedDown).length} turned down in all`);
}

const [step, ...flags] = process.argv.slice(2);
const workFlag = flags.indexOf('--work');
const work = resolve(workFlag >= 0 ? flags[workFlag + 1] : join(root, '.art-collection'));
mkdirSync(work, { recursive: true });
if (step === 'candidates') await candidates(work);
else if (step === 'sheets') await sheets(work, flags.includes('--all'));
else if (step === 'apply') apply(work);
else {
  console.error('Usage: npm run art:build -- candidates|sheets|apply [--work <dir>] [--all]');
  process.exit(1);
}
