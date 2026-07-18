import { createHash } from 'crypto';
import { createResolverCache, fetchWithTimeout } from './api-utils';
import type { ICloudAlbumItem } from './icloud-types';

/**
 * Client for Apple's CloudKit web API, which backs two Apple products:
 *   - iCloud Links (share.icloud.com/photos/…) — "moment" shares that expire
 *     after ~30 days, only ever IMPORTED into the local library.
 *   - New-format Shared Albums (photos.icloud.com/shared/album/…, iOS 27+) —
 *     persistent albums that replace the legacy sharedstreams ones and are used
 *     as a LIVE slideshow source (see fetchCloudKitAlbum).
 * Both resolve through the same anonymous flow; only the output shape differs
 * (downloadable items for import vs. display items for live rendering).
 *
 * The anonymous flow (verified live against real links):
 *   1. POST public/records/resolve with the link's short GUID
 *      → zone, rootRecord counts, and an `anonymousPublicAccess` grant
 *        { databasePartition, token }.
 *   2. POST {partition}/…/shared/records/query?publicAccessAuthToken={token}
 *      with recordType CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted,
 *      paginated via continuationMarker.
 *   3. CPLMaster records carry per-rendition download URLs. Apple
 *      pre-transcodes web renditions: resVidMedRes is H.264 MP4 even when the
 *      original is HEVC, and resJPEGMedRes is JPEG even for HEIC originals —
 *      so imports always pick a Pi-decodable, browser-safe rendition.
 */

export interface ICloudLinkItem {
  downloadUrl: string;
  type: 'image' | 'video';
  /** Deterministic library filename (sanitized original stem + fingerprint
   *  suffix + rendition-correct extension) so re-imports dedup by name. */
  filename: string;
  size?: number;
}

interface RenditionValue {
  downloadURL?: string;
  size?: number;
}

interface RecordField {
  value?: unknown;
}

interface CloudKitRecord {
  recordName?: string;
  recordType?: string;
  fields?: Record<string, RecordField>;
}

const RESOLVE_URL =
  'https://ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/public/records/resolve?remapEnums=true';

const APPLE_HEADERS = {
  'Content-Type': 'text/plain',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
};

interface ResolvedLink {
  partition: string;
  accessToken: string;
  zoneID: Record<string, unknown>;
}

/**
 * Resolve the short GUID to the shared zone + anonymous access grant.
 * Returns null when the link is expired, revoked, or not a photo share —
 * callers surface that as "this link doesn't work anymore", distinct from a
 * network failure (which throws).
 */
async function resolveLink(token: string): Promise<ResolvedLink | null> {
  const res = await fetchWithTimeout(RESOLVE_URL, {
    method: 'POST',
    headers: APPLE_HEADERS,
    body: JSON.stringify({ shortGUIDs: [{ value: token, shouldFetchRootRecord: true }] }),
    timeout: 15_000,
  });
  if (!res.ok) {
    if (res.status >= 500) throw new Error(`iCloud link resolve failed with status ${res.status}`);
    return null;
  }

  const data = await res.json().catch(() => null) as { results?: Array<Record<string, unknown>> } | null;
  const result = data?.results?.[0];
  const anon = result?.anonymousPublicAccess as { databasePartition?: string; token?: string } | undefined;
  const zoneID = result?.zoneID as Record<string, unknown> | undefined;
  if (!anon?.databasePartition || !anon.token || !zoneID) return null;
  // The partition base comes from a response body and every later query is
  // built on it — never accept one that points outside Apple's API domain.
  if (!isAppleApiBase(anon.databasePartition)) return null;
  return { partition: anon.databasePartition.replace(/\/+$/, ''), accessToken: anon.token, zoneID };
}

/** True for https URLs on icloud.com (e.g. https://p164-ckdatabasews.icloud.com:443). */
function isAppleApiBase(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    return protocol === 'https:' && /(^|\.)icloud\.com$/i.test(hostname);
  } catch {
    return false;
  }
}

/**
 * Stop paging once this many records are buffered. Each asset arrives as a
 * CPLAsset + CPLMaster pair, so this is ~2,200 assets — comfortably above the
 * import ceiling (MAX_IMPORT_ITEMS, 2000) so "too many items" is still
 * detected, while bounding the transient CloudKit JSON a giant album can pile
 * up in Pi memory during one resolve. Live slideshows just show the first
 * ~2,200 items of a larger album.
 */
const MAX_QUERY_RECORDS = 4400;

