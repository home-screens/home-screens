import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { safeEqual, signPayload, verifySignedPayload } from '../signed-payload';

describe('signPayload / verifySignedPayload', () => {
  it('round-trips a payload with the secret that signed it', () => {
    const token = signPayload({ p: 'weather', iat: 5 }, 'secret');
    expect(verifySignedPayload(token, 'secret')).toEqual({ p: 'weather', iat: 5 });
  });

  it('is the wire format sessions have always had: base64url JSON, a dot, base64url HMAC-SHA256', () => {
    const body = Buffer.from(JSON.stringify({ iat: 1, exp: 2 })).toString('base64url');
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('base64url');
    expect(signPayload({ iat: 1, exp: 2 }, 'secret')).toBe(`${body}.${signature}`);
  });

  it('refuses another secret, a changed payload and a changed signature', () => {
    const token = signPayload({ admin: false }, 'secret');
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ admin: true })).toString('base64url');
    expect(verifySignedPayload(token, 'other')).toBeNull();
    expect(verifySignedPayload(`${forged}.${signature}`, 'secret')).toBeNull();
    expect(verifySignedPayload(`${body}.${signature.slice(0, -2)}AA`, 'secret')).toBeNull();
  });

  it.each(['', 'nodot', 'a.b.c', '.', 'x.', '.x'])('refuses the malformed token %j without throwing', (token) => {
    expect(verifySignedPayload(token, 'secret')).toBeNull();
  });

  it('refuses a correctly signed body that is not JSON', () => {
    const body = Buffer.from('not json').toString('base64url');
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('base64url');
    expect(verifySignedPayload(`${body}.${signature}`, 'secret')).toBeNull();
  });
});

describe('safeEqual', () => {
  it('compares text and bytes', () => {
    expect(safeEqual('token', 'token')).toBe(true);
    expect(safeEqual('token', 'tokeN')).toBe(false);
    expect(safeEqual(Buffer.from([1, 2]), Buffer.from([1, 2]))).toBe(true);
  });

  it('answers false for different lengths, where timingSafeEqual would throw', () => {
    expect(safeEqual('short', 'much longer')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
