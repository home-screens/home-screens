import { getSecret } from './secrets';
import { fetchWithTimeout, SetupError, type FetchRetryOptions } from './api-utils';

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

export async function getImmichConfig(): Promise<{ url: string; apiKey: string } | null> {
  const [url, apiKey] = await Promise.all([getSecret('immich_url'), getSecret('immich_api_key')]);
  if (!url || !apiKey) return null;
  // Strip trailing slash for consistent path joining
  return { url: url.replace(/\/+$/, ''), apiKey };
}

export async function immichFetch(
  path: string,
  init?: FetchRetryOptions,
): Promise<Response> {
  const cfg = await getImmichConfig();
  if (!cfg) throw new SetupError('Immich not configured', 'connection', 'Immich');
  return fetchWithTimeout(`${cfg.url}${path}`, {
    ...init,
    headers: { 'x-api-key': cfg.apiKey, ...init?.headers },
  });
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
    if (!ping.ok) return { reachable: false, authenticated: false };
  } catch {
    return { reachable: false, authenticated: false };
  }

  // Step 2: about (validates API key)
  try {
    const about = await fetchWithTimeout(`${cfg.url}/api/server/about`, {
      timeout: 5000,
      headers: { 'x-api-key': cfg.apiKey },
    });
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
