import crypto from 'crypto';

/**
 * A JSON payload with an HMAC-SHA256 signature, as `<payload>.<signature>`,
 * both base64url. The session cookie and the plugin sign-in `state` are this
 * same thing with different payloads; each caller keeps its own checks on
 * what the payload says (expiry, epoch, shape).
 */
export function signPayload(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${signature.toString('base64url')}`;
}

/**
 * The payload of a token made by `signPayload` with the same secret, or null
 * for anything else: the wrong shape, a signature that does not match, or a
 * payload that is not JSON. Says nothing about whether the payload is still
 * good; the caller checks that.
 */
export function verifySignedPayload(token: string, secret: string): unknown | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  if (!safeEqual(Buffer.from(signature, 'base64url'), expected)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch {
    return null;
  }
}

/**
 * Equal, in time that does not depend on where the two differ. Values of
 * different lengths are simply not equal: `timingSafeEqual` throws on those,
 * and the length of a token or a signature is not a secret.
 */
export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const left = typeof a === 'string' ? Buffer.from(a) : a;
  const right = typeof b === 'string' ? Buffer.from(b) : b;
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
