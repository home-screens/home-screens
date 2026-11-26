import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { createJsonStore } from './json-store';
import { getDataRoot } from './data-root';
import { authPosture, hasPassword } from './auth-posture';
import { statSignature } from './stat-signature';
import { safeEqual, signPayload, verifySignedPayload } from './signed-payload';
import { findWall, touchWall, type WallEntry } from './display-walls';
import { noteRefusedKey } from './display-key-refusals';

/* ─── Types ──────────────────────────────────── */

export interface AuthState {
  passwordHash: string | null;
  salt: string | null;
  cookieSecret: string | null;
  displayToken?: string | null;
  /** Epoch timestamp (seconds). Sessions issued before this are rejected. */
  sessionEpoch?: number;
  /** CIDR entries for the IP allowlist. Empty array = feature inactive. */
  ipAllowlist?: string[];
  /** When true, requests from allowlisted IPs skip display auth. */
  ipBypassAuth?: boolean;
  /** When true, non-allowlisted IPs are blocked (except /login and /api/auth/status). */
  ipRestrictAccess?: boolean;
}

interface SessionPayload {
  iat: number;
  exp: number;
  /** Session epoch at time of issue. Must match or exceed current AuthState.sessionEpoch. */
  epoch?: number;
}

/* ─── Constants ──────────────────────────────── */

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
const SESSION_REMEMBER_ME_AGE = 90 * 24 * 60 * 60; // 90 days in seconds
const SCRYPT_KEYLEN = 64;

/* ─── Auth State (fail-closed reads) ─────────── */

const DISABLED_STATE: AuthState = { passwordHash: null, salt: null, cookieSecret: null, displayToken: null };

const AUTH_FILE = 'data/auth.json';

const authStore = createJsonStore<AuthState>({
  path: AUTH_FILE,
  defaultValue: DISABLED_STATE,
  chmod: 0o600,
  errorHandling: 'throw-corrupt',
});

export const readAuthState = authStore.read;

async function writeAuthState(state: AuthState): Promise<void> {
  await authStore.write(state);
  cachedState = null;
}

/* ─── Cached reads (requireSession hot path) ─────── */

let cachedState: { state: AuthState; signature: string } | null = null;
let unreadableStats = 0;

/**
 * Identity of auth.json on disk: inode, size and mtime, so a write from
 * anywhere (this process, the reset script, a restored backup, a test
 * rewriting the file) is seen on the next request instead of up to 5s later.
 * The proxy (src/proxy.ts) keys its own cache the same way, so the two never
 * disagree about whether a password is set. A stat that fails for a reason
 * other than "no file" gets a one-off signature and forces a real read, whose
 * own error handling decides what to do.
 */
