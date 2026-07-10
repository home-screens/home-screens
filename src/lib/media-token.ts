import crypto from 'crypto';
import { getMediaTokenSecret } from './auth';

/**
 * Short-lived signed tokens that let a bare `<video src>` fetch a protected
 * media asset. A video element cannot send the display Bearer header and the
 * kiosk browser has no session cookie, so video-serving routes accept a
 * `mt` query token instead — minted here, inside already-authenticated list
 * endpoints, and bound to exactly one resource so a leaked URL cannot be
 * replayed for other assets.
 *
 * Token format: `${exp}.${base64url(hmacSHA256(secret, `${resource}:${exp}`))}`
 * where `exp` is an epoch-milliseconds expiry.
 */

/**
 * Default TTL: long enough to cover a full slideshow refresh cycle
 * (refreshIntervalMs default 10min, prefetch ttl 10min) with margin;
 * tokens are re-minted on every list fetch.
 */
export const DEFAULT_MEDIA_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function hmac(secret: string, resource: string, exp: number): Buffer {
  return crypto.createHmac('sha256', secret).update(`${resource}:${exp}`).digest();
}

export function signMediaToken(
  secret: string,
  resource: string,
  ttlMs: number = DEFAULT_MEDIA_TOKEN_TTL_MS,
): string {
  const exp = Date.now() + ttlMs;
  return `${exp}.${hmac(secret, resource, exp).toString('base64url')}`;
}

export function verifyMediaToken(secret: string, resource: string, token: string): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const actual = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = hmac(secret, resource, exp);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Mint a token for one resource, or null when auth is disabled — matching
 * `requireDisplayAuth`'s early return, no token is needed (or checked) then.
 */
export async function mintMediaToken(
  resource: string,
  ttlMs?: number,
): Promise<string | null> {
  const secret = await getMediaTokenSecret();
  if (!secret) return null;
  return signMediaToken(secret, resource, ttlMs);
}
