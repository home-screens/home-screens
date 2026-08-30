import { describe, it, expect } from 'vitest';
import { isDisallowedCrossOriginWrite, parseAllowedOrigins } from '@/lib/same-origin';

const HUB = 'pi.local:3000';

function check(overrides: Partial<Parameters<typeof isDisallowedCrossOriginWrite>[0]> = {}) {
  return isDisallowedCrossOriginWrite({
    method: 'POST',
    origin: null,
    host: HUB,
    forwardedHost: null,
    allowedOrigins: [],
    ...overrides,
  });
}

describe('isDisallowedCrossOriginWrite', () => {
  it('blocks a write from another origin', () => {
    expect(check({ origin: 'http://evil.example' })).toBe(true);
  });

  it('allows a write from the hub itself', () => {
    expect(check({ origin: `http://${HUB}` })).toBe(false);
  });

  // The whole attack depends on the request being CORS-simple, and a simple
  // request cannot carry a custom header — so a browser can never produce an
  // origin-less one. Absence therefore means curl, reporter.sh, or
  // server-to-server, all of which must keep working.
  it('allows a write with no Origin header at all', () => {
    expect(check({ origin: null })).toBe(false);
  });

  it('only guards state-changing methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(check({ method, origin: 'http://evil.example' })).toBe(false);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(check({ method, origin: 'http://evil.example' })).toBe(true);
    }
  });

  it('is case-insensitive about the method and the host', () => {
    expect(check({ method: 'post', origin: `http://${HUB.toUpperCase()}` })).toBe(false);
  });

  // Sandboxed iframes and some redirect chains send the literal string.
  it('blocks the opaque "null" origin', () => {
    expect(check({ origin: 'null' })).toBe(true);
  });

  it('blocks an unparseable origin', () => {
    expect(check({ origin: '://////' })).toBe(true);
  });

  it('distinguishes a different port on the same hostname', () => {
    expect(check({ origin: 'http://pi.local:9999' })).toBe(true);
  });

  // Scheme is deliberately not compared: a hub reached over both http and
  // https is the same device, and downgrade is not the threat here.
  it('accepts the same host over a different scheme', () => {
    expect(check({ origin: `https://${HUB}` })).toBe(false);
  });

  it('refuses when there is no host to compare against', () => {
    expect(check({ origin: 'http://evil.example', host: null })).toBe(true);
  });

  describe('reverse-proxy deployments', () => {
    it('accepts the forwarded host when a proxy rewrote Host', () => {
      expect(
        check({
          origin: 'https://home.example.com',
          host: 'localhost:3000',
          forwardedHost: 'home.example.com',
        }),
      ).toBe(false);
    });

    it('still blocks a third-party origin behind a proxy', () => {
      expect(
        check({
          origin: 'https://evil.example',
          host: 'localhost:3000',
          forwardedHost: 'home.example.com',
        }),
      ).toBe(true);
    });

    it('accepts an origin named in HS_ALLOWED_ORIGINS', () => {
      const allowedOrigins = parseAllowedOrigins('https://home.example.com');
      expect(check({ origin: 'https://home.example.com', allowedOrigins })).toBe(false);
      expect(check({ origin: 'https://evil.example', allowedOrigins })).toBe(true);
    });
  });
});

describe('parseAllowedOrigins', () => {
  it('returns nothing by default', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('accepts a bare host or a full origin, and normalizes both to a host', () => {
    expect(parseAllowedOrigins('home.example.com, https://other.example:8443')).toEqual([
      'home.example.com',
      'other.example:8443',
    ]);
  });

  it('drops entries it cannot parse', () => {
    expect(parseAllowedOrigins('good.example, :://///, ')).toEqual(['good.example']);
  });
});
