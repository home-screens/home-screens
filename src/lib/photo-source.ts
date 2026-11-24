import type { ArtFit, ArtFrame, ArtGenre, ArtLabel, ArtMat, ArtOrientation, ArtWall, BackgroundRotation, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import type { SecretKey } from '@/lib/secrets';
import { isOneDriveItemId } from '@/lib/onedrive-shared';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from '@/lib/icloud-parse';

/**
 * The rules for "where pictures come from", shared by the hub's photo routes,
 * the wall's photo modules, background rotation and the editor's picker and
 * source fields. Pure and browser-safe, so every surface reads one answer to
 * what a source needs, offers, holds and means.
 *
 * Each place a picture is chosen used to carry its own list of sources and
 * its own key checks, so a source built for one spot (Immich in the
 * background picker) was missing from the next (the Pictures & videos window). The
 * lists below are the one place a kind is offered.
 */

export type PhotoSourceKind = PhotoSource['kind'];
export type PhotoSourceOf<K extends PhotoSourceKind> = Extract<PhotoSource, { kind: K }>;

/** The route every stream of pictures is read through. */
export const PHOTO_SOURCE_MEDIA_PATH = '/api/photo-source/media';

/** Every kind, in the order the editor lists them. */
export const PHOTO_SOURCE_KINDS: readonly PhotoSourceKind[] = ['wall', 'library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa', 'art'];

export function isPhotoSourceKind(value: unknown): value is PhotoSourceKind {
  return typeof value === 'string' && (PHOTO_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * Where a source is used:
 * - `pick`: choosing one picture, copied into the library (the Pictures & videos window)
 * - `stream`: a changing list of pictures (Photo Slideshow, Full-screen Photo)
 * - `background`: a screen's rotating background, one still picture at a time
 */
export type PhotoSourceUse = 'pick' | 'stream' | 'background';

export interface PhotoSourceNeeds {
  /** Secrets on Settings > API keys that must all be saved. */
  secrets: readonly SecretKey[];
  /** True when a sign-in is needed on top of the secrets (OneDrive's Microsoft account). */
  signIn: boolean;
  /** True when picking one picture works without the secrets. */
  pickWithoutSecrets: boolean;
}

const NEEDS: Record<PhotoSourceKind, PhotoSourceNeeds> = {
  wall: { secrets: [], signIn: false, pickWithoutSecrets: true },
  library: { secrets: [], signIn: false, pickWithoutSecrets: true },
  immich: { secrets: ['immich_url', 'immich_api_key'], signIn: false, pickWithoutSecrets: false },
  icloud: { secrets: [], signIn: false, pickWithoutSecrets: true },
  onedrive: { secrets: ['microsoft_client_id'], signIn: true, pickWithoutSecrets: false },
  unsplash: { secrets: ['unsplash_access_key'], signIn: false, pickWithoutSecrets: false },
  nasa: { secrets: [], signIn: false, pickWithoutSecrets: true },
  art: { secrets: [], signIn: false, pickWithoutSecrets: true },
};

/** What a kind needs before it can show anything. */
export function needs(kind: PhotoSourceKind): PhotoSourceNeeds {
  return NEEDS[kind];
}

/** Whether a kind can hand the wall videos as well as pictures. */
export function canPlayVideo(kind: PhotoSourceKind): boolean {
  return kind === 'library' || kind === 'immich' || kind === 'icloud';
}

/**
 * Whether a source can hand back the moving half of a Live Photo.
 *
 * Only a library folder: the clip is a file sitting beside its still, and
 * nothing else the wall pulls from has one. Hand-picked library pictures do
 * not either, because they play in the order they were chosen and never go
 * through the folder scan that does the pairing. Offering the setting
 * anywhere else promises motion that cannot arrive.
 */
export function canPlayLivePhotos(source: PhotoSource): boolean {
  // `list()` treats any `pictures` array as hand-picked mode, even an empty
  // one, so the test is for the array and not for its length. With picking
  // turned on and nothing picked yet, the setting would otherwise be offered
  // where it can never apply.
  return source.kind === 'library' && !source.pictures;
}

/**
 * Whether "pictures per refresh" means anything for a kind. A library folder
 * plays every picture in it, so it has no count.
 */
export function usesCount(kind: PhotoSourceKind): boolean {
  return kind !== 'library' && kind !== 'wall';
}

/**
 * The kinds each use offers, in the editor's order.
 *
 * Picking one picture offers the sources that can be browsed one picture at
 * a time; an iCloud album is added to the library as a whole from the
 * library tab instead, and OneDrive has no single-picture browser yet. A
 * stream takes every kind of photos; a rotating background takes those and
 * the walls that come with Home Screens, which are no good as a slideshow.
 */
export function offeredFor(use: PhotoSourceUse): readonly PhotoSourceKind[] {
  if (use === 'pick') return ['library', 'immich', 'unsplash', 'nasa', 'art'];
  if (use === 'stream') return PHOTO_SOURCE_KINDS.filter((kind) => kind !== 'wall');
  return PHOTO_SOURCE_KINDS;
}

/**
 * Whether the keys a kind needs are saved. `status` is the editor's secret
 * status (`useSecretStatus`); the hub checks the secrets themselves. OneDrive's
 * sign-in is not visible here: its own fields show whether it is connected.
 */
export function isReady(kind: PhotoSourceKind, status: Readonly<Record<string, boolean>>, use: PhotoSourceUse = 'stream'): boolean {
  const need = NEEDS[kind];
  if (use === 'pick' && need.pickWithoutSecrets) return true;
  return need.secrets.every((key) => status[key] === true);
}

/** A fresh source of one kind, for the editor's source switch. */
export function defaultPhotoSource(kind: PhotoSourceKind): PhotoSource {
  switch (kind) {
    case 'wall': return { kind, group: 'color', ids: [] };
    case 'library': return { kind, folder: '' };
    case 'immich': return { kind };
    case 'icloud': return { kind, albumUrl: '' };
    case 'onedrive': return { kind, folderId: '' };
    case 'unsplash': return { kind, query: 'nature landscape' };
    case 'nasa': return { kind };
    case 'art': return { kind };
  }
}

/** A library folder as the library spells it: no leading or trailing slash. */
export function cleanLibraryFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '');
}

/** A library path as a chosen picture names it: a file inside the library, never a serve URL or a climb out. */
export function cleanLibraryPath(path: string): string | null {
  const clean = path.trim().replace(/^\/+/, '');
  if (!clean || clean.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  return clean;
}

const IMMICH_ID = /^[a-f0-9-]{1,64}$/i;
const UNSPLASH_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UNSPLASH_COLLECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const WALL_ID = /^[a-z0-9-]{1,64}$/;
const UNSPLASH_QUERY_MAX = 100;
const ART_TEXT_MAX = 300;

/**
 * The names in an art source's artist text. Commas part them, and a painting
 * by any one of them matches.
 */
export const artArtists = (text: string | undefined): string[] => (text ?? '').split(',').map((name) => name.trim()).filter(Boolean);

/** An Unsplash source's search words, as they are searched for. */
export const unsplashWords = (source: { query: string }): string => source.query.trim();
const WIKIDATA_ID = /^Q\d{1,12}$/;
export const ART_ORIENTATIONS: readonly ArtOrientation[] = ['any', 'portrait', 'landscape'];
export const ART_FITS: readonly ArtFit[] = ['framed', 'mat', 'matte', 'cover', 'contain'];
export const ART_WALLS: readonly ArtWall[] = ['charcoal', 'warm-white', 'sage', 'painting'];
/** The mats each fit offers: a frame can sit straight on the painting, a mat that fills the screen can take its colour from it. */
export const ART_MATS: Readonly<Record<'framed' | 'mat', readonly ArtMat[]>> = { framed: ['cream', 'white', 'charcoal', 'none'], mat: ['cream', 'white', 'charcoal', 'painting'] };
export const ART_FRAMES: readonly ArtFrame[] = ['black', 'oak', 'gold', 'white'];
export const ART_LABELS: readonly ArtLabel[] = ['brief', 'always', 'off'];
export const ART_GENRES: readonly ArtGenre[] = ['famous', 'landscape', 'seascape', 'cityscape', 'still-life'];
export const ART_YEAR_MIN = 0;
export const ART_YEAR_MAX = 2100;
export const DEFAULT_ART_FIT: ArtFit = 'framed';
export const DEFAULT_ART_WALL: ArtWall = 'charcoal';
export const DEFAULT_ART_MAT: ArtMat = 'cream';
export const DEFAULT_ART_FRAME: ArtFrame = 'black';
export const DEFAULT_ART_LABEL: ArtLabel = 'brief';
export function artNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : undefined;
}
/** The most hand-picked pictures one source carries; the editor stops offering more. */
export const MAX_PICKED_PICTURES = 200;

/**
 * The entries of a list that pass `test`, without repeats, capped. A list
 * with nothing usable in it is dropped, unless it marks a mode (chosen
 * pictures, picked photos, collections): there an empty list means "this
 * mode, nothing picked yet" and is kept as `[]`.
 */
function idList(value: unknown, test: (id: string) => boolean, options: { keepEmpty?: boolean; max?: number } = {}): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const max = options.max ?? MAX_PICKED_PICTURES;
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (id && test(id) && !seen.has(id)) seen.add(id);
    if (seen.size >= max) break;
  }
  return seen.size > 0 || options.keepEmpty ? [...seen] : undefined;
}

