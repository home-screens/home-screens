import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { CLIENT_IP_HEADER, parseTrustedProxies, resolveClientIp } from '../client-ip';
import { installClientIpStamping } from '../server-ip-patch';

describe('parseTrustedProxies', () => {
  it('returns empty list for unset/empty env', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies('')).toEqual([]);
    expect(parseTrustedProxies(' , ,')).toEqual([]);
  });

  it('splits, trims, and normalizes IPv4-mapped IPv6 entries', () => {
    expect(parseTrustedProxies(' 127.0.0.1, ::ffff:192.168.1.2 ')).toEqual([
      '127.0.0.1',
      '192.168.1.2',
    ]);
  });
});

describe('resolveClientIp', () => {
  it('returns the TCP peer when no forwarded header is present', () => {
    expect(resolveClientIp('192.168.1.50', undefined, [])).toBe('192.168.1.50');
  });

  it('normalizes an IPv4-mapped IPv6 peer', () => {
    expect(resolveClientIp('::ffff:192.168.1.50', undefined, [])).toBe('192.168.1.50');
  });

  it('ignores a spoofed x-forwarded-for from an untrusted peer', () => {
    // The attack from the audit: LAN caller claims to be an allowlisted IP.
    expect(resolveClientIp('10.0.0.66', '192.168.1.50', [])).toBe('10.0.0.66');
    expect(resolveClientIp('10.0.0.66', '192.168.1.50', ['127.0.0.1'])).toBe('10.0.0.66');
  });

  it('fails closed as unknown when the socket has no peer address', () => {
    expect(resolveClientIp(undefined, '192.168.1.50', [])).toBe('unknown');
  });

  it('honors the forwarded chain when the peer is a trusted proxy', () => {
    expect(resolveClientIp('127.0.0.1', '192.168.1.50', ['127.0.0.1'])).toBe('192.168.1.50');
  });

  it('walks the chain right-to-left past trusted hops to the first untrusted address', () => {
    expect(
      resolveClientIp('127.0.0.1', '1.2.3.4, 192.168.1.50, 10.0.0.2', ['127.0.0.1', '10.0.0.2']),
    ).toBe('192.168.1.50');
  });

  it('falls back to the leftmost entry when every hop is trusted', () => {
    expect(resolveClientIp('127.0.0.1', '10.0.0.2', ['127.0.0.1', '10.0.0.2'])).toBe('10.0.0.2');
  });
});

describe('installClientIpStamping (live http server)', () => {
  const servers: http.Server[] = [];
  afterAll(() => {
    for (const s of servers) s.close();
  });

  async function requestWithHeaders(headers: Record<string, string>): Promise<{
    stamped: string | string[] | undefined;
    xff: string | string[] | undefined;
  }> {
    installClientIpStamping();
    let seen: { stamped: string | string[] | undefined; xff: string | string[] | undefined } | null = null;
    const server = http.createServer((req, res) => {
      seen = { stamped: req.headers[CLIENT_IP_HEADER], xff: req.headers['x-forwarded-for'] };
      res.end('ok');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${port}/`, { headers });
    return seen!;
  }

  it('stamps the real peer address, overwriting spoofed headers', async () => {
    const { stamped } = await requestWithHeaders({
      'x-forwarded-for': '192.168.1.50',
      'x-real-ip': '192.168.1.51',
      [CLIENT_IP_HEADER]: '192.168.1.52', // even a pre-stamped header is overwritten
    });
    expect(stamped).toBe('127.0.0.1');
  });

  it('stamps the peer address when no headers are sent', async () => {
    const { stamped } = await requestWithHeaders({});
    expect(stamped).toBe('127.0.0.1');
  });

  it('is idempotent — installing twice does not double-wrap emit', async () => {
    installClientIpStamping();
    installClientIpStamping();
    const { stamped } = await requestWithHeaders({});
    expect(stamped).toBe('127.0.0.1');
  });
});
