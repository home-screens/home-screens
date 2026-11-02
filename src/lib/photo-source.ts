import type { PhotoSource, SlideshowMediaTypes } from '@/types/config';
import type { SecretKey } from '@/lib/secrets';
import { isOneDriveItemId } from '@/lib/onedrive-shared';

/**
 * The rules for "where pictures come from", shared by the hub's photo routes,
 * the wall's photo modules, background rotation and the editor's picker and
 * source fields. Pure, so every surface reads one answer to what a source
 * needs, offers and means.
 *
 * Each place a picture is chosen used to carry its own list of sources and
 * its own key checks, so a source built for one spot (Immich in the
 * background picker) was missing from the next (the Image Library). The
 * lists below are the one place a kind is offered.
 */

export type PhotoSourceKind = PhotoSource['kind'];
export type PhotoSourceOf<K extends PhotoSourceKind> = Extract<PhotoSource, { kind: K }>;

/** The route every stream of pictures is read through. */
export const PHOTO_SOURCE_MEDIA_PATH = '/api/photo-source/media';

/** Every kind, in the order the editor lists them. */
export const PHOTO_SOURCE_KINDS: readonly PhotoSourceKind[] = ['library', 'immich', 'icloud', 'onedrive', 'unsplash', 'nasa'];

export function isPhotoSourceKind(value: unknown): value is PhotoSourceKind {
  return typeof value === 'string' && (PHOTO_SOURCE_KINDS as readonly string[]).includes(value);
}

/**
 * Where a source is used:
 * - `pick`: choosing one picture, copied into the library (the Image Library)
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
  library: { secrets: [], signIn: false, pickWithoutSecrets: true },
  immich: { secrets: ['immich_url', 'immich_api_key'], signIn: false, pickWithoutSecrets: false },
  icloud: { secrets: [], signIn: false, pickWithoutSecrets: true },
  onedrive: { secrets: ['microsoft_client_id'], signIn: true, pickWithoutSecrets: false },
  unsplash: { secrets: ['unsplash_access_key'], signIn: false, pickWithoutSecrets: false },
  nasa: { secrets: [], signIn: false, pickWithoutSecrets: true },
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
 * Whether "pictures per refresh" means anything for a kind. A library folder
 * plays every picture in it, so it has no count.
 */
export function usesCount(kind: PhotoSourceKind): boolean {
  return kind !== 'library';
}

/**
 * The kinds each use offers, in the editor's order.
 *
 * Picking one picture offers the sources that can be browsed one picture at
 * a time; an iCloud album is added to the library as a whole from the
 * Local tab instead, and OneDrive has no single-picture browser yet. A
 * stream and a rotating background take every kind: every kind has still
 * pictures, and a background simply never asks for video (`canPlayVideo`
 * decides whether the video choice shows at all).
 */
export function offeredFor(use: PhotoSourceUse): readonly PhotoSourceKind[] {
  if (use === 'pick') return ['library', 'immich', 'unsplash', 'nasa'];
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
    case 'library': return { kind, folder: '' };
    case 'immich': return { kind };
    case 'icloud': return { kind, albumUrl: '' };
    case 'onedrive': return { kind, folderId: '' };
    case 'unsplash': return { kind, query: 'nature landscape' };
    case 'nasa': return { kind };
  }
}

/** A library folder as the library spells it: no leading or trailing slash. */
export function cleanLibraryFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '');
}

const IMMICH_ID = /^[a-f0-9-]{1,64}$/i;
const UNSPLASH_QUERY_MAX = 100;

/**
 * A source read from config, or null when it is not one. Configs are JSON a
 * person can edit by hand, so the wall and the rotation read through this
 * rather than trusting the shape; unknown fields are dropped.
 */
