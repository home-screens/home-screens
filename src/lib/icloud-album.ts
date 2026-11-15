import { createResolverCache, fetchWithTimeout } from './api-utils';
import { createAlbumKeeper, type AlbumKeeper } from './icloud-album-keeper';
import type { ICloudAlbumEntry, ICloudAlbumItem } from './icloud-types';

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
 * The two calls cost very differently, which shapes everything below.
 * Measured against a live 761-item album: webstream took 50 to 55 seconds to
 * answer, every time, even when all it had to say was "nothing changed";
 * webasseturls took about a second for one item and two for 25, and its
 * links die 20 minutes after they are issued. So:
 *
 *   - What the album holds (webstream) is read rarely, kept for a day, and
 *     refreshed behind the copy in hand rather than in front of a caller
 *     (icloud-album-keeper.ts, which also keeps it across a restart).
 *   - Links (webasseturls) are looked up for the one item being served, when
 *     it is served. A list never needs them: the wall is handed hub addresses.
 *
 * Failure posture: an album that is gone (deleted, or its public website
 * turned off) is null, which the slideshows show as their friendly empty
 * state. Anything else that goes wrong throws, so it is reported as iCloud
 * not answering and never mistaken for a dead link.
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

/** One item of an album as webstream names it: which derivatives to ask
 *  webasseturls for, and no link yet. */
interface AlbumEntry {
  guid: string;
  type: 'image' | 'video';
  mainChecksum: string;
  posterChecksum?: string;
}

// Apple's shared-album web client sends these; requests without a browser-ish
// User-Agent get rejected by some partitions.
const APPLE_HEADERS = {
  'Content-Type': 'text/plain',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
};

const WEBASSETURLS_BATCH_SIZE = 25;

/**
 * How long one webstream attempt may take. Apple has been measured at 50
 * seconds for a mid-sized album; a shorter limit turns a slow answer into a
 * failure and a retry that waits the same again.
 */
const WEBSTREAM_TIMEOUT_MS = 90_000;


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

/**
 * POST to one of the album's two endpoints, following Apple's non-standard
 * 330 partition redirect (the real host arrives in the response body's
 * X-Apple-MMe-Host). Either endpoint can answer it: the kept host is dropped
 * when a read fails, and the next call may be for a link.
 */
async function postSharedStreams(
  token: string,
  endpoint: 'webstream' | 'webasseturls',
  body: unknown,
  limits: { timeout: number; retries?: number },
): Promise<Response> {
  const post = (baseUrl: string) => fetchWithTimeout(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: APPLE_HEADERS,
    body: JSON.stringify(body),
    ...limits,
  });

  const knownHost = state.resolvedHosts.get(token);
  const res = await post(knownHost ? baseUrlForHost(knownHost, token) : getICloudBaseUrl(token));
  if (res.status !== 330) return res;

  const redirect = await res.json().catch(() => null) as Record<string, unknown> | null;
  const host = redirect?.['X-Apple-MMe-Host'];
  if (!isValidAppleHost(host)) throw new Error(`iCloud ${endpoint} redirect named no usable host`);
  state.resolvedHosts.set(token, host);
  return post(baseUrlForHost(host, token));
}

/**
 * The tag webstream is asked with: well-formed, and one Apple never issued.
 *
 * `streamCtag` is how a client says which version of the album it already
 * has, and Apple answers with what changed since. Asked with no tag (null,
 * or one it cannot parse), Apple does not answer the whole album: it answers
 * against the last tag it was sent for that album, by anyone it takes for
 * the same client. Checked against a live album: after one request carrying
 * the current tag (which is what the album's public web page sends), every
 * tagless request came back as 200 with an empty photo list, the same answer
 * an empty album gives, until a request carrying an older tag was made. A
 * family who opened their album's web page to check it was shared would
 * then be told the link had nothing behind it.
 *
 * A well-formed tag Apple does not know gets the whole album every time.
 */
const WHOLE_ALBUM_CTAG = 'FT=-@RU=00000000-0000-0000-0000-000000000000@S=0';

