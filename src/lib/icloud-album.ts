import { createResolverCache, fetchWithTimeout } from './api-utils';
import type { ICloudAlbumItem } from './icloud-types';

/**
 * Client for Apple's undocumented iCloud Shared Album web API — the only file
 * that knows this API exists. Public albums are readable via two POST calls:
 *
 *   webstream     → album metadata + per-item derivative listings
 *   webasseturls  → short-lived signed CDN URLs, keyed by derivative checksum
 *
 * Photo items have derivatives keyed by pixel height ("342", "2049"); video
 * items are marked `mediaAssetType: "video"` and use quality keys ("360p",
 * "720p") plus a "PosterFrame" image. Apple serves web videos as 720p H.264,
 * which Pi hardware decodes well.
 *
 * Failure posture: a missing/private album or malformed response resolves to
 * an empty list (the slideshows show their friendly empty state); only
 * network-level failures throw, so a display holds its last good list through
 * an Apple blip instead of blanking.
 */

interface RawDerivative {
  checksum?: string;
  fileSize?: string | number;
  width?: string | number;
  height?: string | number;
}

interface RawPhoto {
  photoGuid?: string;
  mediaAssetType?: string;
  derivatives?: Record<string, RawDerivative>;
}

interface AssetLocation {
  url_location?: string;
  url_path?: string;
}

// Apple's shared-album web client sends these; requests without a browser-ish
// User-Agent get rejected by some partitions.
const APPLE_HEADERS = {
  'Content-Type': 'text/plain',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
};

const WEBASSETURLS_BATCH_SIZE = 25;

/** Partition 330-redirect targets are stable per album; cache indefinitely
 *  and drop on failure so the next call re-resolves from scratch. */
const resolvedHostByToken = new Map<string, string>();