/**
 * A source read from config, or null when it is not one. Configs are JSON a
 * person can edit by hand, so the wall and the rotation read through this
 * rather than trusting the shape; unknown fields are dropped. A singular
 * `albumId` or `personId` from before the lists is read as a one-entry list.
 */
export function normalizePhotoSource(value: unknown): PhotoSource | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (key: string): string => (typeof v[key] === 'string' ? (v[key] as string) : '');
  switch (v.kind) {
    case 'wall': {
      const group = v.group === 'pattern' ? 'pattern' : v.group === 'color' ? 'color' : null;
      if (!group) return null;
      return { kind: 'wall', group, ids: idList(v.ids, (id) => WALL_ID.test(id)) ?? [] };
    }
    case 'library': {
      const pictures = idList(v.pictures, (p) => cleanLibraryPath(p) === p, { keepEmpty: true });
      return { kind: 'library', folder: cleanLibraryFolder(text('folder')), ...(pictures ? { pictures } : {}) };
    }
    case 'immich': {
      const albumIds = idList(v.albumIds ?? (text('albumId') ? [text('albumId')] : undefined), (id) => IMMICH_ID.test(id));
      const personIds = idList(v.personIds ?? (text('personId') ? [text('personId')] : undefined), (id) => IMMICH_ID.test(id));
      const excludePersonIds = idList(v.excludePersonIds, (id) => IMMICH_ID.test(id));
      const assetIds = idList(v.assetIds, (id) => IMMICH_ID.test(id), { keepEmpty: true });
      return {
        kind: 'immich',
        ...(albumIds ? { albumIds } : {}),
        ...(personIds ? { personIds } : {}),
        ...(excludePersonIds ? { excludePersonIds } : {}),
        ...(v.favoritesOnly === true ? { favoritesOnly: true } : {}),
        ...(assetIds ? { assetIds } : {}),
      };
    }
    case 'icloud':
      return { kind: 'icloud', albumUrl: text('albumUrl').trim() };
    case 'onedrive': {
      const folderId = text('folderId');
      const folderName = text('folderName');
      return {
        kind: 'onedrive',
        folderId: folderId && isOneDriveItemId(folderId) ? folderId : '',
        ...(folderName ? { folderName } : {}),
      };
    }
    case 'unsplash': {
      const collections = idList(v.collections, (id) => UNSPLASH_COLLECTION_ID.test(id), { keepEmpty: true });
      const photoIds = idList(v.photoIds, (id) => UNSPLASH_ID.test(id), { keepEmpty: true });
      return {
        kind: 'unsplash',
        // Kept as typed, spaces at the ends included: the editor's box shows this value while
        // someone is still typing, and a trim here would eat the space between two words.
        query: text('query').slice(0, UNSPLASH_QUERY_MAX),
        ...(collections ? { collections } : {}),
        ...(photoIds ? { photoIds } : {}),
      };
    }
    case 'nasa':
      return { kind: 'nasa' };
    case 'art': {
      // Kept as typed, like Unsplash's words: `artArtists` reads the names out of it.
      const artist = text('artist').slice(0, ART_TEXT_MAX);
      const orientation = ART_ORIENTATIONS.find((o) => o === v.orientation);
      const fit = ART_FITS.find((f) => f === v.fit);
      const genre = ART_GENRES.find((g) => g === v.genre);
      const fromYear = artNumber(v.fromYear, ART_YEAR_MIN, ART_YEAR_MAX);
      const toYear = artNumber(v.toYear, ART_YEAR_MIN, ART_YEAR_MAX);
      const aspectTolerance = typeof v.aspectTolerance === 'number' && Number.isFinite(v.aspectTolerance) ? Math.min(Math.max(v.aspectTolerance, 0), 1) : undefined;
      const wall = ART_WALLS.find((w) => w === v.wall);
      // A mat is kept only where the fit offers it, so a frame is never left with a mat coloured "from the painting".
      const mat = (fit === 'mat' ? ART_MATS.mat : ART_MATS.framed).find((m) => m === v.mat);
      const frame = ART_FRAMES.find((f) => f === v.frame);
      const label = ART_LABELS.find((l) => l === v.label);
      return {
        kind: 'art',
        ...(artist.trim() ? { artist } : {}),
        ...(fromYear !== undefined ? { fromYear } : {}),
        ...(toYear !== undefined ? { toYear } : {}),
        ...(genre ? { genre } : {}),
        ...(orientation && orientation !== 'any' ? { orientation } : {}),
        ...(aspectTolerance !== undefined ? { aspectTolerance } : {}),
        ...(fit ? { fit } : {}),
        ...(wall ? { wall } : {}),
        ...(mat ? { mat } : {}),
        ...(frame ? { frame } : {}),
        ...(label ? { label } : {}),
        ...(v.texture === false ? { texture: false } : {}),
        ...(v.drift === true ? { drift: true } : {}),
      };
    }
    default:
      return null;
  }
}