/** The album's raw item list, or null when the album is gone. */
async function fetchWebstream(token: string): Promise<RawPhoto[] | null> {
  // One retry, not the usual two: each attempt may run the full limit.
  const ask = (streamCtag: string | null) => (
    postSharedStreams(token, 'webstream', { streamCtag }, { timeout: WEBSTREAM_TIMEOUT_MS, retries: 1 })
  );
  let res = await ask(WHOLE_ALBUM_CTAG);
  // Should a partition ever refuse the made-up tag, the tagless request is
  // still better than no album at all.
  const refused = res.status >= 400 && res.status < 500 && ![404, 410, 429].includes(res.status);
  if (refused) res = await ask(null);

  // 404/410 = album deleted or its public website turned off — a deliberate
  // state, not an outage; resolve to "no photos" so the empty state explains.
  if (res.status === 404 || res.status === 410) {
    state.resolvedHosts.delete(token);
    return null;
  }
  if (!res.ok) {
    state.resolvedHosts.delete(token);
    throw new Error(`iCloud webstream failed with status ${res.status}`);
  }

  // An answer that cannot be read says nothing about the album. Calling it
  // "gone" told a family their working link was wrong.
  const data = await res.json().catch(() => null) as { photos?: unknown } | null;
  if (!Array.isArray(data?.photos)) throw new Error('iCloud webstream answered without a photo list');
  return data.photos as RawPhoto[];
}

