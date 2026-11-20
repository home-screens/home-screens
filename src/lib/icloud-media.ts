import { fetchSharedStreamsAlbumForImport, findSharedStreamsItem, listSharedStreamsAlbum } from './icloud-album';
import { fetchCloudKitAlbumForImport, findCloudKitItem, listCloudKitAlbum } from './icloud-link';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from './icloud-parse';
import { createPictureBytesCache } from './picture-proxy';
import type { ICloudAlbumEntry, ICloudAlbumItem } from './icloud-types';

/**
 * Single entry point for the live iCloud slideshow source. Apple ships two
 * shared-album backends and a pasted link picks which one:
 *   - photos.icloud.com/shared/album/… (iOS 27+) → CloudKit (icloud-link.ts)
 *   - icloud.com/sharedalbum/#…                   → legacy sharedstreams (icloud-album.ts)
 * Callers (the slideshow list, the serve and video routes, background
 * rotation) stay backend-agnostic: they list an album's items here and ask
 * for one item's links with `findICloudItem` when they serve it. Neither
 * backend makes a list wait for links: the legacy one looks them up for the
 * item being served, and CloudKit's come with each read of the album, which
 * the hub keeps coming behind the items it serves.
 * A missing/malformed link resolves to [] and the slideshow's empty state
 * handles it.
 */
export async function listICloudAlbum(albumUrlOrToken: string): Promise<ICloudAlbumEntry[]> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return (await listCloudKitAlbum(cloudKitToken)) ?? [];

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? (await listSharedStreamsAlbum(legacyToken)) ?? [] : [];
}

/** One item of an album by its guid, with its current links, or null when
 *  the album no longer has it. */
export async function findICloudItem(albumLink: string, guid: string): Promise<ICloudAlbumItem | null> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumLink);
  if (cloudKitToken) return findCloudKitItem(cloudKitToken, guid);

  const legacyToken = parseICloudAlbumToken(albumLink);
  return legacyToken ? findSharedStreamsItem(legacyToken, guid) : null;
}

/**
 * Every item with its link, for an import, which has to tell a link that
 * leads nowhere any more (the album was deleted, or sharing was turned off)
 * from an album with nothing in it: null for the first, so the person hears
 * the link is dead rather than that there was nothing new.
 */
export async function fetchICloudMediaForImport(albumUrlOrToken: string): Promise<ICloudAlbumItem[] | null> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return fetchCloudKitAlbumForImport(cloudKitToken);

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbumForImport(legacyToken) : null;
}

// ── What the wall is handed ──────────────────────────────────────────
//
// Apple's asset URLs are signed and die 15 minutes (CloudKit) or 20 (the
// legacy backend) after they are issued, while a slideshow plays one list
// for as long as a pass takes. So
// the wall never holds one: it asks the hub for an item by its album link and
// stable guid, and the hub finds the current URL (`findICloudItem`).

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

/**
 * Served pictures, kept a day like the Immich and OneDrive ones: the guid
 * names the same bytes for as long as the photo is in the album.
 */
export const icloudPhotoBytesCache = createPictureBytesCache();