/** Query all records in the shared zone, following continuation markers. */
async function queryRecords(link: ResolvedLink): Promise<CloudKitRecord[]> {
  const params = new URLSearchParams({
    publicAccessAuthToken: link.accessToken,
    remapEnums: 'true',
    getCurrentSyncToken: 'true',
  });
  const url = `${link.partition}/database/1/com.apple.photos.cloud/production/shared/records/query?${params}`;

  const records: CloudKitRecord[] = [];
  let continuationMarker: string | undefined;
  // Apple pages at ~200 records; the loop bound is a runaway backstop, not a limit.
  for (let page = 0; page < 100; page++) {
    const body: Record<string, unknown> = {
      query: { recordType: 'CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted' },
      zoneID: link.zoneID,
    };
    if (continuationMarker) body.continuationMarker = continuationMarker;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: APPLE_HEADERS,
      body: JSON.stringify(body),
      timeout: 30_000,
    });
    if (!res.ok) throw new Error(`iCloud link query failed with status ${res.status}`);
    const data = await res.json().catch(() => null) as
      { records?: CloudKitRecord[]; continuationMarker?: string } | null;
    if (!data) break;
    records.push(...(data.records ?? []));
    continuationMarker = data.continuationMarker;
    if (!continuationMarker || records.length >= MAX_QUERY_RECORDS) break;
  }
  return records;
}

function fieldString(fields: Record<string, RecordField>, key: string): string {
  const value = fields[key]?.value;
  return typeof value === 'string' ? value : '';
}

function rendition(fields: Record<string, RecordField>, key: string): RenditionValue | null {
  const value = fields[key]?.value;
  if (value && typeof value === 'object' && (value as RenditionValue).downloadURL) {
    return value as RenditionValue;
  }
  return null;
}

const EXT_BY_FILE_TYPE: Record<string, string> = {
  'public.jpeg': 'jpg',
  'public.png': 'png',
  'com.compuserve.gif': 'gif',
  'org.webmproject.webp': 'webp',
  'public.mpeg-4': 'mp4',
  'com.apple.quicktime-movie': 'mov',
};

/** File types the display's Chromium can actually decode. */
const WEB_SAFE_IMAGE_TYPES = new Set(['public.jpeg', 'public.png', 'com.compuserve.gif', 'org.webmproject.webp']);

/**
 * Pick the best web-safe rendition for a CPLMaster. Videos prefer the
 * medium MP4 transcode (H.264, Pi-decodable) over an original that may be
 * HEVC; images prefer the original only when it's already a browser format,
 * else Apple's JPEG rendition. Returns null when nothing usable exists.
 */
function pickRendition(fields: Record<string, RecordField>, isVideo: boolean): {
  res: RenditionValue; ext: string;
} | null {
  if (isVideo) {
    const med = rendition(fields, 'resVidMedRes');
    if (med) return { res: med, ext: EXT_BY_FILE_TYPE[fieldString(fields, 'resVidMedFileType')] ?? 'mp4' };
    const small = rendition(fields, 'resVidSmallRes');
    if (small) return { res: small, ext: EXT_BY_FILE_TYPE[fieldString(fields, 'resVidSmallFileType')] ?? 'mp4' };
    const originalType = fieldString(fields, 'resOriginalFileType');
    const original = rendition(fields, 'resOriginalRes');
    if (original && originalType === 'public.mpeg-4') return { res: original, ext: 'mp4' };
    return null;
  }

  const originalType = fieldString(fields, 'resOriginalFileType');
  if (WEB_SAFE_IMAGE_TYPES.has(originalType)) {
    const original = rendition(fields, 'resOriginalRes');
    if (original) return { res: original, ext: EXT_BY_FILE_TYPE[originalType] ?? 'jpg' };
  }
  const jpegFull = rendition(fields, 'resJPEGFullRes');
  if (jpegFull) return { res: jpegFull, ext: 'jpg' };
  const jpegMed = rendition(fields, 'resJPEGMedRes');
  if (jpegMed) return { res: jpegMed, ext: 'jpg' };
  return null;
}

function sanitizeStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'icloud';
}

