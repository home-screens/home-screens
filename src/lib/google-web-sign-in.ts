import crypto from 'crypto';
import { trustedForwardedHost } from './client-ip';
import { safeEqual } from './signed-payload';
import { SignInHelperUnreachableError, type GoogleClientKind, type GoogleTokenStore } from './google-token-store';

/**
 * Google's web sign-in, shared by Google Photos import and by Calendar when it
 * adds events: the link, the hub's one waiting sign-in, and redeeming the code
 * that comes back. Each integration keeps its own grant and its own words.
 *
 * Sending people straight back to the hub after a Google sign-in.
 *
 * Google only ever returns to https://homescreens.dev/connect/google. With
 * Home Screens' own Google app switched on (HS_GOOGLE_HOSTED), each sign-in
 * link also carries the hub's own address in `state`, and that page forwards
 * the code to the hub's /editor/connect/google when the address is on a home
 * network, so nobody has to copy a code.
 *
 * A hub page that redeemed whatever code a link carried would let anyone
 * connect their own Google account to someone else's hub, so each link also
 * carries a one-time value, checked when the code comes back, and PKCE:
 * Google refuses the code without this hub's verifier, which never leaves the
 * hub. One sign-in waits at a time, in memory, for 10 minutes; a restart or
 * a newer sign-in means signing in again.
 *
 * `state` is `<one-time value>.<base64url(hub address)>`, or the one-time
 * value alone when the hub's address could not be confirmed. The website's
 * forwarding rule (website/src/lib/hub-return.ts) reads the same format.
 */

/** A Google sign-in link is good for 10 minutes; so is the sign-in waiting for it. */
export const SIGN_IN_TTL_MS = 10 * 60_000;

/** What a web sign-in is for, so its code is redeemed into the right grant. */
export type WebSignInPurpose = 'photos' | 'calendar';

interface PendingSignIn {
  nonce: string;
  verifier: string;
  expiresAt: number;
  purpose: WebSignInPurpose;
}

interface SignInState {
  pending: PendingSignIn | null;
}

// On globalThis because route bundles can each carry their own copy of this
// module (webpack dev does), and the link and the code's return are
// different requests.
const key = Symbol.for('home-screens.google-picker-sign-in.v1');
const globals = globalThis as typeof globalThis & { [key]?: SignInState };
const signIn: SignInState = globals[key] ??= { pending: null };

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Start a sign-in, replacing any that was waiting. Returns the link's
 * `state` and its PKCE challenge (S256).
 */
export function beginSignIn(hubAddress: string | null, purpose: WebSignInPurpose): { state: string; codeChallenge: string } {
  const nonce = randomToken();
  const verifier = randomToken();
  signIn.pending = { nonce, verifier, expiresAt: Date.now() + SIGN_IN_TTL_MS, purpose };
  const codeChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = hubAddress ? `${nonce}.${Buffer.from(hubAddress).toString('base64url')}` : nonce;
  return { state, codeChallenge };
}

/** The waiting sign-in, when it is still good and `state` (if given) is its own. */
function matchingSignIn(state: string | undefined): PendingSignIn | null {
  const pending = signIn.pending;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    signIn.pending = null;
    return null;
  }
  if (state !== undefined && !safeEqual(state.split('.')[0], pending.nonce)) return null;
  return pending;
}

/**
 * Claim the waiting sign-in's PKCE verifier, once, for `purpose`.
 *
 * - With `state` (the code came back through the hub's return page), its
 *   one-time value must match the waiting sign-in's. A mismatch leaves the
 *   waiting sign-in alone, so a stray or forged link cannot cancel it.
 * - Without `state` (a code pasted into the editor), the waiting sign-in is
 *   the one the code belongs to.
 *
 * Null when nothing is waiting, it expired, the value does not match, or it
 * was started for the other integration (which is left waiting).
 */
export function takeSignIn(state: string | undefined, purpose: WebSignInPurpose): { verifier: string } | null {
  const pending = matchingSignIn(state);
  if (!pending || pending.purpose !== purpose) return null;
  signIn.pending = null;
  return { verifier: pending.verifier };
}

/** What the waiting sign-in `state` belongs to is for, without claiming it; the return page uses it to pick the grant. */
export function signInPurpose(state: string): WebSignInPurpose | null {
  return matchingSignIn(state)?.purpose ?? null;
}

/** Test hook. */
export function clearPendingSignIn(): void {
  signIn.pending = null;
}

export interface HubRequestHost {
  /** The `Host` request header. */
  host: string | null;
  /** `X-Forwarded-Host`, believed only from a trusted proxy. */
  forwardedHost: string | null;
  /** The request's TCP peer is one of HS_TRUSTED_PROXIES (`x-hs-via-trusted-proxy`). */
  viaTrustedProxy: boolean;
}

/**
 * The hub address to send people back to: the origin the editor reports
 * (`window.location.origin`), accepted only when it names the host this
 * request actually reached. Behind a reverse proxy listed in
 * HS_TRUSTED_PROXIES, the proxy's `X-Forwarded-Host` counts too. Null means
 * the link carries no address and the sign-in ends on the copy-a-code page.
 */
