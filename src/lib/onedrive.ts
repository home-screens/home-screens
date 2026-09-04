import { getSecret } from './secrets';
import { fetchWithTimeout, createTTLCache, type FetchRetryOptions } from './api-utils';
import { shuffleArray } from './shuffle';
import { createOAuthTokenStore } from './oauth-token-store';
import { ONEDRIVE_MAX_SAMPLE } from './onedrive-shared';
import { logger } from './logger';
import type { MediaListItem } from '@/types/config';

/**
 * Microsoft Graph client for the OneDrive photo source.
 *
 * Sign-in is the OAuth device-code flow against personal Microsoft accounts
 * (the `consumers` authority): any device — including a phone — can finish
 * it at the verification URI, no redirect URI or client secret is needed,
 * and the user only supplies an Application (client) ID of their own app
 * registration. There is no revocation endpoint for consumer grants, so
 * disconnect just drops the stored tokens (the user can also revoke the
 * grant from their Microsoft account page).
 *
 * Photos are read-only (`Files.Read`); `User.Read` exists only so the status
 * line can say whose account is connected.
 */

const log = logger('onedrive');

const DEVICE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Minimal read-only scopes: drive items, a refresh token, and /me for the status line. */
const ONEDRIVE_SCOPES = 'Files.Read offline_access User.Read';

const PAGE_SIZE = 200;
/** Bounds folders full of non-image files; stopping early only narrows the
 *  already-approximate sample. Both list calls pin $top to PAGE_SIZE, so this
 *  is a real ceiling: 25 x 200 items scanned to fill a 1,000-photo sample. */
const MAX_LIST_PAGES = 25;

/** What went wrong, for routes that let the editor translate the reason. */
export type OneDriveErrorCode = 'credentials_missing' | 'start_failed';

export class OneDriveError extends Error {
  /** HTTP status the API route should respond with. */
  constructor(message: string, readonly status: number = 502, readonly code?: OneDriveErrorCode) {
    super(message);
  }
}

// ── Token store ───────────────────────────────────────────────────────

export async function getMicrosoftClientId(): Promise<string | null> {
  const id = await getSecret('microsoft_client_id');
  return id?.trim() || null;
}

const tokenStore = createOAuthTokenStore({
  tokensPath: 'data/onedrive-tokens.json',
  tokenUrl: TOKEN_URL,
  logName: 'onedrive',
  getCredentials: async () => {
    const clientId = await getMicrosoftClientId();
    if (!clientId) throw new Error('OneDrive Application ID is not set');
    return { client_id: clientId };
  },
  hasCredentials: async () => (await getMicrosoftClientId()) !== null,
});

/** The OneDrive grant's token store, exported for the credential backup. */
export const onedriveTokenStore = tokenStore;

export const onedriveVerifyConnected = tokenStore.verifyConnected;
export async function onedriveDisconnect(): Promise<void> {
  cancelDeviceFlow();
  await tokenStore.disconnect();
  // Dropping the grant has to drop what the grant already fetched: the byte
  // cache below holds photos for 24h, so without this "Disconnect OneDrive"
  // would leave them on the wall for another day.
  clearOneDriveCaches();
}

// ── Route caches ──────────────────────────────────────────────────────

/**
 * Both photo caches live here rather than in their route modules so that
 * `onedriveDisconnect` can empty them. Sizing matches the Immich equivalents:
 * five minutes for a photo list, a day for the decoded bytes.
 */
export const onedrivePhotoListCache = createTTLCache<MediaListItem[]>(5 * 60_000);
export const onedrivePhotoBytesCache = createTTLCache<{ data: ArrayBuffer; contentType: string }>(24 * 60 * 60 * 1000);

export function clearOneDriveCaches(): void {
  onedrivePhotoListCache.clear();
  onedrivePhotoBytesCache.clear();
}

// ── Device-code sign-in ───────────────────────────────────────────────

