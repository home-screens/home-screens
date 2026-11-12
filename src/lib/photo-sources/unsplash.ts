import { createTTLCache, fetchWithTimeout, SetupError } from '@/lib/api-utils';
import { UNSPLASH_API, getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { importPictureToLibrary } from '@/lib/library-import';
import { sourceCacheKey } from '@/lib/photo-source';
import type { MediaListItem } from '@/types/config';
import { PhotoSourceError, type BrowseItem, type BrowsePage, type PhotoSourceAdapter, type PickableSource } from './types';

/** Tiles per picker page, and the most one random request hands out. */
const PAGE_SIZE = 30;

interface UnsplashPhoto {
  id: string;
  description?: string | null;
  alt_description?: string | null;
  urls?: { raw?: string; regular?: string; small?: string; thumb?: string };
  links?: { download_location?: string };
  user?: { name?: string };
}

/**
 * A slideshow's list per search, for an hour. The free plan allows 50
 * requests an hour, and every wall refresh would otherwise spend one.
 */
const listCache = createTTLCache<MediaListItem[]>(60 * 60_000);

async function accessKey(): Promise<string> {
  const key = await getUnsplashAccessKey();
  if (!key) throw new SetupError('Add an Unsplash key in Settings > API keys', 'key', 'Unsplash');
  return key;
}

async function unsplashGet(path: string, key: string): Promise<Response> {
  const res = await fetchWithTimeout(`${UNSPLASH_API}${path}`, { headers: { Authorization: `Client-ID ${key}` } });
  if (res.status === 401) throw new SetupError('Your Unsplash key was not accepted', 'invalidKey', 'Unsplash');
  // The free plan's 50 requests an hour are spent: Unsplash answers 403 (or
  // 429) with no requests remaining. Name it, so the editor can say to wait.
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new PhotoSourceError('Unsplash\'s hourly limit is used up', 429, { error: 'unsplash-rate-limit' });
  }
  return res;
}

/**
 * Picker pages for an hour, per search and shape: going back to an idea
 * already seen costs nothing from the free plan's 50 requests an hour.
 */
const browseCache = createTTLCache<BrowsePage>(60 * 60_000);

/**
 * A picker tile per photo id, kept while the hub runs: every search page
 * fills it, so showing the photos someone picked from a search costs
 * nothing. Only a pick the hub has not seen since it started is looked up.
 */
const tileCache = new Map<string, BrowseItem>();
const TILE_CACHE_MAX = 2000;
/** The most photos one `picked` request looks up, out of the free plan's 50 requests an hour. */
const PICKED_LOOKUPS_MAX = 20;

function tileOf(photo: UnsplashPhoto): BrowseItem | null {
  const thumbUrl = photo.urls?.small ?? photo.urls?.thumb;
  if (!photo.id || !thumbUrl) return null;
  const tile: BrowseItem = {
    ref: photo.id,
    thumbUrl,
    label: photo.description || photo.alt_description || '',
    ...(photo.user?.name ? { credit: { name: photo.user.name } } : {}),
  };
  if (!tileCache.has(tile.ref) && tileCache.size >= TILE_CACHE_MAX) {
    tileCache.delete(tileCache.keys().next().value!);
  }
  tileCache.set(tile.ref, tile);
  return tile;
}

/** Download tracking, which Unsplash's API guidelines require whenever a photo is used. */
function track(photo: UnsplashPhoto, key: string): void {
  const location = photo.links?.download_location;
  // Only ever against the real API, so the key can't be sent elsewhere.
  if (location && location.startsWith(`${UNSPLASH_API}/`)) trackDownload(location, key);
}

/**
 * Which of a source's fields the hub reads: the picked photos when that list
 * exists (even empty), else the collections when that list exists, else the
 * words. The editor keeps the other fields on the entry across its mode
 * switch, so presence of a list, not its length, is what decides.
 */
export function unsplashMode(source: { collections?: string[]; photoIds?: string[] }): 'pictures' | 'collections' | 'words' {
  return source.photoIds ? 'pictures' : source.collections ? 'collections' : 'words';
}

/**
 * Whether each named collection exists and holds photos, for a day. Needed
 * because `/photos/random?collections=<id>` ignores an id Unsplash does not
 * know and answers random photos from all of Unsplash, so a typo would put
 * anything on the wall while the editor said the collection was fine.
 */
const collectionCache = createTTLCache<'ok' | 'empty' | 'missing'>(24 * 60 * 60_000);

