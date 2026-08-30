/**
 * Plugin auth engine: token storage, OAuth2 flows, and provider adapters.
 *
 * Tokens live OUT-OF-TREE at `data/plugin-tokens/<safeId>.json` — plugin
 * upgrades wipe and replace `data/plugins/<id>/` wholesale, which is exactly
 * why plugin secrets moved to `data/plugin-secrets/`. Tokens follow the same
 * convention (chmod 0600, dir 0700, serialized writes via json-store).
 *
 * Auth flows never route through the plugin proxy: login/refresh calls are
 * host-originated fetches (like google-auth.ts), so a plugin's
 * allowedDomains stays scoped to the data endpoints it actually reads, and
 * credentials/refresh tokens never transit plugin-visible machinery.
 *
 * The proxy stays provider-agnostic: it asks `tokenInjectionSpec` where and
 * how to attach the token and never learns a provider's endpoints or rules.
 */

import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { createJsonStore } from '@/lib/json-store';
import { sanitizePluginId, getPluginManifest } from '@/lib/plugin-utils';
import { getPluginSecret } from '@/lib/plugin-secrets';
import { readAuthState } from '@/lib/auth';
import { fetchWithTimeout } from '@/lib/api-utils';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { refreshGarminTokens, type GarminPendingMfa } from '@/lib/plugin-auth-garmin';
import type { PluginTokens, TokenInjectionSpec } from '@/lib/plugin-auth-types';
import type { OAuth2Auth, PluginAuth } from '@/types/plugins';

export type { PluginTokens, TokenInjectionSpec } from '@/lib/plugin-auth-types';

const log = logger('plugin-auth');

export const TOKENS_DIR = path.join('data', 'plugin-tokens');
const PENDING_TTL_MS = 10 * 60 * 1000; // fallback user-interactive window
const REFRESH_GRACE_MS = 60_000; // refresh when expiring within 60s

/* ─── Token storage ──────────────────────────── */

// One json-store per tokens file gives each plugin its own serialized write
// queue plus tmp+rename atomic writes, 0o600 file mode, 0o700 directory mode
// — the same pattern as plugin-secrets.ts.
const tokenStores = new Map<string, ReturnType<typeof createJsonStore<PluginTokens | null>>>();

function tokenStoreFor(pluginId: string) {
  const safeId = sanitizePluginId(pluginId);
  let store = tokenStores.get(safeId);
  if (!store) {
    store = createJsonStore<PluginTokens | null>({
      path: path.join(TOKENS_DIR, `${safeId}.json`),
      defaultValue: null,
      chmod: 0o600,
      dirMode: 0o700,
    });
    tokenStores.set(safeId, store);
  }
  return store;
}

export async function loadPluginTokens(pluginId: string): Promise<PluginTokens | null> {
  const tokens = await tokenStoreFor(pluginId).read();
  return tokens?.access_token ? tokens : null;
}

/**
 * Raw token read for the credential backup. Unlike `loadPluginTokens` this
 * does NOT drop a record whose `access_token` is empty — a grant that is
 * currently expired but still holds a refresh token is exactly what a backup
 * needs to carry.
 */
export async function readPluginTokensRaw(pluginId: string): Promise<PluginTokens | null> {
  return tokenStoreFor(pluginId).read();
}

export async function savePluginTokens(pluginId: string, tokens: PluginTokens): Promise<void> {
  await tokenStoreFor(pluginId).write(tokens);
}

export async function deletePluginTokens(pluginId: string): Promise<void> {
  await tokenStoreFor(pluginId).remove().catch(() => {});
}

/* ─── Pending flow state ─────────────────────── */

/**
 * State persisted between the start of a user-interactive flow and its
 * completion. On disk (not in-memory) so a process restart mid-flow doesn't
 * strand the user — auth flows are user-interactive and high-stakes.
 * Lives beside the tokens file as `<safeId>.pending.json`.
 */
export type PendingAuthState =
  | { kind: 'authorization_code'; codeVerifier?: string; redirectUri: string; expiresAt: number }
  | { kind: 'device_code'; deviceCode: string; intervalMs: number; nextPollAt: number; expiresAt: number }
  | { kind: 'garmin_mfa'; mfa: GarminPendingMfa; expiresAt: number };