/** Resolve checksums → signed CDN URLs, batching GUIDs per Apple's limits. */
async function fetchAssetUrls(token: string, photoGuids: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();

  for (let i = 0; i < photoGuids.length; i += WEBASSETURLS_BATCH_SIZE) {
    const batch = photoGuids.slice(i, i + WEBASSETURLS_BATCH_SIZE);
    const res = await postSharedStreams(token, 'webasseturls', { photoGuids: batch }, { timeout: 15_000 });
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

/** One uncached read of what an album holds; null when the album is gone.
 *  Items with no usable derivative are left out rather than failing the album. */
async function readAlbumEntries(token: string): Promise<AlbumEntry[] | null> {
  const photos = await fetchWebstream(token);
  if (!photos) return null;

  const entries: AlbumEntry[] = [];
  for (const photo of photos) {
    if (!photo || typeof photo.photoGuid !== 'string' || !photo.derivatives) continue;
    if (photo.mediaAssetType === 'video') {
      const video = bestVideoDerivative(photo.derivatives);
      if (!video?.checksum) continue;
      const poster = posterDerivative(photo.derivatives);
      entries.push({
        guid: photo.photoGuid,
        type: 'video',
        mainChecksum: video.checksum,
        ...(poster?.checksum ? { posterChecksum: poster.checksum } : {}),
      });
    } else {
      const image = bestImageDerivative(photo.derivatives);
      if (!image?.checksum) continue;
      entries.push({ guid: photo.photoGuid, type: 'image', mainChecksum: image.checksum });
    }
  }
  return entries;
}

/** An entry with the links webasseturls gave for it; null without its main one. */
function withLinks(entry: AlbumEntry, urls: Map<string, string>): ICloudAlbumItem | null {
  const url = urls.get(entry.mainChecksum);
  if (!url) return null;
  if (entry.type === 'image') return { url, type: 'image', guid: entry.guid };
  const posterUrl = entry.posterChecksum ? urls.get(entry.posterChecksum) : undefined;
  return { url, type: 'video', guid: entry.guid, ...(posterUrl ? { posterUrl } : {}) };
}

// ── What an album holds, kept ────────────────────────────────────────

function isAlbumEntry(value: unknown): value is AlbumEntry {
  const entry = value as AlbumEntry | null;
  return typeof entry === 'object' && entry !== null
    && typeof entry.guid === 'string' && typeof entry.mainChecksum === 'string'
    && (entry.type === 'image' || entry.type === 'video')
    && (entry.posterChecksum === undefined || typeof entry.posterChecksum === 'string');
}

/**
 * Everything this module remembers, held on `globalThis` because route
 * bundles can each carry their own copy of a module (webpack dev does). The
 * list route and the two routes that serve an item must share one copy of an
 * album, or each waits most of a minute for Apple to read it again.
 */
interface AlbumState {
  /** Partition 330-redirect targets are stable per album; kept indefinitely
   *  and dropped on failure so the next call re-resolves from scratch. */
  resolvedHosts: Map<string, string>;
  /** What each album holds. */
  albums: AlbumKeeper<AlbumEntry>;
  /**
   * Links for one item, kept 5 minutes: well inside the 20 they live, and
   * long enough that a video's many range requests share one lookup. An item
   * Apple has no links for (taken out of the album since it was read) is not
   * asked about again for a minute.
   */
  links: ReturnType<typeof createResolverCache<Map<string, string>>>;
}

const stateKey = Symbol.for('home-screens.icloud-album.v2');
const globals = globalThis as typeof globalThis & { [stateKey]?: AlbumState };
const state: AlbumState = globals[stateKey] ??= {
  resolvedHosts: new Map(),
  albums: createAlbumKeeper<AlbumEntry>({
    backend: 'sharedstreams',
    read: readAlbumEntries,
    isEntry: isAlbumEntry,
    stillHasItems,
  }),
  links: createResolverCache<Map<string, string>>(5 * 60_000, 60_000, async (key: string) => {
    const [token, guid] = key.split('\n');
    const urls = await fetchAssetUrls(token, [guid]);
    return urls.size > 0 ? urls : null;
  }),
};

/**
 * True when the kept copy of an album names items Apple still has links for.
 * An empty list is also what Apple answers a client it believes is up to
 * date (see WHOLE_ALBUM_CTAG), so one is not allowed to wipe a copy that had
 * items until a link lookup agrees they are gone. One call, three items from
 * across the album, so a single deleted photo does not decide it.
 */
async function stillHasItems(token: string, kept: AlbumEntry[]): Promise<boolean> {
  const sample = new Set([kept[0].guid, kept[Math.floor(kept.length / 2)].guid, kept[kept.length - 1].guid]);
  return (await fetchAssetUrls(token, [...sample])).size > 0;
}

/** Test hook: forgets every album, link and partition host. */
export async function clearICloudCaches(): Promise<void> {
  await state.albums.clear();
  state.links.clear();
  state.resolvedHosts.clear();
}

/**
 * A shared album's items without their links, or null when the album is
 * gone. This is all a slideshow list needs, and it costs Apple nothing while
 * the hub has a copy.
 */
export async function listSharedStreamsAlbum(token: string): Promise<ICloudAlbumEntry[] | null> {
  const entries = await state.albums.entries(token);
  return entries && entries.map((entry) => ({
    guid: entry.guid,
    type: entry.type,
    hasPoster: entry.posterChecksum !== undefined,
  }));
}

/**
 * One item with its current links, or null when the album does not have it.
 * The guid is matched against the album before Apple is asked anything, so a
 * made-up one costs no call.
 */
export async function findSharedStreamsItem(token: string, guid: string): Promise<ICloudAlbumItem | null> {
  const entry = (await state.albums.entries(token))?.find((candidate) => candidate.guid === guid);
  if (!entry) return null;
  const urls = await state.links.fetch(`${token}\n${guid}`);
  return urls && withLinks(entry, urls);
}

/**
 * Every item with its link, for an import, which has to tell an album that is
 * gone (deleted, or its public website turned off) from one with nothing in
 * it: null for the first. Read afresh, so an import copies what the album
 * holds now, and all the links are fetched together because the downloads
 * start at once.
 */
export async function fetchSharedStreamsAlbumForImport(token: string): Promise<ICloudAlbumItem[] | null> {
  const entries = await readAlbumEntries(token);
  if (!entries) return null;
  if (entries.length === 0) return [];
  const urls = await fetchAssetUrls(token, entries.map((entry) => entry.guid));
  return entries.flatMap((entry) => withLinks(entry, urls) ?? []);
}
