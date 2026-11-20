import { createTTLCache } from './api-utils';
import { PICTURE_HEAD_BYTES, pictureContentType } from './media-formats';

/**
 * The hub's byte proxies for pictures it does not keep on disk (Immich,
 * OneDrive, an iCloud shared album, team logos): one cache rule, one check
 * of what the bytes are, and one answer, so a fix to any of them reaches
 * every source.
 */

/**
 * The largest picture kept in a day cache. A screen-sized JPEG is well under
 * a megabyte; a camera original a source has no smaller copy of can be
 * twenty. Fifty of those would take the hub's memory, so the rare big one is
 * served and not kept, and the wall's own cache holds it from there.
 */
export const MAX_CACHED_PICTURE_BYTES = 4 * 1024 * 1024;

export interface PictureBytes { data: ArrayBuffer; contentType: string }

export interface PictureBytesCache {
  get(key: string): PictureBytes | null;
  /** Keeps the picture unless it is over `MAX_CACHED_PICTURE_BYTES`. */
  set(key: string, picture: PictureBytes): void;
  clear(): void;
}

/** Served pictures, kept a day: the key names the same bytes for as long as the source has the picture. */
export function createPictureBytesCache(): PictureBytesCache {
  const cache = createTTLCache<PictureBytes>(24 * 60 * 60 * 1000);
  return {
    get: (key) => cache.get(key),
    set: (key, picture) => {
      if (picture.data.byteLength <= MAX_CACHED_PICTURE_BYTES) cache.set(key, picture);
    },
    clear: () => cache.clear(),
  };
}

export function pictureResponse(data: ArrayBuffer, contentType: string): Response {
  return new Response(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

/** What a source handed back for one picture, or the answer to send when it could not. */
export type LoadedPicture = { data: ArrayBuffer; declaredType: string | null } | Response;

/**
 * Answer one picture: from the cache when it is there, otherwise loaded,
 * told apart by its first bytes when the source's own Content-Type says
 * nothing useful (`fallbackType` when even that fails), kept if it is small
 * enough, and sent.
 */
export async function servePicture(
  cache: PictureBytesCache,
  key: string,
  fallbackType: string,
  load: () => Promise<LoadedPicture>,
): Promise<Response> {
  const cached = cache.get(key);
  if (cached) return pictureResponse(cached.data, cached.contentType);
  const loaded = await load();
  if (loaded instanceof Response) return loaded;
  const { data, declaredType } = loaded;
  const contentType = pictureContentType(declaredType, new Uint8Array(data).subarray(0, PICTURE_HEAD_BYTES)) ?? declaredType ?? fallbackType;
  cache.set(key, { data, contentType });
  return pictureResponse(data, contentType);
}