async function collectionStatus(id: string, key: string): Promise<'ok' | 'empty' | 'missing'> {
  const cached = collectionCache.get(id);
  if (cached) return cached;
  const res = await unsplashGet(`/collections/${encodeURIComponent(id)}`, key);
  let status: 'ok' | 'empty' | 'missing';
  if (res.status === 404) status = 'missing';
  else if (!res.ok) throw new PhotoSourceError('Could not check the Unsplash collection', 502);
  else {
    const data = await res.json() as { total_photos?: number };
    status = (data.total_photos ?? 0) > 0 ? 'ok' : 'empty';
  }
  collectionCache.set(id, status);
  return status;
}

/**
 * The named collections Unsplash knows and that hold photos. When none of
 * them exists the source is told so (the editor shows it next to the id);
 * when they exist but are all empty there is simply nothing to show.
 */
async function knownCollections(ids: readonly string[], key: string): Promise<string[]> {
  const statuses = await Promise.all(ids.map(async (id) => [id, await collectionStatus(id, key)] as const));
  const known = statuses.filter(([, status]) => status !== 'missing');
  if (ids.length > 0 && known.length === 0) {
    throw new PhotoSourceError(`Unsplash has no collection ${ids.join(', ')}`, 404, { error: 'unsplash-collection-missing' });
  }
  return known.filter(([, status]) => status === 'ok').map(([id]) => id);
}

/** What a random request searches: the (checked) collections in that mode, else the words. */
function randomParams(collections: string[] | null, query: string): string {
  return collections
    ? `collections=${encodeURIComponent(collections.join(','))}`
    : `query=${encodeURIComponent(query)}`;
}

/** Unsplash's own image URL at a given width; `raw` takes their resizing parameters. */
function sized(photo: UnsplashPhoto, params: string): string | null {
  const raw = photo.urls?.raw;
  if (raw) return `${raw}${raw.includes('?') ? '&' : '?'}${params}`;
  return photo.urls?.regular ?? null;
}

