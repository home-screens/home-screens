import { fetchThumbnail, listPhotos, onedrivePhotoListCache, OneDriveError } from '@/lib/onedrive';
import { sourceCacheKey } from '@/lib/photo-source';
import type { SetupErrorBody } from '@/lib/fetch-error';
import type { MediaListItem } from '@/types/config';
import { PhotoSourceError, type PhotoSourceAdapter } from './types';

/**
 * A OneDrive failure as the photo routes answer it. A lapsed grant keeps its
 * 401 and carries the setup body, so the wall shows a calm "sign in again"
 * card rather than red text.
 */
function rethrow(error: unknown): never {
  if (error instanceof OneDriveError) {
    if (error.status === 401) {
      const body: SetupErrorBody = { error: error.message, code: 'setup', setup: { needs: 'connection', service: 'OneDrive' } };
      throw new PhotoSourceError(error.message, 401, { ...body });
    }
    throw new PhotoSourceError(error.message, error.status);
  }
  throw error;
}

/**
 * Pictures from one OneDrive folder and everything inside it, shuffled on
 * the hub (Graph has no random search). OneDrive is photos only: a request
 * for videos gets none and "both" gets the photos. The display never holds a
 * Graph download URL (they expire within the hour); `/api/onedrive/serve`
 * proxies and caches the bytes.
 */
export const onedrivePhotoSource: PhotoSourceAdapter<'onedrive'> = {
  kind: 'onedrive',

  async list({ source, count, media }) {
    if (!source.folderId || media === 'videos') return [];
    // The cache lives in lib/onedrive.ts so disconnecting can empty it.
    const cacheKey = `${sourceCacheKey(source)}-${count}`;
    const cached = onedrivePhotoListCache.get(cacheKey);
    if (cached) return cached;
    try {
      const photos = await listPhotos(source.folderId, count);
      const items: MediaListItem[] = photos.map((photo) => ({
        url: `/api/onedrive/serve?itemId=${encodeURIComponent(photo.id)}&size=preview`,
        type: 'image',
      }));
      onedrivePhotoListCache.set(cacheKey, items);
      return items;
    } catch (error) {
      rethrow(error);
    }
  },

  async pickOne({ source }) {
    if (!source.folderId) return null;
    try {
      const [photo] = await listPhotos(source.folderId, 1);
      if (!photo) return null;
      return {
        kind: 'download',
        id: photo.id.replace(/[^A-Za-z0-9-]/g, '_'),
        open: async () => {
          // fetchThumbnail bounds what it buffers (no thumbnail falls back to an original under 20 MB).
          const { data, contentType } = await fetchThumbnail(photo.id, 'preview');
          return new Response(data, { headers: { 'content-type': contentType } });
        },
      };
    } catch (error) {
      rethrow(error);
    }
  },
};