function pendingPath(pluginId: string): string {
  const safeId = sanitizePluginId(pluginId);
  return path.join(process.cwd(), TOKENS_DIR, `${safeId}.pending.json`);
}

// Distributive omit so each union member keeps its own discriminant + fields.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export async function savePendingAuth(
  pluginId: string,
  state: DistributiveOmit<PendingAuthState, 'expiresAt'>,
  ttlMs: number = PENDING_TTL_MS,
): Promise<void> {
  const filePath = pendingPath(pluginId);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ ...state, expiresAt: Date.now() + ttlMs }), 'utf-8');
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, filePath);
}

/** Load pending state; expired or missing state returns null (and is cleaned up). */
export async function loadPendingAuth(pluginId: string): Promise<PendingAuthState | null> {
  try {
    const raw = await fs.readFile(pendingPath(pluginId), 'utf-8');
    const state = JSON.parse(raw) as PendingAuthState;
    if (typeof state.expiresAt !== 'number' || Date.now() > state.expiresAt) {
      await deletePendingAuth(pluginId);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export async function deletePendingAuth(pluginId: string): Promise<void> {
  await fs.unlink(pendingPath(pluginId)).catch(() => {});
}

/* ─── HMAC-signed state parameter ────────────── */

// The shared OAuth callback URL carries the pluginId in an HMAC-signed
// `state` parameter (same signing pattern as signSession/verifySession in
// auth.ts). Reuses the session cookieSecret when auth is enabled; on
// password-less installs (cookieSecret null) a dedicated secret is generated
// once and persisted beside the tokens.
const STATE_SECRET_FILE = path.join(TOKENS_DIR, '.state-secret');

// Memoized so concurrent first-time callers collapse onto one generation.
// Without it this is a read-miss → generate → write race: two simultaneous
// auth starts each sign with their own secret while the file keeps only one,
// and the loser's flow fails timingSafeEqual at the callback.
let fileSecretPromise: Promise<string> | null = null;

async function getStateSigningSecret(): Promise<string> {
  const authState = await readAuthState();
  if (authState.cookieSecret) return authState.cookieSecret;

  if (!fileSecretPromise) {
    fileSecretPromise = readOrCreateFileSecret().catch((err) => {
      fileSecretPromise = null; // don't cache a failed generation
      throw err;
    });
  }
  return fileSecretPromise;
}

async function readOrCreateFileSecret(): Promise<string> {
  const filePath = path.join(process.cwd(), STATE_SECRET_FILE);
  try {
    const existing = (await fs.readFile(filePath, 'utf-8')).trim();
    if (existing) return existing;
  } catch {
    // fall through to generation
  }
  const secret = crypto.randomBytes(32).toString('hex');
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, secret, { encoding: 'utf-8', mode: 0o600 });
  return secret;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** @internal exported for tests */
export async function signAuthFlowState(pluginId: string): Promise<string> {
  const secret = await getStateSigningSecret();
  const payload = base64url(Buffer.from(JSON.stringify({
    p: pluginId,
    n: crypto.randomBytes(8).toString('hex'),
    iat: Date.now(),
  })));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${payload}.${base64url(sig)}`;
}

/** @internal exported for tests. Returns the pluginId, or null on any mismatch. */
export async function verifyAuthFlowState(state: string): Promise<string | null> {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sigStr] = parts;

  const secret = await getStateSigningSecret();
  const expected = crypto.createHmac('sha256', secret).update(payloadStr).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sigStr, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
    if (typeof payload.p !== 'string' || typeof payload.iat !== 'number') return null;
    if (Date.now() - payload.iat > PENDING_TTL_MS) return null;
    return payload.p;
  } catch {
    return null;
  }
}

/* ─── OAuth2 helpers ─────────────────────────── */

/** The single callback URL to register with providers, derived per-request.
 *  Derived from the Host header (or x-forwarded-* behind a proxy) rather than
 *  request.url, whose host is the server's bind address (e.g. 0.0.0.0) — the
 *  redirect must match the origin the browser is actually using. */
export function getPluginAuthRedirectUri(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}/api/plugins/auth/callback`;
}

async function getOAuthClientCredentials(
  pluginId: string,
  auth: OAuth2Auth,
): Promise<{ clientId: string; clientSecret: string | null }> {
  const clientId = await getPluginSecret(pluginId, auth.secrets.clientId);
  if (!clientId) {
    throw new Error('Add the connection credentials in the module settings first.');
  }
  const clientSecret = auth.secrets.clientSecret
    ? await getPluginSecret(pluginId, auth.secrets.clientSecret)
    : null;
  return { clientId, clientSecret };
}

/** Look a dot path up in a parsed token response. */
function lookupPath(data: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    data,
  );
}

/** Map a (possibly non-standard) token response onto PluginTokens. */
function parseTokenResponse(
  auth: OAuth2Auth,
  data: Record<string, unknown>,
  previous?: PluginTokens | null,
): PluginTokens {
  const tf = auth.tokenResponseTransform;
  const accessToken = lookupPath(data, tf?.accessTokenPath ?? 'access_token');
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('The service did not return an access token.');
  }
  const refreshToken = lookupPath(data, tf?.refreshTokenPath ?? 'refresh_token');
  const expiresIn = lookupPath(data, tf?.expiresInPath ?? 'expires_in');
  const expiresMs = typeof expiresIn === 'number'
    ? (tf?.expiresInUnit === 'milliseconds' ? expiresIn : expiresIn * 1000)
    : 3600_000;
  return {
    access_token: accessToken,
    // Preserve the prior refresh token when the provider omits it on refresh
    // (same pattern as google-auth.ts).
    refresh_token: typeof refreshToken === 'string' && refreshToken
      ? refreshToken
      : previous?.refresh_token,
    token_type: typeof data.token_type === 'string' && data.token_type ? data.token_type : 'Bearer',
    expiry_date: Date.now() + expiresMs,
    scope: typeof data.scope === 'string' ? data.scope : previous?.scope,
  };
}

/**
 * POST to a token endpoint and parse the response (JSON or form-urlencoded,
 * per Content-Type — some providers still answer urlencoded).
 */
async function postTokenEndpoint(
  url: string,
  params: Record<string, string>,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  const contentType = res.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('json')) {
      data = JSON.parse(text);
    } else {
      data = Object.fromEntries(new URLSearchParams(text));
    }
  } catch {
    // leave data empty — callers treat missing fields as failure
  }
  return { ok: res.ok, status: res.status, data };
}