interface PendingDeviceFlow {
  deviceCode: string;
  clientId: string;
  intervalMs: number;
  expiresAt: number;
}

/** Single pending flow per hub — one Microsoft account, like Immich is one server. */
let pendingDeviceFlow: PendingDeviceFlow | null = null;

export function cancelDeviceFlow(): void {
  pendingDeviceFlow = null;
}

export interface DeviceFlowStart {
  userCode: string;
  verificationUri: string;
  intervalMs: number;
  expiresInSeconds: number;
}

export async function startDeviceFlow(): Promise<DeviceFlowStart> {
  const clientId = await getMicrosoftClientId();
  if (!clientId) throw new OneDriveError('Add your Microsoft Application ID in Settings, API keys first', 400, 'credentials_missing');

  const res = await fetchWithTimeout(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: ONEDRIVE_SCOPES }),
    timeout: 15_000,
  });
  const data = await res.json();
  if (!res.ok || !data.device_code || !data.user_code) {
    log.error('Device flow failed to start:', data.error_description || data.error || res.status);
    throw new OneDriveError('Microsoft would not start sign-in. Check the Application ID.', 400, 'start_failed');
  }
  pendingDeviceFlow = {
    deviceCode: data.device_code,
    clientId,
    intervalMs: Math.max((data.interval ?? 5) * 1000, 2000),
    expiresAt: Date.now() + (data.expires_in ?? 900) * 1000,
  };
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://microsoft.com/link',
    intervalMs: pendingDeviceFlow.intervalMs,
    expiresInSeconds: data.expires_in ?? 900,
  };
}

export type DevicePollState = 'idle' | 'pending' | 'connected' | 'expired' | 'declined' | 'failed';

export interface DevicePollResult {
  state: DevicePollState;
  message?: string;
  /** Re-spaced poll interval (present on pending, after a slow_down nudge). */
  intervalMs?: number;
}

/** One poll attempt of the pending flow. Callers space calls at flow.intervalMs. */
export async function pollDeviceFlow(): Promise<DevicePollResult> {
  const pending = pendingDeviceFlow;
  if (!pending) return { state: 'idle' };
  if (Date.now() > pending.expiresAt) {
    pendingDeviceFlow = null;
    return { state: 'expired' };
  }

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: pending.clientId,
      device_code: pending.deviceCode,
    }),
    timeout: 15_000,
  });
  const data = await res.json();

  if (res.ok && data.access_token) {
    pendingDeviceFlow = null;
    await tokenStore.saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? null,
      expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
      token_type: data.token_type ?? null,
      scope: data.scope,
    });
    return { state: 'connected' };
  }

  const error: string = data.error || '';
  if (error === 'authorization_pending' || error === 'slow_down') {
    // RFC 8628: back off 5s on slow_down. The route passes intervalMs
    // through so the editor can re-space its polling.
    if (error === 'slow_down') pending.intervalMs += 5000;
    return { state: 'pending', intervalMs: pending.intervalMs };
  }
  pendingDeviceFlow = null;
  if (error === 'expired_token') return { state: 'expired' };
  if (error === 'authorization_declined') return { state: 'declined' };
  log.error('Device flow failed:', data.error_description || error || res.status);
  return { state: 'failed', message: data.error_description || error || 'Sign-in did not work' };
}

// ── Graph calls ───────────────────────────────────────────────────────