/** Every source in a rotation that reads as one; a hand-edited entry that does not is skipped. */
export function rotationSources(rotation: Pick<BackgroundRotation, 'sources'> | undefined): PhotoSource[] {
  if (!rotation || !Array.isArray(rotation.sources)) return [];
  return rotation.sources.map(normalizePhotoSource).filter((source): source is PhotoSource => source !== null);
}

/**
 * Whether a source names any pictures at all, from its own fields alone: the
 * walls picked, the pictures chosen, a link that parses, words to search. A
 * source that does not takes no turn in a rotation and the editor says so
 * next to it. Keys are a separate question (`isReady`), and whether the
 * folder or album actually holds anything is the hub's to find out.
 *
 * A kind with several ways to name pictures reads only the one in use: a
 * picked list that exists (even empty) is the mode, then Unsplash's
 * collections list, then the words. The editor keeps the other fields on
 * the entry across its mode switch, so they must not count here.
 */
export function hasContent(source: PhotoSource): boolean {
  switch (source.kind) {
    case 'wall': return source.ids.length > 0;
    case 'library': return source.pictures ? source.pictures.length > 0 : true;
    case 'immich': return source.assetIds ? source.assetIds.length > 0 : true;
    case 'icloud': return !!(parseICloudSharedAlbumUrl(source.albumUrl) || parseICloudAlbumToken(source.albumUrl));
    case 'onedrive': return source.folderId !== '';
    case 'unsplash': return source.photoIds ? source.photoIds.length > 0 : source.collections ? source.collections.length > 0 : unsplashWords(source) !== '';
    case 'nasa': return true;
    case 'art': return true;
  }
}