/** Test hook — clears all caches. */
export function clearICloudCaches(): void {
  albumResolver.clear();
  resolvedHostByToken.clear();
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62ToInt(input: string): number {
  let value = 0;
  for (const char of input) value = value * 62 + BASE62.indexOf(char);
  return value;
}

/** The token encodes its own server partition (base62 in the leading chars). */
export function getICloudBaseUrl(token: string): string {
  const partition = token[0] === 'A'
    ? base62ToInt(token[1])
    : base62ToInt(token.substring(1, 3));
  const padded = partition < 10 ? `0${partition}` : String(partition);
  return `https://p${padded}-sharedstreams.icloud.com/${token}/sharedstreams/`;
}

function baseUrlForHost(host: string, token: string): string {
  return `https://${host}/${token}/sharedstreams/`;
}

/** Only ever follow Apple-shaped redirect hosts — the redirect target comes
 *  from a response body, so validate before fetching it. */
function isValidAppleHost(host: unknown): host is string {
  return typeof host === 'string' && /^[a-z0-9-]+\.icloud\.com$/i.test(host);
}

async function postSharedStreams(url: string, body: unknown): Promise<Response> {
  return fetchWithTimeout(url, {
    method: 'POST',
    headers: APPLE_HEADERS,
    body: JSON.stringify(body),
    timeout: 15_000,
  });
}

/**
 * POST webstream, following Apple's non-standard 330 partition redirect
 * (the real host arrives in the response body's X-Apple-MMe-Host).
 */
async function fetchWebstream(token: string): Promise<RawPhoto[] | null> {
  const knownHost = resolvedHostByToken.get(token);
  let baseUrl = knownHost ? baseUrlForHost(knownHost, token) : getICloudBaseUrl(token);

  let res = await postSharedStreams(`${baseUrl}webstream`, { streamCtag: null });
  if (res.status === 330) {
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const host = body?.['X-Apple-MMe-Host'];
    if (!isValidAppleHost(host)) return null;
    resolvedHostByToken.set(token, host);
    baseUrl = baseUrlForHost(host, token);
    res = await postSharedStreams(`${baseUrl}webstream`, { streamCtag: null });
  }

  // 404/410 = album deleted or its public website turned off — a deliberate
  // state, not an outage; resolve to "no photos" so the empty state explains.
  if (res.status === 404 || res.status === 410) {
    resolvedHostByToken.delete(token);
    return null;
  }
  if (!res.ok) {
    resolvedHostByToken.delete(token);
    throw new Error(`iCloud webstream failed with status ${res.status}`);
  }

  const data = await res.json().catch(() => null) as { photos?: unknown } | null;
  return Array.isArray(data?.photos) ? data.photos as RawPhoto[] : null;
}

/** Resolve checksums → signed CDN URLs, batching GUIDs per Apple's limits. */
async function fetchAssetUrls(token: string, photoGuids: string[]): Promise<Map<string, string>> {
  const host = resolvedHostByToken.get(token);
  const baseUrl = host ? baseUrlForHost(host, token) : getICloudBaseUrl(token);
  const urls = new Map<string, string>();

  for (let i = 0; i < photoGuids.length; i += WEBASSETURLS_BATCH_SIZE) {
    const batch = photoGuids.slice(i, i + WEBASSETURLS_BATCH_SIZE);
    const res = await postSharedStreams(`${baseUrl}webasseturls`, { photoGuids: batch });
    if (!res.ok) throw new Error(`iCloud webasseturls failed with status ${res.status}`);
    const data = await res.json().catch(() => null) as { items?: Record<string, AssetLocation> } | null;
    for (const [checksum, item] of Object.entries(data?.items ?? {})) {
      if (item?.url_location && item.url_path) {
        urls.set(checksum, `https://${item.url_location}${item.url_path}`);
      }
    }
  }
  return urls;
}

function numeric(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Largest image derivative — numeric keys are pixel heights; prefer the
 *  biggest, falling back to file size when keys aren't numeric. */
function bestImageDerivative(derivatives: Record<string, RawDerivative>): RawDerivative | null {
  let best: RawDerivative | null = null;
  let bestScore = -1;
  for (const [key, derivative] of Object.entries(derivatives)) {
    if (!derivative?.checksum) continue;
    // PosterFrame belongs to videos; never treat it as a photo derivative here
    // (photo items don't have one, so this only matters for poster fallback).
    const score = /^\d+$/.test(key) ? numeric(key) * 1_000_000 : numeric(derivative.fileSize);
    if (score > bestScore) {
      best = derivative;
      bestScore = score;
    }
  }
  return best;
}

/** Highest-quality video derivative — keys like "360p"/"720p". */
function bestVideoDerivative(derivatives: Record<string, RawDerivative>): RawDerivative | null {
  let best: RawDerivative | null = null;
  let bestQuality = -1;
  for (const [key, derivative] of Object.entries(derivatives)) {
    const match = /^(\d+)p$/i.exec(key);
    if (!match || !derivative?.checksum) continue;
    const quality = Number(match[1]);
    if (quality > bestQuality) {
      best = derivative;
      bestQuality = quality;
    }
  }
  return best;
}

function posterDerivative(derivatives: Record<string, RawDerivative>): RawDerivative | null {
  if (derivatives.PosterFrame?.checksum) return derivatives.PosterFrame;
  return bestImageDerivative(derivatives);
}

/** Resolved item lists are short-lived because the signed CDN URLs expire
 *  (~1h); 5 minutes keeps every consumer comfortably inside that window. A
 *  missing/private album resolves to [] (never null), so the negative TTL is
 *  along for the ride here — the empty list caches for the full window,
 *  matching the CloudKit backend's posture of not re-hammering broken links. */
const albumResolver = createResolverCache(5 * 60_000, 60_000, resolveAlbum);

/**
 * Fetch a shared album's full media list. Cached for 5 minutes per token so
 * the two-call Apple dance doesn't run on every display poll, with concurrent
 * cold fetches collapsed into a single Apple round-trip.
 */
export async function fetchSharedStreamsAlbum(token: string): Promise<ICloudAlbumItem[]> {
  return (await albumResolver.fetch(token)) ?? [];
}

async function resolveAlbum(token: string): Promise<ICloudAlbumItem[]> {
  const photos = await fetchWebstream(token);
  if (!photos) {
    return [];
  }

  // Plan which checksums each item needs before resolving URLs, so items with
  // unusable derivatives don't waste webasseturls batch slots.
  const plans: Array<{
    guid: string;
    type: 'image' | 'video';
    mainChecksum: string;
    posterChecksum?: string;
  }> = [];

  for (const photo of photos) {
    if (!photo || typeof photo.photoGuid !== 'string' || !photo.derivatives) continue;
    if (photo.mediaAssetType === 'video') {
      const video = bestVideoDerivative(photo.derivatives);
      if (!video?.checksum) continue;
      const poster = posterDerivative(photo.derivatives);
      plans.push({
        guid: photo.photoGuid,
        type: 'video',
        mainChecksum: video.checksum,
        posterChecksum: poster?.checksum,
      });
    } else {
      const image = bestImageDerivative(photo.derivatives);
      if (!image?.checksum) continue;
      plans.push({ guid: photo.photoGuid, type: 'image', mainChecksum: image.checksum });
    }
  }

  if (plans.length === 0) {
    return [];
  }

  const urls = await fetchAssetUrls(token, plans.map((p) => p.guid));

  const items: ICloudAlbumItem[] = [];
  for (const plan of plans) {
    const url = urls.get(plan.mainChecksum);
    if (!url) continue;
    if (plan.type === 'video') {
      const posterUrl = plan.posterChecksum ? urls.get(plan.posterChecksum) : undefined;
      items.push({ url, type: 'video', guid: plan.guid, ...(posterUrl ? { posterUrl } : {}) });
    } else {
      items.push({ url, type: 'image', guid: plan.guid });
    }
  }

  return items;
}