/** Apply the clientAuthentication setting to a token request. */
function applyClientAuth(
  auth: OAuth2Auth,
  clientId: string,
  clientSecret: string | null,
  params: Record<string, string>,
  headers: Record<string, string>,
): void {
  const mode = auth.clientAuthentication ?? 'body';
  if (mode === 'header') {
    headers.Authorization = 'Basic ' + Buffer.from(`${clientId}:${clientSecret ?? ''}`).toString('base64');
  } else {
    params.client_id = clientId;
    if (mode === 'body' && clientSecret) params.client_secret = clientSecret;
  }
}

/* ─── Authorization Code flow ────────────────── */

export async function startAuthorizationCodeFlow(
  pluginId: string,
  auth: OAuth2Auth,
  request: Request,
): Promise<{ authUrl: string; redirectUri: string }> {
  if (!auth.authorizationUrl) throw new Error('Plugin auth config is missing authorizationUrl');
  const { clientId } = await getOAuthClientCredentials(pluginId, auth);
  const redirectUri = getPluginAuthRedirectUri(request);
  const state = await signAuthFlowState(pluginId);

  const usePkce = auth.pkce !== false;
  let codeVerifier: string | undefined;
  const url = new URL(auth.authorizationUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', auth.scopes.join(auth.scopeSeparator ?? ' '));
  url.searchParams.set('state', state);
  if (usePkce) {
    codeVerifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [key, value] of Object.entries(auth.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }

  await savePendingAuth(pluginId, { kind: 'authorization_code', codeVerifier, redirectUri });
  return { authUrl: url.toString(), redirectUri };
}

/**
 * Shared-callback handler: validates the signed state, exchanges the code,
 * and persists tokens. Returns the pluginId the flow belongs to.
 */
export async function handleAuthorizationCodeCallback(code: string, state: string): Promise<string> {
  const pluginId = await verifyAuthFlowState(state);
  if (!pluginId) throw new Error('This sign-in link is invalid or has expired. Start again from the editor.');

  const manifest = await getPluginManifest(pluginId);
  const auth = manifest?.auth;
  if (!auth || auth.type !== 'oauth2' || auth.flow !== 'authorization_code') {
    throw new Error('This plugin does not use a browser sign-in flow.');
  }

  const pending = await loadPendingAuth(pluginId);
  if (!pending || pending.kind !== 'authorization_code') {
    throw new Error('This sign-in attempt has expired. Start again from the editor.');
  }

  const { clientId, clientSecret } = await getOAuthClientCredentials(pluginId, auth);
  const params: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    ...(pending.codeVerifier ? { code_verifier: pending.codeVerifier } : {}),
    ...auth.extraTokenParams,
  };
  const headers: Record<string, string> = {};
  applyClientAuth(auth, clientId, clientSecret, params, headers);

  const result = await postTokenEndpoint(auth.tokenUrl, params, headers);
  if (!result.ok) {
    const detail = typeof result.data.error_description === 'string'
      ? result.data.error_description
      : typeof result.data.error === 'string' ? result.data.error : `HTTP ${result.status}`;
    throw new Error(`The sign-in could not be completed: ${detail}`);
  }
  await savePluginTokens(pluginId, parseTokenResponse(auth, result.data));
  await deletePendingAuth(pluginId);
  return pluginId;
}

/* ─── Device Code flow ───────────────────────── */

export interface DeviceFlowStart {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export async function startDeviceFlow(pluginId: string, auth: OAuth2Auth): Promise<DeviceFlowStart> {
  if (!auth.authorizationUrl) throw new Error('Plugin auth config is missing authorizationUrl');
  const { clientId } = await getOAuthClientCredentials(pluginId, auth);

  const result = await postTokenEndpoint(auth.authorizationUrl, {
    client_id: clientId,
    scope: auth.scopes.join(auth.scopeSeparator ?? ' '),
    ...auth.extraAuthParams,
  }, {});
  const { data } = result;
  const deviceCode = data.device_code;
  const userCode = data.user_code;
  // RFC 8628 names it verification_uri; Google says verification_url.
  const verificationUrl = data.verification_uri ?? data.verification_url;
  if (!result.ok || typeof deviceCode !== 'string' || typeof userCode !== 'string' || typeof verificationUrl !== 'string') {
    const detail = typeof data.error_description === 'string' ? data.error_description
      : typeof data.error === 'string' ? data.error : `HTTP ${result.status}`;
    throw new Error(`Could not start the sign-in: ${detail}`);
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 600;
  const interval = typeof data.interval === 'number' ? data.interval : 5;

  // Honor the provider's own code lifetime rather than a fixed 10-min window
  // — device codes commonly live 15-30 min, and a short host TTL would expire
  // the pending state (and the user's session) before the real code does.
  await savePendingAuth(pluginId, {
    kind: 'device_code',
    deviceCode,
    intervalMs: interval * 1000,
    nextPollAt: Date.now() + interval * 1000,
  }, expiresIn * 1000);
  return { userCode, verificationUrl, expiresIn, interval };
}

// Per-plugin serialization of the device-poll read-modify-write. Two proxy
// callers polling at once would otherwise both clear the nextPollAt gate and
// both POST the token endpoint, tripping the provider's slow_down. This holds
// only within one process (see refreshInFlight's note); a cross-worker race
// is self-correcting because the provider itself enforces the interval.
const pollInFlight = new Map<string, Promise<DeviceFlowPoll>>();

export type DeviceFlowPoll =
  | { status: 'pending' }
  | { status: 'connected' }
  | { status: 'expired' | 'denied'; error: string };

export function pollDeviceFlow(pluginId: string, auth: OAuth2Auth): Promise<DeviceFlowPoll> {
  const existing = pollInFlight.get(pluginId);
  if (existing) return existing;
  const promise = pollDeviceFlowInner(pluginId, auth).finally(() => pollInFlight.delete(pluginId));
  pollInFlight.set(pluginId, promise);
  return promise;
}

async function pollDeviceFlowInner(pluginId: string, auth: OAuth2Auth): Promise<DeviceFlowPoll> {
  const pending = await loadPendingAuth(pluginId);
  if (!pending || pending.kind !== 'device_code') {
    // The pending file may already be consumed by a concurrent poll that
    // succeeded — report connected if tokens exist.
    const tokens = await loadPluginTokens(pluginId);
    if (tokens) return { status: 'connected' };
    return { status: 'expired', error: 'The code expired. Start the sign-in again.' };
  }

  // Server-side enforcement of the provider's minimum poll interval: answer
  // "pending" from state without hitting the provider when polled too soon.
  if (Date.now() < pending.nextPollAt) return { status: 'pending' };

  const { clientId, clientSecret } = await getOAuthClientCredentials(pluginId, auth);
  const params: Record<string, string> = {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: pending.deviceCode,
    ...auth.extraTokenParams,
  };
  const headers: Record<string, string> = {};
  applyClientAuth(auth, clientId, clientSecret, params, headers);

  const result = await postTokenEndpoint(auth.tokenUrl, params, headers);
  if (result.ok && typeof result.data.access_token === 'string') {
    await savePluginTokens(pluginId, parseTokenResponse(auth, result.data));
    await deletePendingAuth(pluginId);
    return { status: 'connected' };
  }

  const errorCode = typeof result.data.error === 'string' ? result.data.error : '';
  if (errorCode === 'authorization_pending' || errorCode === 'slow_down') {
    const intervalMs = errorCode === 'slow_down' ? pending.intervalMs + 5000 : pending.intervalMs;
    // Preserve the provider's original code lifetime — don't reset the TTL to
    // a fresh full window on every poll.
    await savePendingAuth(pluginId, {
      kind: 'device_code',
      deviceCode: pending.deviceCode,
      intervalMs,
      nextPollAt: Date.now() + intervalMs,
    }, Math.max(pending.expiresAt - Date.now(), 0));
    return { status: 'pending' };
  }
  await deletePendingAuth(pluginId);
  if (errorCode === 'expired_token') {
    return { status: 'expired', error: 'The code expired. Start the sign-in again.' };
  }
  const detail = typeof result.data.error_description === 'string' ? result.data.error_description : errorCode;
  return { status: 'denied', error: detail || 'The sign-in was not approved.' };
}

/* ─── Client Credentials flow ────────────────── */

export async function runClientCredentialsFlow(pluginId: string, auth: OAuth2Auth): Promise<void> {
  const { clientId, clientSecret } = await getOAuthClientCredentials(pluginId, auth);
  const params: Record<string, string> = {
    grant_type: 'client_credentials',
    scope: auth.scopes.join(auth.scopeSeparator ?? ' '),
    ...auth.extraTokenParams,
  };
  const headers: Record<string, string> = {};
  applyClientAuth(auth, clientId, clientSecret, params, headers);

  const result = await postTokenEndpoint(auth.tokenUrl, params, headers);
  if (!result.ok) {
    const detail = typeof result.data.error_description === 'string'
      ? result.data.error_description
      : typeof result.data.error === 'string' ? result.data.error : `HTTP ${result.status}`;
    throw new Error(`Could not connect: ${detail}`);
  }
  await savePluginTokens(pluginId, parseTokenResponse(auth, result.data));
}

/* ─── Token injection (provider → proxy seam) ── */

function isGarminHost(pattern: string): boolean {
  return pattern === 'garmin.com' || pattern.endsWith('.garmin.com');
}

/**
 * Where and how the proxy should attach a plugin's access token, returned as
 * plain data so the proxy stays provider-agnostic (it never learns Garmin's
 * hosts or an OAuth2 placement rule — it just applies this spec).
 *
 * Garmin: Bearer header, only on the plugin's garmin.com hosts (the token is
 * account-scoped, so it must never leak to an unrelated allowed domain).
 * OAuth2: caller-declared placement, restricted to the manifest's required
 * `tokenTargetDomains` so the bearer never fans out to an unrelated allowed
 * host (e.g. a CDN).
 */
export function tokenInjectionSpec(auth: PluginAuth, allowedDomains: string[]): TokenInjectionSpec {
  if (auth.type === 'garmin') {
    return { targetDomains: allowedDomains.filter(isGarminHost), placement: 'header' };
  }
  return {
    targetDomains: auth.tokenTargetDomains,
    placement: auth.tokenPlacement,
    paramName: auth.tokenParamName,
  };
}

/* ─── Refresh + access-token resolution ──────── */

async function refreshTokens(pluginId: string, auth: PluginAuth, tokens: PluginTokens): Promise<PluginTokens> {
  if (auth.type === 'garmin') {
    return refreshGarminTokens(tokens);
  }
  if (!tokens.refresh_token) {
    if (auth.flow === 'client_credentials') {
      // No refresh tokens in this flow — just mint a new access token.
      await runClientCredentialsFlow(pluginId, auth);
      const renewed = await loadPluginTokens(pluginId);
      if (!renewed) throw new Error('Token renewal failed');
      return renewed;
    }
    throw new Error('No refresh token stored — reconnect the account.');
  }
  const { clientId, clientSecret } = await getOAuthClientCredentials(pluginId, auth);
  const params: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  };
  const headers: Record<string, string> = {};
  applyClientAuth(auth, clientId, clientSecret, params, headers);

  const result = await postTokenEndpoint(auth.tokenUrl, params, headers);
  if (!result.ok || typeof result.data.access_token !== 'string') {
    throw new Error(`Token refresh failed (HTTP ${result.status})`);
  }
  return parseTokenResponse(auth, result.data, tokens);
}

// Refresh is serialized per plugin WITHIN THIS PROCESS: concurrent proxy
// requests (e.g. several display Pis polling at once) share one in-flight
// refresh instead of racing the provider — some providers rotate the refresh
// token, so a lost race bricks the grant. Note this is a single-process lock;
// under multiple Next workers two processes can still refresh concurrently.
// Acceptable here (the app runs a single server process on the Pi hub); a
// cross-worker deployment would need a file mutex.
const refreshInFlight = new Map<string, Promise<PluginTokens | null>>();

function refreshSerialized(pluginId: string, auth: PluginAuth, tokens: PluginTokens): Promise<PluginTokens | null> {
  const existing = refreshInFlight.get(pluginId);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const renewed = await refreshTokens(pluginId, auth, tokens);
      await savePluginTokens(pluginId, renewed);
      audit({ action: 'plugin_token_refresh', pluginId });
      return renewed;
    } catch (err) {
      log.error(`Token refresh failed for plugin ${pluginId}:`, err instanceof Error ? err.message : err);
      return null;
    } finally {
      refreshInFlight.delete(pluginId);
    }
  })();
  refreshInFlight.set(pluginId, promise);
  return promise;
}