async function authFileSignature(): Promise<string> {
  try {
    return statSignature(await fs.stat(path.join(getDataRoot(), AUTH_FILE)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return `unreadable:${++unreadableStats}`;
  }
}

async function getCachedAuthState(): Promise<AuthState> {
  const signature = await authFileSignature();
  if (cachedState && cachedState.signature === signature) {
    return cachedState.state;
  }
  const state = await readAuthState();
  cachedState = { state, signature };
  return state;
}

export function clearAuthCache(): void {
  cachedState = null;
}

/* ─── Password hashing (scrypt) ──────────────── */

function scryptHash(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

export async function verifyPassword(password: string): Promise<boolean> {
  const state = await readAuthState();
  if (!hasPassword(state) || typeof state.passwordHash !== 'string' || !state.salt) return false;
  const hash = await scryptHash(password, state.salt);
  return safeEqual(hash, state.passwordHash);
}

/* ─── Signed session cookies (HMAC-SHA256) ───── */

/** @internal */
export function signSession(payload: SessionPayload, cookieSecret: string): string {
  return signPayload(payload, cookieSecret);
}

export function verifySession(cookie: string, cookieSecret: string, sessionEpoch?: number): SessionPayload | null {
  const payload = verifySignedPayload(cookie, cookieSecret) as SessionPayload | null;
  if (!payload || typeof payload !== 'object') return null;

  if (!payload.exp || Date.now() > payload.exp * 1000) return null;

  // Check session epoch — reject sessions issued before the current epoch
  if (sessionEpoch != null && (payload.epoch == null || payload.epoch < sessionEpoch)) return null;

  return payload;
}

/* ─── High-level helpers ─────────────────────── */

export async function isAuthEnabled(): Promise<boolean> {
  return hasPassword(await getCachedAuthState());
}

/** Returns the IP allowlist configuration. Used by middleware and auth bypass. */
export async function getIpAllowlistConfig(): Promise<{
  allowlist: string[];
  bypassAuth: boolean;
  restrictAccess: boolean;
}> {
  const posture = authPosture(await getCachedAuthState());
  return {
    allowlist: posture.ipAllowlist,
    bypassAuth: posture.ipBypassAuth,
    restrictAccess: posture.ipRestrictAccess,
  };
}

/** Update IP allowlist configuration. Preserves all other auth state. */
export async function setIpAllowlistConfig(config: {
  allowlist: string[];
  bypassAuth: boolean;
  restrictAccess: boolean;
}): Promise<void> {
  const state = await readAuthState();
  await writeAuthState({
    ...state,
    ipAllowlist: config.allowlist,
    ipBypassAuth: config.bypassAuth,
    ipRestrictAccess: config.restrictAccess,
  });
}

export function createSessionCookie(cookieSecret: string, rememberMe = false, sessionEpoch?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = rememberMe ? SESSION_REMEMBER_ME_AGE : SESSION_MAX_AGE;
  const payload: SessionPayload = { iat: now, exp: now + maxAge };
  if (sessionEpoch != null) payload.epoch = sessionEpoch;
  return signSession(payload, cookieSecret);
}

/** Returns the appropriate cookie Max-Age for the given rememberMe flag. */
export function getSessionMaxAge(rememberMe = false): number {
  return rememberMe ? SESSION_REMEMBER_ME_AGE : SESSION_MAX_AGE;
}

export async function setPassword(newPassword: string): Promise<string> {
  const existing = await readAuthState();
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = await scryptHash(newPassword, salt);
  const cookieSecret = crypto.randomBytes(32).toString('hex');
  // Preserve existing display token, or auto-generate one on first password set
  const displayToken = existing.displayToken ?? generateDisplayToken();
  // Spread existing state so optional fields (ipAllowlist, ipBypassAuth,
  // ipRestrictAccess, sessionEpoch) survive password changes. Only the
  // password-specific fields are overwritten.
  await writeAuthState({
    ...existing,
    passwordHash: hash,
    salt,
    cookieSecret,
    displayToken,
  });
  return createSessionCookie(cookieSecret, false, existing.sessionEpoch);
}

export async function clearPassword(): Promise<void> {
  // Keep the IP allowlist ("no password, but LAN-only" is a valid mode) and
  // the display key: Home Assistant and phone bookmarks hold it, and turning
  // the password off for a guest must not break them the day it goes back on.
  const existing = await readAuthState();
  await writeAuthState({
    ...DISABLED_STATE,
    displayToken: existing.displayToken ?? null,
    ipAllowlist: existing.ipAllowlist,
    ipBypassAuth: existing.ipBypassAuth,
    ipRestrictAccess: existing.ipRestrictAccess,
  });
}

/* ─── Display Token ─────────────────────────── */

function generateDisplayToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * The display key, made on first ask whether or not a password is set. With
 * no password nothing checks it, but it can go into Home Assistant now and
 * keeps working once a password is set, since `setPassword` keeps it.
 */
export async function getDisplayToken(): Promise<string> {
  const state = await readAuthState();
  if (state.displayToken) return state.displayToken;
  return regenerateDisplayToken();
}

export async function regenerateDisplayToken(): Promise<string> {
  const state = await readAuthState();
  const token = generateDisplayToken();
  await writeAuthState({ ...state, displayToken: token });
  return token;
}

/* ─── Session Revocation ───────────────────── */

/**
 * Revoke all active sessions by bumping the session epoch.
 * Any session issued before the new epoch will be rejected.
 */
export async function revokeAllSessions(): Promise<void> {
  const state = await readAuthState();
  const epoch = Math.floor(Date.now() / 1000);
  await writeAuthState({ ...state, sessionEpoch: epoch });
}

/**
 * True when the caller is the editor: a valid session cookie, or auth
 * disabled (in which case every caller can already PUT the config). Unlike
 * `requireDisplayAuth` this rejects a display Bearer token, so it gates the
 * few behaviours a display must not be able to ask for on its own.
 */
export async function hasEditorSession(request: Request): Promise<boolean> {
  const state = await getCachedAuthState();
  if (!hasPassword(state)) return true; // auth disabled: nothing to escalate
  if (!state.cookieSecret) return false;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const token = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/)?.[1];
  return Boolean(token && verifySession(token, state.cookieSecret, state.sessionEpoch));
}

/**
 * True only for a real signed-in session: a password is set and the request
 * carries a valid cookie. Unlike `hasEditorSession`, no password means false,
 * because then anyone on the network is "the editor" and the grown-up code
 * has to ask everyone.
 */
export async function hasSignedInSession(request: Request): Promise<boolean> {
  return cookiesHoldSignIn(request.headers.get('cookie') ?? '');
}

/** `hasSignedInSession` for a caller that has the `Cookie` header but no request, such as a page. */
export async function cookiesHoldSignIn(cookieHeader: string): Promise<boolean> {
  const state = await getCachedAuthState();
  if (!hasPassword(state) || !state.cookieSecret) return false;
  const token = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/)?.[1];
  return Boolean(token && verifySession(token, state.cookieSecret, state.sessionEpoch));
}

/**
 * The wall a request's `hs-display` cookie belongs to, let in or still
 * waiting, or null. On a hub with no password every caller may show the
 * wall, and the entry is only a record kept in case a password comes later.
 */
export async function wallFromCookies(cookieHeader: string): Promise<WallEntry | null> {
  if (!cookieHeader.includes('hs-display=')) return null;
  return findWall(cookieHeader, hasPassword(await getCachedAuthState()));
}

/**
 * Whether the request carries the display key itself, in the `Authorization`
 * header or (for `/api/display/*`) the `token` query parameter. False when no
 * password is set: there is no key to carry.
 */
export async function carriesDisplayKey(request: Request): Promise<boolean> {
  const state = await getCachedAuthState();
  if (!hasPassword(state) || !state.displayToken) return false;
  const bearer = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/)?.[1];
  if (bearer && safeEqual(bearer, state.displayToken)) return true;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/display/')) return false;
  const queryToken = url.searchParams.get('token');
  return Boolean(queryToken && safeEqual(queryToken, state.displayToken));
}

