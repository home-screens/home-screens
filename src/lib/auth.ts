import crypto from 'crypto';
import { createJsonStore } from './json-store';

/* ─── Types ──────────────────────────────────── */

interface AuthState {
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

const authStore = createJsonStore<AuthState>({
  path: 'data/auth.json',
  defaultValue: DISABLED_STATE,
  chmod: 0o600,
  errorHandling: 'throw-corrupt',
});

export const readAuthState = authStore.read;

async function writeAuthState(state: AuthState): Promise<void> {
  await authStore.write(state);
  cachedState = null;
}

/* ─── Cached reads (short TTL for requireSession hot path) ── */

let cachedState: { state: AuthState; at: number } | null = null;
const CACHE_TTL = 5_000; // 5 seconds

async function getCachedAuthState(): Promise<AuthState> {
  if (cachedState && Date.now() - cachedState.at < CACHE_TTL) {
    return cachedState.state;
  }
  const state = await readAuthState();
  cachedState = { state, at: Date.now() };
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
  if (!state.passwordHash || !state.salt) return false;
  const hash = await scryptHash(password, state.salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(state.passwordHash));
}

/* ─── Signed session cookies (HMAC-SHA256) ───── */

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** @internal */
export function signSession(payload: SessionPayload, cookieSecret: string): string {
  const payloadStr = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', cookieSecret).update(payloadStr).digest();
  return `${payloadStr}.${base64url(sig)}`;
}

export function verifySession(cookie: string, cookieSecret: string, sessionEpoch?: number): SessionPayload | null {
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sigStr] = parts;

  // Verify HMAC signature
  const expected = crypto.createHmac('sha256', cookieSecret).update(payloadStr).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sigStr, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  // Decode payload
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
  } catch {
    return null;
  }

  // Check expiry
  if (!payload.exp || Date.now() > payload.exp * 1000) return null;

  // Check session epoch — reject sessions issued before the current epoch
  if (sessionEpoch != null && (payload.epoch == null || payload.epoch < sessionEpoch)) return null;

  return payload;
}

/* ─── High-level helpers ─────────────────────── */

export async function isAuthEnabled(): Promise<boolean> {
  const state = await getCachedAuthState();
  return state.passwordHash !== null;
}

/** Returns the IP allowlist configuration. Used by middleware and auth bypass. */
export async function getIpAllowlistConfig(): Promise<{
  allowlist: string[];
  bypassAuth: boolean;
  restrictAccess: boolean;
}> {
  const state = await getCachedAuthState();
  return {
    allowlist: state.ipAllowlist ?? [],
    bypassAuth: state.ipBypassAuth ?? false,
    restrictAccess: state.ipRestrictAccess ?? false,
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
  // Preserve IP allowlist config across password-disable, consistent with
  // setPassword. A user may want "no password, but LAN-only" as a valid mode.
  const existing = await readAuthState();
  await writeAuthState({
    ...DISABLED_STATE,
    ipAllowlist: existing.ipAllowlist,
    ipBypassAuth: existing.ipBypassAuth,
    ipRestrictAccess: existing.ipRestrictAccess,
  });
}

/* ─── Display Token ─────────────────────────── */

function generateDisplayToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function getDisplayToken(): Promise<string | null> {
  const state = await readAuthState();
  if (!state.passwordHash) return null; // auth disabled
  if (state.displayToken) return state.displayToken;
  // Auto-generate for installations that enabled auth before the display token feature
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
  if (!state.passwordHash) return true; // auth disabled: nothing to escalate
  if (!state.cookieSecret) return false;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const token = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/)?.[1];
  return Boolean(token && verifySession(token, state.cookieSecret, state.sessionEpoch));
}

/**
 * Validates the session cookie from a request.
 * No-op when auth is disabled. Throws a 401 Response when auth is enabled
 * and the session is invalid or missing.
 */
export async function requireSession(request: Request): Promise<void> {
  const state = await getCachedAuthState();
  if (!state.passwordHash) return; // auth disabled

  // passwordHash set but cookieSecret missing = corrupt state → fail closed
  if (!state.cookieSecret) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract cookie from request headers
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
 * Validates either a session cookie OR a display Bearer token.
 * No-op when auth is disabled. Throws a 401 Response when auth is enabled
 * and neither credential is valid.
 */
export async function requireDisplayAuth(request: Request, clientIp?: string): Promise<void> {
  let state = await getCachedAuthState();
  if (!state.passwordHash) return; // auth disabled

  // IP bypass: trusted IPs skip display auth entirely
  if (clientIp && state.ipBypassAuth && state.ipAllowlist?.length) {
    const { isIpAllowed } = await import('./ip-allowlist');
    if (isIpAllowed(clientIp, state.ipAllowlist)) return;
  }

  // Auto-migrate: generate display token for existing installations that
  // enabled auth before the display token feature was added.
  if (!state.displayToken) {
    await regenerateDisplayToken();
    state = await readAuthState();
    cachedState = { state, at: Date.now() };
  }

  function tokenMatches(candidate: string): boolean {
    if (!state.displayToken) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(state.displayToken);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Try display token first (Authorization: Bearer <token>)
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
  if (bearerMatch && tokenMatches(bearerMatch[1])) {
    return; // valid display token
  }

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
  }

  // Fall back to session cookie
  if (!state.cookieSecret) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieMatch = cookieHeader.match(/(?:^|;\s*)hs-session=([^;]+)/);
  const sessionToken = cookieMatch?.[1];

  if (sessionToken && verifySession(sessionToken, state.cookieSecret, state.sessionEpoch)) {
    return; // valid session
  }

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
  if (!state.passwordHash || !state.cookieSecret) return null;
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