/** A source that can take a turn in a rotation on this hub: it names pictures and its keys are saved. */
export function canRotate(source: PhotoSource, status: Readonly<Record<string, boolean>>): boolean {
  return hasContent(source) && isReady(source.kind, status, 'background');
}

/**
 * How many pictures a source can show when that is known from its fields
 * (walls, chosen pictures, picked photos). A folder, an album or a search
 * answers undefined: the hub finds out.
 */
export function candidateCount(source: PhotoSource): number | undefined {
  switch (source.kind) {
    case 'wall': return source.ids.length;
    case 'library': return source.pictures?.length;
    case 'immich': return source.assetIds?.length;
    case 'unsplash': return source.photoIds?.length;
    default: return undefined;
  }
}

/**
 * A rotation is on when any of its sources names pictures. Keys are not
 * asked here: the wall does not know them, and a keyless source answers
 * nothing rather than blanking the wall. The editor reads `canRotate` per
 * row for the finer word.
 */
export function isRotationActive(rotation: Pick<BackgroundRotation, 'sources'> | undefined): boolean {
  return rotationSources(rotation).some(hasContent);
}

/**
 * What the rotation can show, counted across its sources: `none`, `one`
 * (exactly one picture is named, so it is a fixed picture in all but name)
 * or `many`. A source whose count the hub decides counts as many.
 */