export function confirmHubAddress(origin: string | null, request: HubRequestHost): string | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // An origin and nothing else: no path, query or user name riding along.
  if (url.origin !== origin.toLowerCase()) return null;

  // Parsed with the origin's scheme so a default port written out in a
  // header (`hub.local:80`) compares equal to the origin that omits it.
  const hostOf = (raw: string | null): string | null => {
    if (!raw) return null;
    try {
      return new URL(`${url.protocol}//${raw.split(',')[0].trim()}`).host;
    } catch {
      return null;
    }
  };
  const candidates = [hostOf(request.host), hostOf(trustedForwardedHost(request))];
  return candidates.includes(url.host) ? url.origin : null;
}

// ── The link and the code ─────────────────────────────────────────────

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Static helper page (in website/) where Google sends every web sign-in.
 * Registered on Home Screens' own web client, and by every household on its
 * own.
 */
export const REDIRECT_URI = 'https://homescreens.dev/connect/google';

/** Shown when a code comes back after its sign-in was replaced, used or timed out. */
export const SIGN_IN_EXPIRED_MESSAGE =
  'That sign-in has expired. Each one works once, within 10 minutes. Sign in with Google again.';

export interface WebSignInLink {
  /** The Google sign-in URL the editor opens in a new tab. */
  url: string;
  /**
   * The link carries this hub's address, so homescreens.dev can send the
   * code straight back here (when the address is on a home network).
   */
  returnsToHub: boolean;
}

/**
 * The Google sign-in link. `hubAddress` is this hub's confirmed origin
 * (`confirmHubAddress`); it and PKCE ride along only with Home Screens' own
 * Google app switched on, so with the switch off the link is exactly what it
 * always was.
 */
export async function webSignInLink(opts: {
  store: GoogleTokenStore;
  kind: GoogleClientKind;
  scopes: readonly string[];
  hubAddress: string | null;
  purpose: WebSignInPurpose;
}): Promise<WebSignInLink> {
  const { clientId } = await opts.store.getClient(opts.kind);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: opts.scopes.join(' '),
    access_type: 'offline',
    // Without prompt=consent Google omits the refresh token on re-auth,
    // which would silently break the grant an hour later.
    prompt: 'consent',
  });
  if (!opts.store.hostedAvailable()) return { url: `${AUTH_URL}?${params}`, returnsToHub: false };

  const { state, codeChallenge } = beginSignIn(opts.hubAddress, opts.purpose);
  params.set('state', state);
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
  return { url: `${AUTH_URL}?${params}`, returnsToHub: opts.hubAddress !== null };
}

/** Accepts either the bare code or the full pasted redirect URL. */
export function extractAuthCode(pasted: string): string | null {
  const trimmed = pasted.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get('code');
  } catch {
    // Not a URL: treat as a bare code (Google codes are URL-safe).
    return /^[\w\-/.]+$/.test(trimmed) ? trimmed : null;
  }
}

export type WebSignInResult =
  /** `scope` is what Google actually granted, which may be less than was asked. */
  | { ok: true; scope?: string }
  /** `expired`: the sign-in this code belongs to is gone; the fix is signing in again. */
  | { ok: false; error: string; expired?: true };

/**
 * Redeem a sign-in code into `store`'s grant. `state` is set when the code
 * came back through the hub's return page, and never for a pasted code.
 */
export async function redeemWebSignIn(opts: {
  store: GoogleTokenStore;
  kind: GoogleClientKind;
  pasted: string;
  state?: string;
  purpose: WebSignInPurpose;
}): Promise<WebSignInResult> {
  const { store, kind, state, purpose } = opts;
  const code = extractAuthCode(opts.pasted);
  if (!code) return { ok: false, error: 'That code does not look right. Paste the code (or the whole link) from the sign-in page.' };

  const grant: Record<string, string> = { code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI };
  const pkce = store.hostedAvailable();
  if (pkce) {
    const pending = takeSignIn(state, purpose);
    if (!pending) return { ok: false, error: SIGN_IN_EXPIRED_MESSAGE, expired: true };
    grant.code_verifier = pending.verifier;
  } else if (state !== undefined) {
    // Only a link made with the switch on comes back through the return
    // page; with it off there is nothing to check the code against.
    return { ok: false, error: SIGN_IN_EXPIRED_MESSAGE, expired: true };
  }

  let result: Awaited<ReturnType<typeof store.requestToken>>;
  try {
    // The authorization code is single-use: a retry after a timeout or 5xx
    // would replay a code Google may already have redeemed, turning a
    // transient blip into an invalid_grant that forces a full re-approval.
    result = await store.requestToken(grant, { retries: 0, kind });
  } catch (err) {
    if (err instanceof SignInHelperUnreachableError) return { ok: false, error: err.message };
    throw err;
  }
  const { ok, client } = result;
  const data = result.data as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!ok || !data.access_token) {
    // With PKCE, a code Google no longer accepts (used, too old, or from a
    // sign-in this hub replaced) is an expired sign-in, not a fault.
    if (pkce && data.error === 'invalid_grant') return { ok: false, error: SIGN_IN_EXPIRED_MESSAGE, expired: true };
    return { ok: false, error: data.error_description || data.error || 'Sign-in failed. Please try again.' };
  }
  await store.saveGrant({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type,
    scope: data.scope,
  }, client);
  return data.scope ? { ok: true, scope: data.scope } : { ok: true };
}