/** Apple base64-encodes the original filename in filenameEnc. */
function decodeFilename(fields: Record<string, RecordField>): string {
  const enc = fieldString(fields, 'filenameEnc');
  if (!enc) return '';
  try {
    return Buffer.from(enc, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/** True for a CPLMaster that Apple has flagged (or whose filename reads) as a
 *  video — shared by the import and live paths so both classify identically. */
function isVideoMaster(fields: Record<string, RecordField>, decodedName: string): boolean {
  return isVideoItemType(fieldString(fields, 'itemType')) || /\.(mp4|mov|m4v)$/i.test(decodedName);
}

/**
 * Concrete video UTIs Apple emits as itemType. `public.movie` is the abstract
 * family (kept as a prefix guard); real-world values are
 * com.apple.quicktime-movie (.mov) and public.mpeg-4 (.mp4 — matching neither
 * legacy prefix, which silently dropped every MP4-container asset).
 */
function isVideoItemType(itemType: string): boolean {
  return (
    itemType.startsWith('public.movie') ||
    itemType.startsWith('com.apple.quicktime') ||
    itemType.startsWith('public.mpeg-4')
  );
}

function fingerprintSuffix(fields: Record<string, RecordField>, recordName: string | undefined): string {
  const fingerprint = fieldString(fields, 'resOriginalFingerprint') || recordName || '';
  const alnum = fingerprint.replace(/[^a-zA-Z0-9]/g, '');
  return alnum.slice(0, 8) || 'x';
}

/**
 * List everything an iCloud Link contains, as downloadable items.
 * Returns null when the link is expired/invalid (vs. [] for an empty share).
 */
export async function listICloudLinkItems(token: string): Promise<ICloudLinkItem[] | null> {
  const link = await resolveLink(token);
  if (!link) return null;

  const records = await queryRecords(link);
  const items: ICloudLinkItem[] = [];

  for (const record of records) {
    if (record.recordType !== 'CPLMaster' || !record.fields) continue;
    const fields = record.fields;

    const decodedName = decodeFilename(fields);

    // Filename-extension fallback (as pyicloud does): itemType is not always
    // present or concrete, but the original filename still tells the truth.
    const isVideo = isVideoMaster(fields, decodedName);
    const picked = pickRendition(fields, isVideo);
    if (!picked?.res.downloadURL) continue;

    let stem = decodedName ? sanitizeStem(decodedName) : '';
    if (!stem || stem === 'icloud') {
      stem = sanitizeStem(record.recordName ?? 'icloud');
    }

    items.push({
      downloadUrl: picked.res.downloadURL,
      type: isVideo ? 'video' : 'image',
      filename: `${stem}-${fingerprintSuffix(fields, record.recordName)}.${picked.ext}`,
      ...(typeof picked.res.size === 'number' ? { size: picked.res.size } : {}),
    });
  }
  return items;
}

// ── Live shared-album source (new-format photos.icloud.com/shared/album/…) ──

/** Test hook — clears the live-album cache. */
export function clearICloudLinkCaches(): void {
  liveAlbumResolver.clear();
}

/** A web-safe JPEG poster for a video item; omitted when none is available
 *  (VideoLayer handles a missing poster). */
function pickPosterUrl(fields: Record<string, RecordField>): string | undefined {
  for (const key of ['resJPEGFullRes', 'resJPEGMedRes', 'resJPEGThumbRes'] as const) {
    const res = rendition(fields, key);
    if (res?.downloadURL) return res.downloadURL;
  }
  return undefined;
}

/** Apple's fingerprint is the durable per-asset identity (the signed URLs
 *  churn every resolve); fall back to the record name, then a short hash of
 *  the URL. The hash keeps the guid filename-safe when consumers build cache
 *  names from it (the raw signed URL runs hundreds of chars — past the FS
 *  name limit); it still churns with the URL, but no real CPLMaster has been
 *  seen missing both fingerprint and record name. */
function stableGuid(fields: Record<string, RecordField>, recordName: string | undefined, url: string): string {
  return (
    fieldString(fields, 'resOriginalFingerprint') ||
    recordName ||
    createHash('sha256').update(url).digest('hex').slice(0, 16)
  );
}

async function resolveLiveAlbum(token: string): Promise<ICloudAlbumItem[] | null> {
  const link = await resolveLink(token);
  if (!link) return null;

  const records = await queryRecords(link);
  const items: ICloudAlbumItem[] = [];
  for (const record of records) {
    if (record.recordType !== 'CPLMaster' || !record.fields) continue;
    const fields = record.fields;
    const isVideo = isVideoMaster(fields, decodeFilename(fields));
    const picked = pickRendition(fields, isVideo);
    if (!picked?.res.downloadURL) continue;

    const guid = stableGuid(fields, record.recordName, picked.res.downloadURL);
    if (isVideo) {
      const posterUrl = pickPosterUrl(fields);
      items.push({ url: picked.res.downloadURL, type: 'video', guid, ...(posterUrl ? { posterUrl } : {}) });
    } else {
      items.push({ url: picked.res.downloadURL, type: 'image', guid });
    }
  }
  return items;
}

/** Signed CloudKit download URLs expire (the resolve grant lives ~20 min); a
 *  5-minute cache keeps every display poll well inside that window, matching
 *  the legacy sharedstreams album cache. A null (private/expired/deleted)
 *  caches for just 60s: long enough that a wall-mounted kiosk pointed at a
 *  dead link stops hammering Apple on every poll, short enough that a
 *  fixed-up album reappears within a minute. */
const liveAlbumResolver = createResolverCache(5 * 60_000, 60_000, resolveLiveAlbum);

/**
 * Live media list for a new-format shared album, shaped like a legacy album
 * (fetchSharedStreamsAlbum) so /api/icloud/photos treats both backends
 * identically. Returns null when the album is missing/private/expired (vs. []
 * for empty), so the route can fall through to its friendly empty state.
 * Cached per token with concurrent cold fetches collapsed into one Apple
 * round-trip.
 */
export async function fetchCloudKitAlbum(token: string): Promise<ICloudAlbumItem[] | null> {
  return liveAlbumResolver.fetch(token);
}