export function rotationBreadth(rotation: Pick<BackgroundRotation, 'sources'> | undefined, status?: Readonly<Record<string, boolean>>): 'none' | 'one' | 'many' {
  let total = 0;
  for (const source of rotationSources(rotation)) {
    if (status ? !canRotate(source, status) : !hasContent(source)) continue;
    const count = candidateCount(source);
    if (count === undefined) return 'many';
    total += count;
    if (total > 1) return 'many';
  }
  return total === 1 ? 'one' : 'none';
}

/**
 * One string per distinct set of pictures, for caches that must start over
 * when the source changes: the hub's list caches, the rotation cache and the
 * wall's rotation key. Display-only fields (a OneDrive folder's name) are
 * left out, so renaming a label never refetches.
 */
export function sourceCacheKey(source: PhotoSource): string {
  switch (source.kind) {
    case 'wall': return JSON.stringify(['wall', source.group, [...source.ids].sort()]);
    case 'library': return JSON.stringify(['library', cleanLibraryFolder(source.folder), source.pictures ? [...source.pictures].sort() : null]);
    case 'immich': return JSON.stringify([
      'immich',
      [...(source.albumIds ?? [])].sort(),
      [...(source.personIds ?? [])].sort(),
      [...(source.excludePersonIds ?? [])].sort(),
      source.favoritesOnly === true,
      source.assetIds ? [...source.assetIds].sort() : null,
    ]);
    case 'icloud': return JSON.stringify(['icloud', source.albumUrl.trim()]);
    case 'onedrive': return JSON.stringify(['onedrive', source.folderId]);
    case 'unsplash': return JSON.stringify([
      'unsplash',
      unsplashWords(source).toLowerCase(),
      [...(source.collections ?? [])].sort(),
      source.photoIds ? [...source.photoIds].sort() : null,
    ]);
    case 'nasa': return JSON.stringify(['nasa']);
    case 'art': return JSON.stringify([
      'art', artArtists(source.artist).map((name) => name.toLowerCase()).sort().join(','), source.fromYear ?? null, source.toYear ?? null, source.genre ?? null,
      source.orientation ?? 'any', source.aspectTolerance ?? null, source.fit ?? DEFAULT_ART_FIT,
      source.wall ?? null, source.mat ?? null, source.frame ?? null, source.label ?? null, source.texture ?? null, source.drift ?? null,
    ]);
  }
}

/**
 * The one key the hub's rotation cache and the wall's poll both start over
 * on: every source's key, in a fixed order, plus the interval. Entries that
 * name nothing are left out, so ticking an empty group changes nothing.
 */
export function rotationCacheKey(rotation: Pick<BackgroundRotation, 'sources' | 'intervalMinutes'> | undefined): string {
  if (!rotation) return '';
  const keys = rotationSources(rotation).filter(hasContent).map(sourceCacheKey).sort();
  return JSON.stringify([keys, rotation.intervalMinutes]);
}

/**
 * Why a stream came back empty, so the wall can say where the fix is:
 * - `addPhotos`: the library folder is empty; pictures are added from a phone
 * - `pickPictures`: nothing has been picked yet (chosen pictures, picked photos, walls)
 * - `checkFilters`: nothing in Immich matches the albums, people and favorites choice
 * - `checkLink`: the iCloud album link is wrong or its public website is off
 * - `checkFolder`: the OneDrive folder is empty or no longer there
 * - `checkSearch`: Unsplash found nothing for the search words or collection
 * - `checkArt`: no painting matched the filters
 * - `tryLater`: NASA sent nothing; it comes back on its own
 */
export type PhotoSourceEmptyReason = 'addPhotos' | 'pickPictures' | 'checkFilters' | 'checkLink' | 'checkFolder' | 'checkSearch' | 'checkArt' | 'tryLater';