export function normalizePhotoSource(value: unknown): PhotoSource | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (key: string): string => (typeof v[key] === 'string' ? (v[key] as string) : '');
  switch (v.kind) {
    case 'library':
      return { kind: 'library', folder: cleanLibraryFolder(text('folder')) };
    case 'immich': {
      const albumId = text('albumId');
      const personId = text('personId');
      return {
        kind: 'immich',
        ...(albumId && IMMICH_ID.test(albumId) ? { albumId } : {}),
        ...(personId && IMMICH_ID.test(personId) ? { personId } : {}),
        ...(v.favoritesOnly === true ? { favoritesOnly: true } : {}),
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
    case 'unsplash':
      return { kind: 'unsplash', query: text('query').trim().slice(0, UNSPLASH_QUERY_MAX) };
    case 'nasa':
      return { kind: 'nasa' };
    default:
      return null;
  }
}

/**
 * One string per distinct set of pictures, for caches that must start over
 * when the source changes: the hub's list caches, the rotation cache and the
 * wall's rotation key. Display-only fields (a OneDrive folder's name) are
 * left out, so renaming a label never refetches.
 */
export function sourceCacheKey(source: PhotoSource): string {
  switch (source.kind) {
    case 'library': return JSON.stringify(['library', cleanLibraryFolder(source.folder)]);
    case 'immich': return JSON.stringify(['immich', source.albumId ?? null, source.personId ?? null, source.favoritesOnly === true]);
    case 'icloud': return JSON.stringify(['icloud', source.albumUrl.trim()]);
    case 'onedrive': return JSON.stringify(['onedrive', source.folderId]);
    case 'unsplash': return JSON.stringify(['unsplash', source.query.trim().toLowerCase()]);
    case 'nasa': return JSON.stringify(['nasa']);
  }
}

/**
 * Why a stream came back empty, so the wall can say where the fix is:
 * - `addPhotos`: the library folder is empty; pictures are added from a phone
 * - `checkFilters`: nothing in Immich matches the album, person and favorites choice
 * - `checkLink`: the iCloud album link is wrong or its public website is off
 * - `checkFolder`: the OneDrive folder is empty or no longer there
 * - `checkSearch`: Unsplash found nothing for the search words
 * - `tryLater`: NASA sent nothing; it comes back on its own
 */
export type PhotoSourceEmptyReason = 'addPhotos' | 'checkFilters' | 'checkLink' | 'checkFolder' | 'checkSearch' | 'tryLater';

export function emptyStateFor(source: Pick<PhotoSource, 'kind'>): PhotoSourceEmptyReason {
  switch (source.kind) {
    case 'library': return 'addPhotos';
    case 'immich': return 'checkFilters';
    case 'icloud': return 'checkLink';
    case 'onedrive': return 'checkFolder';
    case 'unsplash': return 'checkSearch';
    case 'nasa': return 'tryLater';
  }
}

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
 * changes exactly when the source does.
 */
export function photoSourceParams(source: PhotoSource): URLSearchParams {
  const params = new URLSearchParams({ kind: source.kind });
  switch (source.kind) {
    case 'library':
      if (source.folder) params.set('folder', cleanLibraryFolder(source.folder));
      break;
    case 'immich':
      if (source.albumId) params.set('album', source.albumId);
      if (source.personId) params.set('person', source.personId);
      if (source.favoritesOnly) params.set('favorites', '1');
      break;
    case 'icloud':
      if (source.albumUrl) params.set('link', source.albumUrl);
      break;
    case 'onedrive':
      if (source.folderId) params.set('folderId', source.folderId);
      break;
    case 'unsplash':
      if (source.query) params.set('query', source.query);
      break;
    case 'nasa':
      break;
  }
  return params;
}

/** The source a photo route was asked about, or null when the query names none. */
export function parsePhotoSourceParams(params: URLSearchParams): PhotoSource | null {
  const kind = params.get('kind');
  const get = (key: string) => params.get(key) ?? '';
  switch (kind) {
    case 'library': return normalizePhotoSource({ kind, folder: get('folder') });
    case 'immich': return normalizePhotoSource({ kind, albumId: get('album'), personId: get('person'), favoritesOnly: params.get('favorites') === '1' });
    case 'icloud': return normalizePhotoSource({ kind, albumUrl: get('link') });
    case 'onedrive': return normalizePhotoSource({ kind, folderId: get('folderId') });
    case 'unsplash': return normalizePhotoSource({ kind, query: get('query') });
    case 'nasa': return { kind };
    default: return null;
  }
}

/**
 * Where a picked picture lands in the library, per source. Each source has
 * its own folder (like `google-photos` and `icloud-imports`), so a household
 * can see where a copy came from and tidy one source at a time.
 */
export const IMPORT_FOLDER: Readonly<Record<'immich' | 'unsplash' | 'nasa', string>> = {
  immich: 'immich',
  unsplash: 'unsplash',
  nasa: 'nasa',
};

/** Sources whose single pictures can be copied into the library. */
export type PickImportKind = keyof typeof IMPORT_FOLDER;

export function isPickImportKind(value: unknown): value is PickImportKind {
  return value === 'immich' || value === 'unsplash' || value === 'nasa';
}

/**
 * Whether `ref` can name one picture of `kind`: an Immich asset id, an
 * Unsplash photo id, or NASA's `apod:YYYY-MM-DD` / `image:<nasa id>`. The
 * ref becomes part of a file name and an upstream URL, so the alphabet is
 * closed.
 */
export function isValidPickRef(kind: PickImportKind, ref: string): boolean {
  switch (kind) {
    case 'immich': return IMMICH_ID.test(ref);
    case 'unsplash': return /^[A-Za-z0-9_-]{1,64}$/.test(ref);
    case 'nasa': return /^apod:\d{4}-\d{2}-\d{2}$/.test(ref) || /^image:[A-Za-z0-9._-]{1,120}$/.test(ref);
  }
}
