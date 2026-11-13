import { fetchSharedStreamsAlbum, fetchSharedStreamsAlbumForImport } from './icloud-album';
import { fetchCloudKitAlbum } from './icloud-link';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from './icloud-parse';
import { createTTLCache } from './api-utils';
import type { ICloudAlbumItem } from './icloud-types';

/**
 * Single entry point for the live iCloud slideshow source. Apple ships two
 * shared-album backends and a pasted link picks which one:
 *   - photos.icloud.com/shared/album/… (iOS 27+) → CloudKit (icloud-link.ts)
 *   - icloud.com/sharedalbum/#…                   → legacy sharedstreams (icloud-album.ts)
 * Both return the same ICloudAlbumItem[] shape, so callers (the slideshow
 * list, the serve and video routes, background rotation) stay
 * backend-agnostic. A missing/malformed link resolves to [] — the
 * slideshow's empty state handles it.
 */
export async function fetchICloudMedia(albumUrlOrToken: string): Promise<ICloudAlbumItem[]> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return (await fetchCloudKitAlbum(cloudKitToken)) ?? [];

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbum(legacyToken) : [];
}

/**
 * The same read for an import, which has to tell a link that leads nowhere
 * any more (the album was deleted, or sharing was turned off) from an album
 * with nothing in it: null for the first, so the person hears the link is
 * dead rather than that there was nothing new.
 */
export async function fetchICloudMediaForImport(albumUrlOrToken: string): Promise<ICloudAlbumItem[] | null> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return fetchCloudKitAlbum(cloudKitToken);

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbumForImport(legacyToken) : null;
}

// ── What the wall is handed ──────────────────────────────────────────
//
// Apple's asset URLs are signed and die within the hour (about 20 minutes on
// the CloudKit backend), while a slideshow plays one list for as long as a
// pass takes. So the wall never holds one: it asks the hub for an item by its
// album link and stable guid, and the hub looks the current URL up in the
// album it already keeps for five minutes.

/** True for a link either album backend can read. */
export function isICloudAlbumLink(link: string): boolean {
  return parseICloudSharedAlbumUrl(link) !== null || parseICloudAlbumToken(link) !== null;
}

function itemQuery(albumLink: string, guid: string): string {
  return `link=${encodeURIComponent(albumLink)}&id=${encodeURIComponent(guid)}`;
}

/** A photo, or a video's poster frame, through `/api/icloud/serve`. */
export function icloudServeUrl(albumLink: string, guid: string, poster = false): string {
  return `/api/icloud/serve?${itemQuery(albumLink, guid)}${poster ? '&poster=1' : ''}`;
}

/** A video through `/api/icloud/video`. A bare `<video src>` cannot send the
 *  display's Bearer header, so the list adds an `mt` token to this. */
export function icloudVideoUrl(albumLink: string, guid: string): string {
  return `/api/icloud/video?${itemQuery(albumLink, guid)}`;
}

/** What an `mt` token for one album item is bound to. */
export function icloudMediaResource(albumLink: string, guid: string): string {
  return `icloud:${albumLink}#${guid}`;
}

/** One item of an album by its guid, or null when the album no longer has it. */
export async function findICloudItem(albumLink: string, guid: string): Promise<ICloudAlbumItem | null> {
  return (await fetchICloudMedia(albumLink)).find((item) => item.guid === guid) ?? null;
}

/**
 * Served pictures, kept a day like the Immich and OneDrive ones: the guid
 * names the same bytes for as long as the photo is in the album.
 */
export const icloudPhotoBytesCache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000);