export const unsplashPhotoSource: PhotoSourceAdapter<'unsplash'> & PickableSource = {
  kind: 'unsplash',

  /**
   * Hotlinked, as Unsplash's guidelines ask: the wall loads Unsplash's own
   * URLs and shows each photographer's name. One request brings up to 30
   * random photos for the search, tracked as used.
   */
  async list({ source, count }) {
    const mode = unsplashMode(source);
    if (mode === 'collections' ? source.collections!.length === 0 : mode === 'words' && !source.query) return [];
    const n = Math.min(count, PAGE_SIZE);
    const cacheKey = `${sourceCacheKey(source)}-${n}`;
    const cached = listCache.get(cacheKey);
    if (cached) return cached;
    const key = await accessKey();
    if (mode === 'pictures') {
      // Hand-picked photos, one lookup each, cached for the hour like a search.
      const photos = await Promise.all(source.photoIds!.slice(0, n).map(async (id) => {
        const res = await unsplashGet(`/photos/${encodeURIComponent(id)}`, key);
        return res.ok ? await res.json() as UnsplashPhoto : null;
      }));
      const items: MediaListItem[] = [];
      for (const photo of photos) {
        const url = photo ? sized(photo, 'w=1920&q=80&fm=jpg&fit=max') : null;
        if (!photo || !url) continue;
        track(photo, key);
        items.push({ url, type: 'image', ...(photo.user?.name ? { credit: { name: photo.user.name, source: 'Unsplash' } } : {}) });
      }
      listCache.set(cacheKey, items);
      return items;
    }
    const collections = mode === 'collections' ? await knownCollections(source.collections!, key) : null;
    if (collections && collections.length === 0) {
      listCache.set(cacheKey, []);
      return [];
    }
    const res = await unsplashGet(`/photos/random?${randomParams(collections, source.query)}&count=${n}&content_filter=high`, key);
    // No photos for these words is an empty slideshow, not an error.
    if (res.status === 404) return [];
    if (!res.ok) throw new PhotoSourceError('Could not load photos from Unsplash', 502);
    const photos = await res.json() as UnsplashPhoto[];
    const items: MediaListItem[] = [];
    for (const photo of Array.isArray(photos) ? photos : []) {
      const url = sized(photo, 'w=1920&q=80&fm=jpg&fit=max');
      if (!url) continue;
      track(photo, key);
      items.push({ url, type: 'image', ...(photo.user?.name ? { credit: { name: photo.user.name, source: 'Unsplash' } } : {}) });
    }
    listCache.set(cacheKey, items);
    return items;
  },

  async pickOne({ source, canvas, previous }) {
    const key = await accessKey();
    let photo: UnsplashPhoto;
    const mode = unsplashMode(source);
    if (mode === 'pictures') {
      // A rotation that lands on the photo already showing doesn't rotate.
      const ids = source.photoIds!;
      const others = ids.length > 1 ? ids.filter((id) => !previous?.includes(id)) : ids;
      const id = others[Math.floor(Math.random() * others.length)];
      if (!id) return null;
      const res = await unsplashGet(`/photos/${encodeURIComponent(id)}`, key);
      if (!res.ok) return null;
      photo = await res.json() as UnsplashPhoto;
    } else {
      if (mode === 'collections' ? source.collections!.length === 0 : !source.query) return null;
      const collections = mode === 'collections' ? await knownCollections(source.collections!, key) : null;
      if (collections && collections.length === 0) return null;
      // A photo shaped like the wall: a portrait photo on a landscape wall was
      // blown up to fill the width and cropped to a strip.
      const orientation = canvas.w > canvas.h * 1.1 ? 'landscape' : canvas.h > canvas.w * 1.1 ? 'portrait' : 'squarish';
      const res = await unsplashGet(`/photos/random?${randomParams(collections, source.query)}&orientation=${orientation}&content_filter=high`, key);
      if (!res.ok) return null;
      photo = await res.json() as UnsplashPhoto;
    }
    // Cropped to the canvas; `regular` is 1080 px wide whatever the wall.
    const url = sized(photo, `fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`);
    if (!url || !photo.id) return null;
    track(photo, key);
    return { kind: 'download', id: photo.id, open: () => fetchWithTimeout(url, { timeout: 60_000 }) };
  },

  async browse({ collection, query, page, orientation, refs }): Promise<BrowsePage> {
    if (collection === 'picked') {
      // The photos already picked, as tiles. A photo that is gone, or one
      // past what this request may look up, is left out: the editor still
      // lists the pick, without a picture.
      const unknown = (refs ?? []).filter((ref) => !tileCache.has(ref)).slice(0, PICKED_LOOKUPS_MAX);
      if (unknown.length > 0) {
        const key = await accessKey();
        await Promise.all(unknown.map(async (ref) => {
          try {
            const res = await unsplashGet(`/photos/${encodeURIComponent(ref)}`, key);
            if (res.ok) tileOf(await res.json() as UnsplashPhoto);
          } catch { /* the hourly limit, or Unsplash away: no picture for this one */ }
        }));
      }
      return { items: (refs ?? []).flatMap((ref) => tileCache.get(ref) ?? []), nextPage: null };
    }
    const words = query?.trim();
    if (!words) return { items: [], nextPage: null };
    const cacheKey = JSON.stringify([words.toLowerCase(), page, orientation ?? null]);
    const cached = browseCache.get(cacheKey);
    if (cached) return cached;
    const key = await accessKey();
    const params = new URLSearchParams({ query: words, page: String(page), per_page: String(PAGE_SIZE), content_filter: 'high' });
    if (orientation) params.set('orientation', orientation);
    const res = await unsplashGet(`/search/photos?${params}`, key);
    if (!res.ok) throw new PhotoSourceError('Could not search Unsplash', 502);
    const data = await res.json() as { results?: UnsplashPhoto[]; total_pages?: number };
    const result: BrowsePage = {
      items: (data.results ?? []).flatMap((p) => tileOf(p) ?? []),
      nextPage: page < (data.total_pages ?? 1) ? page + 1 : null,
    };
    browseCache.set(cacheKey, result);
    return result;
  },

  async importOne({ ref, folder }) {
    return importPictureToLibrary({
      kind: 'unsplash',
      id: ref,
      folder,
      open: async () => {
        const key = await accessKey();
        const res = await unsplashGet(`/photos/${encodeURIComponent(ref)}`, key);
        if (!res.ok) throw new PhotoSourceError('That Unsplash photo is no longer there', res.status === 404 ? 404 : 502);
        const photo = await res.json() as UnsplashPhoto;
        const url = sized(photo, 'w=2560&q=85&fm=jpg&fit=max');
        if (!url) throw new PhotoSourceError('That Unsplash photo has no picture to save', 502);
        track(photo, key);
        return { response: await fetchWithTimeout(url, { timeout: 60_000 }), title: photo.description || photo.alt_description || undefined };
      },
    });
  },
};