export function emptyStateFor(source: PhotoSource): PhotoSourceEmptyReason {
  switch (source.kind) {
    case 'wall': return 'pickPictures';
    case 'library': return source.pictures ? 'pickPictures' : 'addPhotos';
    case 'immich': return source.assetIds ? 'pickPictures' : 'checkFilters';
    case 'icloud': return 'checkLink';
    case 'onedrive': return 'checkFolder';
    case 'unsplash': return source.photoIds ? 'pickPictures' : 'checkSearch';
    case 'nasa': return 'tryLater';
    case 'art': return 'checkArt';
  }
}

/**
 * What a photo module with no pictures says, by why it has none
 * (`emptyStateFor`): a title, and where the fix is. Keys in the `modules`
 * dictionary. The slideshow card and the full-screen photo both draw these,
 * so the iCloud or OneDrive advice is written, and translated, once.
 * `addPhotos` is fixed from a phone, so its hint carries `{url}` for the
 * hub's phone address (`FamilyEmptyState`); every other fix is in the editor.
 */
export const PHOTO_EMPTY_KEYS: Record<PhotoSourceEmptyReason, { title: string; hint: string }> = {
  addPhotos: { title: 'common.photoEmpty.noPhotos', hint: 'common.photoEmpty.hint.addPhotos' },
  pickPictures: { title: 'common.photoEmpty.nonePicked', hint: 'common.photoEmpty.hint.pickPictures' },
  checkFilters: { title: 'common.photoEmpty.noPhotos', hint: 'common.photoEmpty.hint.checkFilters' },
  checkLink: { title: 'common.photoEmpty.noPhotos', hint: 'common.photoEmpty.hint.checkLink' },
  checkFolder: { title: 'common.photoEmpty.noPhotos', hint: 'common.photoEmpty.hint.checkFolder' },
  checkSearch: { title: 'common.photoEmpty.noPhotos', hint: 'common.photoEmpty.hint.checkSearch' },
  checkArt: { title: 'common.photoEmpty.noPaintings', hint: 'common.photoEmpty.hint.checkArt' },
  tryLater: { title: 'common.photoEmpty.noneFromNasa', hint: 'common.photoEmpty.hint.tryLater' },
};

/** Pictures per refresh: 50 unless set, held to 1..`maxPhotoCount(kind)`. */
export const DEFAULT_PHOTO_COUNT = 50;
export const MAX_PHOTO_COUNT = 200;

/**
 * The most pictures one refresh of a kind can bring. Unsplash hands out at
 * most 30 random photos per request, and its free plan allows 50 requests an
 * hour, so a slideshow takes one request's worth.
 */
export function maxPhotoCount(kind: PhotoSourceKind): number {
  return kind === 'unsplash' ? 30 : MAX_PHOTO_COUNT;
}

export function clampPhotoCount(value: unknown, kind?: PhotoSourceKind): number {
  const max = kind ? maxPhotoCount(kind) : MAX_PHOTO_COUNT;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Math.min(DEFAULT_PHOTO_COUNT, max);
  return Math.min(Math.max(Math.round(n), 1), max);
}

export function isMediaTypes(value: unknown): value is SlideshowMediaTypes {
  return value === 'photos' || value === 'videos' || value === 'both';
}

/**
 * The query string that names a source on the hub's photo routes. Kept
 * short and flat so a list URL stays readable in logs and its fetch key
 * changes exactly when the source does. Lists travel comma-joined; the ids
 * never carry a comma (see the alphabets above).
 */
