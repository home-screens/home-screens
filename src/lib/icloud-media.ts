import { fetchSharedStreamsAlbumForImport, findSharedStreamsItem, listSharedStreamsAlbum } from './icloud-album';
import { fetchCloudKitAlbumForImport, findCloudKitItem, listCloudKitAlbum } from './icloud-link';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from './icloud-parse';
import { createTTLCache, fetchWithTimeout } from './api-utils';
import { extensionForContentType, sniffImageContentType } from './media-formats';
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

/** Enough of a picture's start to tell what it is (`sniffImageContentType`). */
const PICTURE_HEAD_BYTES = 12;

/** The first bytes of a body, and a body that still carries all of it. */
async function peekBody(body: ReadableStream<Uint8Array>, wanted: number): Promise<{ head: Uint8Array; body: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const read: Uint8Array[] = [];
  let have = 0;
  while (have < wanted) {
    const { done, value } = await reader.read();
    if (done) break;
    read.push(value);
    have += value.length;
  }
  const rest = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of read) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head: Buffer.concat(read).subarray(0, wanted), body: rest };
}

/**
 * Download a photo or a poster frame from one of Apple's links, answered
 * with the media type of what it is. The legacy backend names its pictures
 * (`image/jpeg`); the newer one answers every file as
 * `application/octet-stream`, whatever it holds. A browser paints that
 * anyway, but a rotating background is saved under a name taken from the
 * type and had none to take, so a newer album never gave it a picture. Where
 * Apple does not name a picture type, the first bytes say which it is; bytes
 * that are no picture the wall can show keep the type Apple gave.
 */
export async function fetchICloudPicture(url: string): Promise<Response> {
  const res = await fetchWithTimeout(url, { timeout: 30_000 });
  const declared = res.headers.get('content-type');
  if (!res.ok || !res.body || extensionForContentType(declared, 'image')) return res;
  const { head, body } = await peekBody(res.body, PICTURE_HEAD_BYTES);
  const contentType = sniffImageContentType(head) ?? declared;
  return new Response(body, { status: res.status, headers: contentType ? { 'Content-Type': contentType } : undefined });
}

/**
 * Served pictures, kept a day like the Immich and OneDrive ones: the guid
 * names the same bytes for as long as the photo is in the album.
 */
export const icloudPhotoBytesCache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000);
