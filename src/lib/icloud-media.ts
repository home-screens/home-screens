import { fetchSharedStreamsAlbum } from './icloud-album';
import { fetchCloudKitAlbum } from './icloud-link';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from './icloud-parse';
import type { ICloudAlbumItem } from './icloud-types';

/**
 * Single entry point for the live iCloud slideshow source. Apple ships two
 * shared-album backends and a pasted link picks which one:
 *   - photos.icloud.com/shared/album/… (iOS 27+) → CloudKit (icloud-link.ts)
 *   - icloud.com/sharedalbum/#…                   → legacy sharedstreams (icloud-album.ts)
 * Both return the same ICloudAlbumItem[] shape, so callers (the /api/icloud/photos
 * route, background rotation) stay backend-agnostic. A missing/malformed link
 * resolves to [] — the slideshow's empty state handles it.
 */
export async function fetchICloudMedia(albumUrlOrToken: string): Promise<ICloudAlbumItem[]> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return (await fetchCloudKitAlbum(cloudKitToken)) ?? [];

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbum(legacyToken) : [];
}
