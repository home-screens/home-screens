import { getSecret, onSecretChange } from './secrets';
import { fetchWithTimeout, SetupError, type FetchRetryOptions } from './api-utils';
import { upstreamError } from './upstream-error';
import { forgetServiceOutcome, noteServiceOutcome } from './service-outcomes';

// -- Types matching Immich API response shapes --

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

/** Post-transform shape served by /api/immich/albums to the editor UI. */
export interface ImmichAlbumSummary {
  id: string;
  name: string;
  assetCount: number;
}

/** Post-transform shape served by /api/immich/people to the editor UI. */
export interface ImmichPersonSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
}

export interface ImmichAsset {
  id: string;
  type: string;
  originalFileName: string;
  thumbhash: string | null;
  fileCreatedAt: string;
  isFavorite: boolean;
  /**
   * Nominally "H:MM:SS.mmm" for videos and "0:00:00.00000" or absent for
   * images, but real servers have returned non-string values — always go
   * through parseImmichDurationMs, never assume string.
   */
  duration?: unknown;
}

/**
 * Parse Immich's "H:MM:SS.mmm" duration string into milliseconds.
 * Returns null for absent, malformed, or zero durations. Accepts `unknown`
 * because real servers have returned non-string values here — anything that
 * isn't a parseable string is treated as "duration not reported" rather than
 * guessed at (a bare number's unit is ambiguous), since durationMs is
 * optional metadata and the slideshow cap paces playback regardless.
 */
export function parseImmichDurationMs(duration: unknown): number | null {
  if (typeof duration !== 'string' || !duration) return null;
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(duration.trim());
  if (!match) return null;
  const [, h, m, s, frac] = match;
  const ms = (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000
    + (frac ? Math.round(Number(`0.${frac}`) * 1000) : 0);
  return ms > 0 ? ms : null;
}

export interface ImmichPerson {
  id: string;
  name: string;
  birthDate: string | null;
  isHidden: boolean;
}

// -- Config & fetch helpers --

/** An Immich id (an asset, a person): a UUID, checked before it goes into a path. */
export function isImmichAssetId(value: string): boolean {
  return /^[a-f0-9-]+$/i.test(value);
}

const immichCaches = new Set<{ clear(): void }>();

/**
 * Mark a cache as holding something read from Immich. A new address or key
 * empties every one of them: the lists and pictures kept for the old server
 * would otherwise keep showing until they expire, a day for a picture.
 */
export function clearedWithImmich<C extends { clear(): void }>(cache: C): C {
  immichCaches.add(cache);
  return cache;
}

export function clearImmichCaches(): void {
  for (const cache of immichCaches) cache.clear();
  // A new address or key starts with a clean slate: the old one's outage is not this one's.
  forgetServiceOutcome('immich');
}

onSecretChange('immich_url', clearImmichCaches);
onSecretChange('immich_api_key', clearImmichCaches);

export async function getImmichConfig(): Promise<{ url: string; apiKey: string } | null> {
  const [url, apiKey] = await Promise.all([getSecret('immich_url'), getSecret('immich_api_key')]);
  if (!url || !apiKey) return null;
  // Strip trailing slash for consistent path joining
  return { url: url.replace(/\/+$/, ''), apiKey };
}

/**
 * A request to the household's Immich server with its key. A missing server
 * or a key Immich turns down throws a `SetupError`, so every route that
 * calls this answers with the "finish setup" card through `errorResponse`
 * instead of reporting a revoked key as an outage. Any other answer, refused
 * or not, is returned for the caller to read.
 */
export async function immichFetch(
  path: string,
  init?: FetchRetryOptions,
): Promise<Response> {
  const cfg = await getImmichConfig();
  if (!cfg) throw new SetupError('Immich not configured', 'connection', 'Immich');
  let res: Response;
  try {
    res = await fetchWithTimeout(`${cfg.url}${path}`, {
      ...init,
      headers: { 'x-api-key': cfg.apiKey, ...init?.headers },
    });
  } catch (err) {
    // No answer at all: switched off, moved, or the deadline. Settings says
    // so. A request its own caller gave up on says nothing about Immich.
    if (!init?.signal?.aborted) noteServiceOutcome('immich', false);
    throw err;
  }
  noteServiceOutcome('immich', !(res.status === 502 || res.status === 503 || res.status === 504));
  if (res.status === 401 || res.status === 403) throw await upstreamError(res, 'Immich');
  return res;
}

// -- Connection validation --

export async function validateImmichConnection(): Promise<{
  reachable: boolean;
  authenticated: boolean;
  version?: string;
}> {
  const cfg = await getImmichConfig();
  if (!cfg) return { reachable: false, authenticated: false };

  // Step 1: ping (no auth required)
  try {
    const ping = await fetchWithTimeout(`${cfg.url}/api/server/ping`, { timeout: 5000 });
    noteServiceOutcome('immich', ping.ok);
    if (!ping.ok) return { reachable: false, authenticated: false };
  } catch {
    noteServiceOutcome('immich', false);
    return { reachable: false, authenticated: false };
  }

  // Step 2: about (validates API key)
  try {
    const about = await fetchWithTimeout(`${cfg.url}/api/server/about`, {
      timeout: 5000,
      headers: { 'x-api-key': cfg.apiKey },
    });
    // Immich answers a working key that lacks the optional `server.about`
    // permission with 403, and only a wrong key with 401. A key scoped to
    // what the wall needs is connected; it just can't say the version.
    if (about.status === 403) return { reachable: true, authenticated: true };
    if (!about.ok) return { reachable: true, authenticated: false };
    const data = await about.json();
    // Immich v3 self-reports "v3.0.1" while v2 reported "2.x.x"; normalize so
    // UI templates can uniformly prepend "v"
    const version = typeof data.version === 'string' ? data.version.replace(/^v/, '') : undefined;
    return { reachable: true, authenticated: true, version };
  } catch {
    return { reachable: true, authenticated: false };
  }
}
