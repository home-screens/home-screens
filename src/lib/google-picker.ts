import { fetchWithTimeout } from '@/lib/api-utils';
import { googlePickerTokenStore } from '@/lib/google-token-stores';
import {
  reserveLibraryImport,
  abandonLibraryImport,
  beginLibraryImport,
  getLibraryImport,
  clearLibraryImportJobs,
  MAX_IMPORT_ITEMS,
  type LibraryImportJob,
  type LibraryImportPlan,
} from '@/lib/library-import';

/** Google Photos support via the Picker API.
 *
 * The Picker API is the one Google Photos API open to everyone (the Ambient
 * API is partner-program-only, and the Library API can no longer read a
 * user's photos). Its access model is session-scoped with 60-minute URLs, so
 * a live slideshow source is impossible — instead, the user picks photos in
 * Google Photos and we download them into the local media library, exactly
 * like the iCloud import path.
 *
 * Auth is an OAuth authorization-code flow with a "Web application" client:
 * the picker scope is rejected by the device-code flow, and Google won't
 * register plain-http LAN redirect URIs — so the redirect lands on the
 * static helper page at homescreens.dev, which shows the user a code to
 * paste back into the editor. Token persistence/refresh/revocation lives in
 * the shared google-token-store (also used by the calendar integration).
 */
const SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://photospicker.googleapis.com/v1';

/** Static helper page (in website/) that displays the ?code for pasting.
 *  Every user registers this exact URI on their own OAuth web client. */
export const REDIRECT_URI = 'https://homescreens.dev/connect/google';

const store = googlePickerTokenStore;

// ── Auth ─────────────────────────────────────────────────────────────

export async function hasPickerCredentials(): Promise<boolean> {
  return store.hasCredentials();
}

/** The Google sign-in URL the editor opens in a new tab. */
export async function getPickerAuthUrl(): Promise<string> {
  const { clientId } = await store.getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Without prompt=consent Google omits the refresh token on re-auth,
    // which would silently break imports an hour later.
    prompt: 'consent',
  });
  return `${AUTH_URL}?${params}`;
}

/** Accepts either the bare code or the full pasted redirect URL. */
export function extractAuthCode(pasted: string): string | null {
  const trimmed = pasted.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get('code');
  } catch {
    // Not a URL — treat as a bare code (Google codes are URL-safe).
    return /^[\w\-/.]+$/.test(trimmed) ? trimmed : null;
  }
}

export async function exchangePickerCode(pasted: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = extractAuthCode(pasted);
  if (!code) return { ok: false, error: 'That code does not look right. Paste the code (or the whole link) from the sign-in page.' };

  const { clientId, clientSecret } = await store.getClientCredentials();
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
    // The authorization code is single-use: a retry after a timeout or 5xx
    // would replay a code Google may already have redeemed, turning a
    // transient blip into an invalid_grant that forces a full re-approval.
    retries: 0,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error_description || data.error || 'Sign-in failed. Please try again.' };
  }
  await store.saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type,
    scope: data.scope,
  });
  return { ok: true };
}

/** Liveness-checked: a revoked grant reports false so the editor shows the
 *  sign-in flow again instead of a dead "connected" state. */
export async function isPickerConnected(): Promise<boolean> {
  return store.verifyConnected();
}

export async function disconnectPicker(): Promise<void> {
  await store.disconnect();
}

// ── Picker sessions ──────────────────────────────────────────────────

export interface PickerSession {
  id: string;
  /** The google.com/photospicker URL the user opens to pick photos. */
  pickerUri: string;
  mediaItemsSet: boolean;
  /** Recommended poll cadence, milliseconds. */
  pollIntervalMs: number;
}

async function apiFetch(apiPath: string, init: Parameters<typeof fetchWithTimeout>[1] = {}): Promise<Response> {
  const token = await store.getAccessToken();
  if (!token) throw new Error('Not connected to Google Photos');
  return fetchWithTimeout(`${API_BASE}${apiPath}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
}

/** Google returns durations as protobuf strings like "5s" or "2.5s". */
function parseDurationMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== 'string') return fallbackMs;
  const seconds = Number(value.replace(/s$/, ''));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}

function toSession(data: Record<string, unknown>): PickerSession {
  const polling = data.pollingConfig as { pollInterval?: string } | undefined;
  return {
    id: String(data.id),
    pickerUri: String(data.pickerUri ?? ''),
    mediaItemsSet: !!data.mediaItemsSet,
    pollIntervalMs: parseDurationMs(polling?.pollInterval, 5000),
  };
}

export async function createPickerSession(): Promise<PickerSession> {
  const res = await apiFetch('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    // Session creation is not idempotent: a retried POST after a slow 5xx
    // can succeed twice, orphaning a session nothing ever deletes.
    retries: 0,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || 'Could not start a Google Photos picking session');
  }
  return toSession(await res.json());
}

export async function getPickerSession(id: string): Promise<PickerSession | null> {
  const res = await apiFetch(`/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || 'Could not check the picking session');
  }
  return toSession(await res.json());
}