async function onedriveFetch(path: string, init?: FetchRetryOptions): Promise<Response> {
  const token = await tokenStore.getAccessToken();
  if (!token) throw new OneDriveError('Not connected to OneDrive', 401);
  // Absolute URLs come from @odata.nextLink pagination; paths join onto GRAPH.
  // Response-supplied URLs must stay on Graph, like the picker's content URLs.
  let url: string;
  if (path.startsWith('http')) {
    if (!path.startsWith(GRAPH)) throw new OneDriveError('Unexpected Graph URL', 502);
    url = path;
  } else {
    url = `${GRAPH}${path}`;
  }
  return fetchWithTimeout(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

// ── Folder browser ────────────────────────────────────────────────────

export interface OneDriveFolder {
  id: string;
  name: string;
  /** Human-readable trail like "OneDrive / Pictures / Family" — display only. */
  path: string;
  childCount: number | null;
}

export interface OneDriveSubfolder {
  id: string;
  name: string;
}

interface DriveItem {
  id: string;
  name?: string | null;
  folder?: { childCount?: number | null } | null;
  image?: unknown;
  deleted?: unknown;
  parentReference?: { path?: string | null } | null;
}

/** "OneDrive" for the root, otherwise the parent trail plus the item name. */
function folderDisplayPath(item: DriveItem): string {
  const raw = item.parentReference?.path ?? '';
  const match = /\/drive\/root:\/?(.*)$/.exec(raw);
  const ancestors = match && match[1] ? match[1].split('/').filter(Boolean) : [];
  const isRoot = ancestors.length === 0 && (item.name == null || item.name === 'root');
  if (isRoot) return 'OneDrive';
  // Graph percent-encodes path segments ("My Photos" → "My%20Photos");
  // decode each, tolerating a stray % that would throw URIError.
  const decode = (segment: string) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  };
  return ['OneDrive', ...ancestors.map(decode), item.name ?? ''].filter(Boolean).join(' / ');
}

/**
 * The folder itself (root when itemId is omitted) plus its immediate
 * subfolders. Children cannot be filtered server-side, so the page is
 * filtered hub-side; the first 200 subfolders are plenty for browsing.
 */
export async function listFolders(itemId?: string): Promise<{ folder: OneDriveFolder; subfolders: OneDriveSubfolder[] }> {
  const select = '$select=id,name,folder,parentReference';
  const itemPath = itemId ? `/me/drive/items/${encodeURIComponent(itemId)}?${select}` : `/me/drive/root?${select}`;
  const itemRes = await onedriveFetch(itemPath, { timeout: 15_000 });
  if (!itemRes.ok) {
    throw new OneDriveError(
      itemRes.status === 404 ? 'Folder not found' : 'Could not read the OneDrive folder',
      itemRes.status === 401 ? 401 : itemRes.status === 404 ? 404 : 502,
    );
  }
  const item: DriveItem = await itemRes.json();

  const childrenRes = await onedriveFetch(
    `/me/drive/items/${encodeURIComponent(item.id)}/children?$select=id,name,folder&$top=${PAGE_SIZE}`,
    { timeout: 15_000 },
  );
  if (!childrenRes.ok) throw new OneDriveError('Could not read the folder', childrenRes.status === 401 ? 401 : 502);
  const children = await childrenRes.json();

  const displayPath = folderDisplayPath(item);
  return {
    folder: {
      id: item.id,
      name: displayPath === 'OneDrive' ? 'OneDrive' : (item.name ?? ''),
      path: displayPath,
      childCount: item.folder?.childCount ?? null,
    },
    subfolders: ((children.value ?? []) as DriveItem[])
      .filter((child) => child.folder != null)
      .map((child) => ({ id: child.id, name: child.name ?? '' })),
  };
}

// ── Photo listing ─────────────────────────────────────────────────────

export interface OneDrivePhoto {
  id: string;
  name: string;
}

/**
 * Images from one folder AND everything inside it, shuffled. Graph's delta
 * enumeration walks the whole subtree in one paged chain, which has no
 * random search (Immich does), so the hub keeps only live items with an
 * image facet, up to ONEDRIVE_MAX_SAMPLE, then shuffles and slices. Items
 * come back in Graph's name order, so folders larger than the cap are
 * name-biased; the editor panel flags any folder with subfolders or
 * many direct children, since childCount alone can't see the tree size.
 */
export async function listPhotos(folderId: string, count: number): Promise<OneDrivePhoto[]> {
  const images: OneDrivePhoto[] = [];
  let pages = 0;
  let url: string | null =
    `/me/drive/items/${encodeURIComponent(folderId)}/delta?$select=id,name,image,folder,deleted&$top=${PAGE_SIZE}`;

  while (url && images.length < ONEDRIVE_MAX_SAMPLE && pages < MAX_LIST_PAGES) {
    pages += 1;
    const res = await onedriveFetch(url, { timeout: 15_000 });
    if (!res.ok) {
      throw new OneDriveError(
        res.status === 404 ? 'Folder not found' : 'Could not read the OneDrive folder',
        res.status === 401 ? 401 : res.status === 404 ? 404 : 502,
      );
    }
    const data = await res.json();
    for (const item of (data.value ?? []) as DriveItem[]) {
      // delta returns folders and tombstones for deleted items alongside
      // the files; keep only live images.
      if (item.image && !item.folder && !item.deleted) {
        images.push({ id: item.id, name: item.name ?? item.id });
      }
    }
    url = (data['@odata.nextLink'] as string | undefined) ?? null;
  }

  return shuffleArray(images).slice(0, Math.min(count, ONEDRIVE_MAX_SAMPLE));
}

// ── Thumbnails + account ──────────────────────────────────────────────

/** Largest original we are willing to buffer when no thumbnail exists. */
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

/**
 * A single photo's bytes. Never hand the display a Graph download URL —
 * they expire after about an hour; the hub proxies and caches instead.
 * Slides use the ~1920px `large` thumbnail, the editor strip `medium` —
 * original camera files are needlessly heavy for a Pi.
 *
 * Graph 404s the thumbnail path for items it has not generated one for
 * (freshly uploaded, or a format it cannot render). Those items still carry
 * an image facet, so they reach the slideshow and would otherwise sit blank
 * for a whole slide interval; fall back to the original bytes, bounded so a
 * 60MB raw file can't be pulled onto a Pi.
 */
export async function fetchThumbnail(
  itemId: string,
  size: 'preview' | 'thumbnail',
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const graphSize = size === 'preview' ? 'large' : 'medium';
  const res = await onedriveFetch(
    `/me/drive/items/${encodeURIComponent(itemId)}/thumbnails/0/${graphSize}/content`,
    { timeout: 20_000 },
  );
  if (res.ok) {
    return { data: await res.arrayBuffer(), contentType: res.headers.get('Content-Type') || 'image/jpeg' };
  }
  if (res.status === 401) throw new OneDriveError('Could not load the photo', 401);
  if (res.status !== 404) throw new OneDriveError('Could not load the photo', 502);
  return fetchOriginal(itemId);
}

async function fetchOriginal(itemId: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const res = await onedriveFetch(`/me/drive/items/${encodeURIComponent(itemId)}/content`, { timeout: 30_000 });
  if (!res.ok) throw new OneDriveError('Could not load the photo', res.status === 401 ? 401 : 502);
  const declared = Number(res.headers.get('Content-Length'));
  if (declared > MAX_ORIGINAL_BYTES) {
    log.error('Photo has no thumbnail and its original is too large to proxy:', itemId);
    throw new OneDriveError('Could not load the photo', 502);
  }
  const data = await res.arrayBuffer();
  // Content-Length is advisory; re-check what actually arrived before caching it.
  if (data.byteLength > MAX_ORIGINAL_BYTES) {
    log.error('Photo has no thumbnail and its original is too large to proxy:', itemId);
    throw new OneDriveError('Could not load the photo', 502);
  }
  return { data, contentType: res.headers.get('Content-Type') || 'image/jpeg' };
}

/** Whose account is connected, for the status line. Best-effort. */
export async function getAccount(): Promise<string | null> {
  try {
    const res = await onedriveFetch('/me?$select=displayName,mail,userPrincipalName', { timeout: 10_000 });
    if (!res.ok) return null;
    const data = await res.json();
    return data.mail || data.userPrincipalName || data.displayName || null;
  } catch {
    return null;
  }
}
