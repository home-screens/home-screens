import crypto from 'crypto';
import { trustedForwardedHost } from './client-ip';

/**
 * Sending people straight back to the hub after a Google Photos sign-in.
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

interface PendingSignIn {
  nonce: string;
  verifier: string;
  expiresAt: number;
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
export function beginSignIn(hubAddress: string | null): { state: string; codeChallenge: string } {
  const nonce = randomToken();
  const verifier = randomToken();
  signIn.pending = { nonce, verifier, expiresAt: Date.now() + SIGN_IN_TTL_MS };
  const codeChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = hubAddress ? `${nonce}.${Buffer.from(hubAddress).toString('base64url')}` : nonce;
  return { state, codeChallenge };
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Claim the waiting sign-in's PKCE verifier, once.
 *
 * - With `state` (the code came back through the hub's return page), its
 *   one-time value must match the waiting sign-in's. A mismatch leaves the
 *   waiting sign-in alone, so a stray or forged link cannot cancel it.
 * - Without `state` (a code pasted into the editor), the waiting sign-in is
 *   the one the code belongs to.
 *
 * Null when nothing is waiting, it expired, or the value does not match.
 */
export function takeSignIn(state?: string): { verifier: string } | null {
  const pending = signIn.pending;
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    signIn.pending = null;
    return null;
  }
  if (state !== undefined && !sameToken(state.split('.')[0], pending.nonce)) return null;
  signIn.pending = null;
  return { verifier: pending.verifier };
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