/**
 * The proxy's entry point: returns a currently-valid access token, refreshing
 * (serialized per plugin) when expired or expiring within 60s. `force` skips
 * the expiry check — used for the single 401 retry.
 */
export async function getValidAccessToken(
  pluginId: string,
  opts?: { force?: boolean },
): Promise<string | null> {
  const manifest = await getPluginManifest(pluginId);
  const auth = manifest?.auth;
  if (!auth) return null;

  const tokens = await loadPluginTokens(pluginId);
  if (!tokens) return null;

  const fresh = tokens.expiry_date > Date.now() + REFRESH_GRACE_MS;
  if (fresh && !opts?.force) return tokens.access_token;

  const renewed = await refreshSerialized(pluginId, auth, tokens);
  return renewed?.access_token ?? null;
}

/* ─── Disconnect ─────────────────────────────── */

/** Best-effort revocation at the provider, then clear all local state. */
export async function disconnectPluginAuth(pluginId: string): Promise<void> {
  const manifest = await getPluginManifest(pluginId);
  const auth = manifest?.auth;
  try {
    if (auth?.type === 'oauth2' && auth.revokeUrl) {
      const tokens = await loadPluginTokens(pluginId);
      const tokenValue = auth.revokeTokenType === 'refresh_token'
        ? tokens?.refresh_token
        : tokens?.access_token;
      if (tokens && tokenValue) {
        const { clientId, clientSecret } = await getOAuthClientCredentials(pluginId, auth);
        const params: Record<string, string> = { token: tokenValue };
        const headers: Record<string, string> = {};
        applyClientAuth(auth, clientId, clientSecret, params, headers);
        await postTokenEndpoint(auth.revokeUrl, params, headers);
      }
    }
  } catch (err) {
    log.warn(`Token revocation failed for plugin ${pluginId} (continuing with local cleanup):`,
      err instanceof Error ? err.message : err);
  }
  await deletePluginTokens(pluginId);
  await deletePendingAuth(pluginId);
}

/* ─── Status ─────────────────────────────────── */

export interface PluginAuthStatus {
  connected: boolean;
  expiresAt?: number;
}

export async function getPluginAuthStatus(pluginId: string): Promise<PluginAuthStatus> {
  const tokens = await loadPluginTokens(pluginId);
  if (tokens) {
    return { connected: true, expiresAt: tokens.expiry_date };
  }
  return { connected: false };
}