export function photoSourceParams(source: PhotoSource): URLSearchParams {
  const params = new URLSearchParams({ kind: source.kind });
  const list = (key: string, ids: string[] | undefined) => { if (ids?.length) params.set(key, ids.join(',')); };
  switch (source.kind) {
    case 'wall':
      params.set('group', source.group);
      list('ids', source.ids);
      break;
    case 'library':
      if (source.folder) params.set('folder', cleanLibraryFolder(source.folder));
      list('pictures', source.pictures);
      break;
    case 'immich':
      list('albums', source.albumIds);
      list('people', source.personIds);
      list('exclude', source.excludePersonIds);
      if (source.favoritesOnly) params.set('favorites', '1');
      list('assets', source.assetIds);
      break;
    case 'icloud':
      if (source.albumUrl) params.set('link', source.albumUrl);
      break;
    case 'onedrive':
      if (source.folderId) params.set('folderId', source.folderId);
      break;
    case 'unsplash':
      if (unsplashWords(source)) params.set('query', unsplashWords(source));
      list('collections', source.collections);
      list('photos', source.photoIds);
      break;
    case 'nasa':
      break;
    case 'art':
      if (artArtists(source.artist).length > 0) params.set('artist', artArtists(source.artist).join(', '));
      if (source.fromYear !== undefined) params.set('from', String(source.fromYear));
      if (source.toYear !== undefined) params.set('to', String(source.toYear));
      if (source.genre) params.set('genre', source.genre);
      if (source.orientation) params.set('orientation', source.orientation);
      if (source.aspectTolerance !== undefined) params.set('tolerance', String(source.aspectTolerance));
      if (source.fit) params.set('fit', source.fit);
      if (source.wall) params.set('wall', source.wall);
      if (source.mat) params.set('mat', source.mat);
      if (source.frame) params.set('frame', source.frame);
      if (source.label) params.set('label', source.label);
      if (source.texture === false) params.set('texture', '0');
      if (source.drift) params.set('drift', '1');
      break;
  }
  return params;
}

/** The source a photo route was asked about, or null when the query names none. */
export function parsePhotoSourceParams(params: URLSearchParams): PhotoSource | null {
  const kind = params.get('kind');
  const get = (key: string) => params.get(key) ?? '';
  const list = (key: string) => (params.get(key) ? params.get(key)!.split(',') : undefined);
  switch (kind) {
    case 'wall': return normalizePhotoSource({ kind, group: get('group'), ids: list('ids') ?? [] });
    case 'library': return normalizePhotoSource({ kind, folder: get('folder'), pictures: list('pictures') });
    case 'immich': return normalizePhotoSource({
      kind, albumIds: list('albums'), personIds: list('people'), excludePersonIds: list('exclude'),
      favoritesOnly: params.get('favorites') === '1', assetIds: list('assets'),
    });
    case 'icloud': return normalizePhotoSource({ kind, albumUrl: get('link') });
    case 'onedrive': return normalizePhotoSource({ kind, folderId: get('folderId') });
    case 'unsplash': return normalizePhotoSource({ kind, query: get('query'), collections: list('collections'), photoIds: list('photos') });
    case 'nasa': return { kind };
    case 'art': return normalizePhotoSource({
      kind, artist: get('artist'), orientation: get('orientation'), genre: get('genre'),
      fromYear: params.has('from') ? Number(get('from')) : undefined,
      toYear: params.has('to') ? Number(get('to')) : undefined,
      aspectTolerance: params.has('tolerance') ? Number(get('tolerance')) : undefined,
      fit: get('fit'), wall: get('wall'), mat: get('mat'), frame: get('frame'), label: get('label'),
      texture: params.get('texture') === '0' ? false : undefined,
      drift: params.get('drift') === '1',
    });
    default: return null;
  }
}

/**
 * Where a picked picture lands in the library, per source. Each source has
 * its own folder (like `google-photos` and `icloud-imports`), so a household
 * can see where a copy came from and tidy one source at a time.
 */
export const IMPORT_FOLDER: Readonly<Record<'immich' | 'unsplash' | 'nasa' | 'art', string>> = {
  immich: 'immich',
  unsplash: 'unsplash',
  nasa: 'nasa',
  art: 'art',
};

/** Sources whose single pictures can be copied into the library. */
export type PickImportKind = keyof typeof IMPORT_FOLDER;

export function isPickImportKind(value: unknown): value is PickImportKind {
  return value === 'immich' || value === 'unsplash' || value === 'nasa' || value === 'art';
}

/**
 * Whether `ref` can name one picture of `kind`: an Immich asset id, an
 * Unsplash photo id, NASA's `apod:YYYY-MM-DD` / `image:<nasa id>`, or a
 * painting's Wikidata id. The ref becomes part of a file name and an upstream
 * URL, so the alphabet is closed.
 */
export function isValidPickRef(kind: PickImportKind, ref: string): boolean {
  switch (kind) {
    case 'immich': return IMMICH_ID.test(ref);
    case 'unsplash': return UNSPLASH_ID.test(ref);
    case 'nasa': return /^apod:\d{4}-\d{2}-\d{2}$/.test(ref) || /^image:[A-Za-z0-9._-]{1,120}$/.test(ref);
    case 'art': return WIKIDATA_ID.test(ref);
  }
}