export async function deletePickerSession(id: string): Promise<void> {
  try {
    await apiFetch(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Best effort — sessions expire on their own.
  }
}

// ── Picked item listing ──────────────────────────────────────────────

interface PickedItem {
  id: string;
  type: 'image' | 'video';
  baseUrl: string;
  filename?: string;
  mimeType?: string;
}

/** Runaway-loop backstop only — the real limit is the item count below. */
const MAX_LIST_PAGES = 500;

/** `truncated` means Google still had more pages when we stopped: the pick
 *  is over the import ceiling (or the page backstop fired), so the caller
 *  must refuse it rather than import a silent subset. */
async function listPickedItems(sessionId: string): Promise<{ items: PickedItem[]; truncated: boolean }> {
  const items: PickedItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await apiFetch(`/mediaItems?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || 'Could not list the picked photos');
    }
    const data = await res.json();
    for (const item of data.mediaItems ?? []) {
      const file = item.mediaFile;
      if (!item.id || !file?.baseUrl) continue;
      items.push({
        id: String(item.id),
        type: item.type === 'VIDEO' ? 'video' : 'image',
        baseUrl: String(file.baseUrl),
        filename: typeof file.filename === 'string' ? file.filename : undefined,
        mimeType: typeof file.mimeType === 'string' ? file.mimeType : undefined,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) return { items, truncated: false };
    // Count-based stop (pageSize is a maximum, not a guarantee): once the
    // pick is provably over the ceiling there is nothing more to learn.
    if (items.length > MAX_IMPORT_ITEMS) break;
  }

  return { items, truncated: true };
}

// ── Import (shared engine in library-import.ts) ──────────────────────

export type PickerImportJob = LibraryImportJob;

export type PickerImportStart =
  | { jobId: string; total: number }
  | { error: 'nothing-picked' | 'invalid-folder' | 'busy' | 'too-many-items' };

/** Test hook. */
export function clearPickerImportJobs(): void {
  clearLibraryImportJobs();
}

export function getPickerImport(jobId: string): PickerImportJob | null {
  return getLibraryImport(jobId);
}

/** Picker baseUrls are minted per session for content Google itself served us,
 *  but never fetch a response-supplied URL outside Google's content domains. */
function isGoogleContentUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    return protocol === 'https:' && /(^|\.)(googleusercontent\.com|google\.com)$/i.test(hostname);
  } catch {
    return false;
  }
}

function toPlan(item: PickedItem): LibraryImportPlan {
  // Images use a sized rendition (`=w4096-h4096`, near-original quality):
  // Google serves it in a web-safe format, so an iPhone HEIC original —
  // which the Pi's Chromium cannot render — still arrives displayable, and
  // it is ~10x smaller on the SD card than `=d` originals. Videos use `=dv`,
  // the high-quality transcode.
  return {
    url: `${item.baseUrl}${item.type === 'video' ? '=dv' : '=w4096-h4096'}`,
    type: item.type,
    stem: `google-${item.id.replace(/[^A-Za-z0-9-]/g, '').slice(-48)}`,
  };
}

/** Start importing everything the user picked in a completed session.
 *  Listing happens synchronously so an empty pick fails the POST clearly;
 *  downloads run in the background and the caller polls getPickerImport. */
export async function startPickerImport(sessionId: string, folder: string): Promise<PickerImportStart> {
  const reserved = reserveLibraryImport(folder);
  if ('error' in reserved) return { error: reserved.error };
  const { job, dir } = reserved;

  let listed: Awaited<ReturnType<typeof listPickedItems>>;
  try {
    listed = await listPickedItems(sessionId);
  } catch (err) {
    abandonLibraryImport(job.id);
    throw err;
  }
  if (listed.items.length === 0) {
    abandonLibraryImport(job.id);
    return { error: 'nothing-picked' };
  }
  if (listed.truncated || listed.items.length > MAX_IMPORT_ITEMS) {
    abandonLibraryImport(job.id);
    return { error: 'too-many-items' };
  }

  beginLibraryImport(job, dir, listed.items.map(toPlan), {
    allowUrl: isGoogleContentUrl,
    // Re-evaluated per item — a long import outlives one access token.
    // Null (or a throw, e.g. secrets cleared mid-import) tells the engine
    // auth is gone and the job must abort rather than fail item-by-item.
    getHeaders: async () => {
      try {
        const token = await store.getAccessToken();
        return token ? { Authorization: `Bearer ${token}` } : null;
      } catch {
        return null;
      }
    },
    // The session's job is done once the download loop ends, however it ends.
    onFinished: () => deletePickerSession(sessionId),
  });

  return { jobId: job.id, total: listed.items.length };
}