/**
 * Validates the session cookie from a request.
 * No-op when auth is disabled. Throws a 401 Response when auth is enabled
 * and the session is invalid or missing.
 */
export async function requireSession(request: Request): Promise<void> {
  const state = await getCachedAuthState();
  if (!hasPassword(state)) return; // auth disabled

  // passwordHash set but cookieSecret missing = corrupt state → fail closed
  if (!state.cookieSecret) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/);
  const token = match?.[1];

  if (!token || !verifySession(token, state.cookieSecret, state.sessionEpoch)) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Validates a session cookie, the display key (a Bearer token), or the
 * `hs-display` cookie of a wall that has been let in.
 * No-op when auth is disabled. Throws a 401 Response when auth is enabled
 * and none of them is valid. A wall that is still waiting is refused.
 */
export async function requireDisplayAuth(request: Request, clientIp?: string): Promise<void> {
  let state = await getCachedAuthState();
  const posture = authPosture(state);
  if (!posture.enabled) return; // auth disabled

  // IP bypass: trusted IPs skip display auth entirely
  if (clientIp && posture.ipBypassAuth && posture.ipAllowlist.length) {
    const { isIpAllowed } = await import('./ip-allowlist');
    if (isIpAllowed(clientIp, posture.ipAllowlist)) return;
  }

  // Auto-migrate: generate display token for existing installations that
  // enabled auth before the display token feature was added.
  if (!state.displayToken) {
    await regenerateDisplayToken();
    state = await getCachedAuthState();
  }

  function tokenMatches(candidate: string): boolean {
    return !!state.displayToken && safeEqual(candidate, state.displayToken);
  }

  // Try display token first (Authorization: Bearer <token>)
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
  if (bearerMatch && tokenMatches(bearerMatch[1])) {
    return; // valid display token
  }
  let carriedKey = !!bearerMatch;

  // Try query param token — restricted to /api/display/* for phone bookmarks only.
  // Bearer header is the primary auth method; query tokens are a convenience for
  // bookmarkable GET commands (wake/sleep/reload) and are limited in scope to avoid
  // credential leakage through browser history, logs, and referrer headers.
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/display/')) {
    const queryToken = url.searchParams.get('token');
    if (queryToken && tokenMatches(queryToken)) {
      return; // valid display token via query param
    }
    if (queryToken) carriedKey = true;
  }

  // A wall that has been let in proves itself with its own cookie.
  const cookieHeader = request.headers.get('cookie') ?? '';
  const wall = await wallFromCookies(cookieHeader);
  if (wall?.status === 'in') {
    await touchWall(wall, clientIp ? { address: clientIp } : {});
    return;
  }

  // Fall back to session cookie
  if (!state.cookieSecret) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieMatch = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/);
  const sessionToken = cookieMatch?.[1];

  if (sessionToken && verifySession(sessionToken, state.cookieSecret, state.sessionEpoch)) {
    return; // valid session
  }

  // An old key in Home Assistant or a bookmark fails with nothing on screen;
  // Settings > Security says where it came from.
  if (carriedKey) noteRefusedKey(clientIp);

  throw new Response(JSON.stringify({ error: 'Authentication required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Secret for signing media tokens (see `lib/media-token.ts`). Reuses the
 * session cookieSecret — present whenever auth is enabled. Returns null when
 * auth is disabled, which callers treat as "no gating": mint no tokens,
 * verify nothing, matching `requireDisplayAuth`'s early return.
 */
export async function getMediaTokenSecret(): Promise<string | null> {
  const state = await getCachedAuthState();
  if (!hasPassword(state) || !state.cookieSecret) return null;
  return state.cookieSecret;
}

/**
 * Build Set-Cookie header value for the session cookie.
 */
export function buildSessionCookie(
  token: string,
  request: Request,
  maxAge = SESSION_MAX_AGE,
): string {
  const secure = request.url.startsWith('https://');
  const parts = [
    `hs-session=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Build a Set-Cookie header that clears the session cookie.
 */
export function buildClearCookie(request: Request): string {
  return buildSessionCookie('', request, 0);
}
