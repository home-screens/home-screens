import { createTTLCache, fetchWithTimeout, SetupError } from '@/lib/api-utils';
import { UNSPLASH_API, getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { importPictureToLibrary } from '@/lib/library-import';
import { sourceCacheKey } from '@/lib/photo-source';
import type { MediaListItem } from '@/types/config';
import { PhotoSourceError, type BrowsePage, type PhotoSourceAdapter, type PickableSource } from './types';

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

/** Download tracking, which Unsplash's API guidelines require whenever a photo is used. */
function track(photo: UnsplashPhoto, key: string): void {
  const location = photo.links?.download_location;
  // Only ever against the real API, so the key can't be sent elsewhere.
  if (location && location.startsWith(`${UNSPLASH_API}/`)) trackDownload(location, key);
}

/** What a random request searches: the collections when any are named, else the words. */
function randomParams(source: { query: string; collections?: string[] }): string {
  return source.collections?.length
    ? `collections=${encodeURIComponent(source.collections.join(','))}`
    : `query=${encodeURIComponent(source.query)}`;
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
    if (!source.photoIds && !source.collections?.length && !source.query) return [];
    const n = Math.min(count, PAGE_SIZE);
    const cacheKey = `${sourceCacheKey(source)}-${n}`;
    const cached = listCache.get(cacheKey);
    if (cached) return cached;
    const key = await accessKey();
    if (source.photoIds) {
      // Hand-picked photos, one lookup each, cached for the hour like a search.
      const photos = await Promise.all(source.photoIds.slice(0, n).map(async (id) => {
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
    const res = await unsplashGet(`/photos/random?${randomParams(source)}&count=${n}&content_filter=high`, key);
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
    if (source.photoIds) {
      // A rotation that lands on the photo already showing doesn't rotate.
      const others = source.photoIds.length > 1 ? source.photoIds.filter((id) => !previous?.includes(id)) : source.photoIds;
      const id = others[Math.floor(Math.random() * others.length)];
      if (!id) return null;
      const res = await unsplashGet(`/photos/${encodeURIComponent(id)}`, key);
      if (!res.ok) return null;
      photo = await res.json() as UnsplashPhoto;
    } else {
      if (!source.collections?.length && !source.query) return null;
      // A photo shaped like the wall: a portrait photo on a landscape wall was
      // blown up to fill the width and cropped to a strip.
      const orientation = canvas.w > canvas.h * 1.1 ? 'landscape' : canvas.h > canvas.w * 1.1 ? 'portrait' : 'squarish';
      const res = await unsplashGet(`/photos/random?${randomParams(source)}&orientation=${orientation}&content_filter=high`, key);
      if (!res.ok) return null;
      photo = await res.json() as UnsplashPhoto;
    }
    // Cropped to the canvas; `regular` is 1080 px wide whatever the wall.
    const url = sized(photo, `fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`);
    if (!url || !photo.id) return null;
    track(photo, key);
    return { kind: 'download', id: photo.id, open: () => fetchWithTimeout(url, { timeout: 60_000 }) };
  },

  async browse({ query, page, orientation }): Promise<BrowsePage> {
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
      items: (data.results ?? []).filter((p) => p.id && (p.urls?.small || p.urls?.thumb)).map((p) => ({
        ref: p.id,
        thumbUrl: (p.urls?.small ?? p.urls?.thumb)!,
        label: p.description || p.alt_description || '',
        ...(p.user?.name ? { credit: { name: p.user.name } } : {}),
      })),
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
