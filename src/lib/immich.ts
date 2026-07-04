import { getSecret } from './secrets';
import { fetchWithTimeout } from './api-utils';

// -- Types matching Immich API response shapes --

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

export interface ImmichAsset {
  id: string;
  type: string;
  originalFileName: string;
  thumbhash: string | null;
  fileCreatedAt: string;
  isFavorite: boolean;
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
  init?: RequestInit & { timeout?: number },
): Promise<Response> {
  const cfg = await getImmichConfig();
  if (!cfg) throw new Error('Immich not configured');
  const { timeout, ...rest } = init ?? {};
  return fetchWithTimeout(`${cfg.url}${path}`, {
    ...rest,
    timeout,
    headers: { 'x-api-key': cfg.apiKey, ...rest.headers },
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
