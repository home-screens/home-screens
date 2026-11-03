import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CLIENT_IP_HEADER,
  VIA_TRUSTED_PROXY_HEADER,
  isTrustedProxyPeer,
  parseTrustedProxies,
  requestOrigin,
  resolveClientIp,
  trustedForwardedHost,
} from '../client-ip';
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

describe('isTrustedProxyPeer', () => {
  it('trusts only a peer on the list, IPv4-mapped or not', () => {
    expect(isTrustedProxyPeer('127.0.0.1', ['127.0.0.1'])).toBe(true);
    expect(isTrustedProxyPeer('::ffff:127.0.0.1', ['127.0.0.1'])).toBe(true);
    expect(isTrustedProxyPeer('10.0.0.66', ['127.0.0.1'])).toBe(false);
    expect(isTrustedProxyPeer('127.0.0.1', [])).toBe(false);
    expect(isTrustedProxyPeer(undefined, ['127.0.0.1'])).toBe(false);
  });
});

describe('trustedForwardedHost', () => {
  it('answers the outermost forwarded host only behind a trusted proxy', () => {
    expect(trustedForwardedHost({ forwardedHost: 'hub.lan, 127.0.0.1:3000', viaTrustedProxy: true })).toBe('hub.lan');
    expect(trustedForwardedHost({ forwardedHost: 'hub.lan', viaTrustedProxy: false })).toBeNull();
    expect(trustedForwardedHost({ forwardedHost: null, viaTrustedProxy: true })).toBeNull();
    expect(trustedForwardedHost({ forwardedHost: ' , ', viaTrustedProxy: true })).toBeNull();
  });
});

describe('requestOrigin', () => {
  const request = (headers: Record<string, string>, url = 'http://0.0.0.0:3000/api/plugins/auth/start') =>
    new Request(url, { headers });

  it('reads the Host header over the bind address in request.url', () => {
    expect(requestOrigin(request({ host: '192.168.86.175:3000' }))).toBe('http://192.168.86.175:3000');
  });

  it('falls back to the request URL when there is no Host header', () => {
    const req = request({}, 'http://localhost:3000/x');
    req.headers.delete('host');
    expect(requestOrigin(req)).toBe('http://localhost:3000');
  });

  it('honours x-forwarded-host and x-forwarded-proto from a trusted proxy', () => {
    expect(
      requestOrigin(
        request({
          host: '127.0.0.1:3000',
          'x-forwarded-host': 'screens.example.com, 127.0.0.1:3000',
          'x-forwarded-proto': 'https',
          [VIA_TRUSTED_PROXY_HEADER]: '1',
        }),
      ),
    ).toBe('https://screens.example.com');
  });

  it('ignores forwarded headers from anyone who is not a trusted proxy', () => {
    const headers = {
      host: '192.168.86.175:3000',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    };
    expect(requestOrigin(request(headers))).toBe('http://192.168.86.175:3000');
    expect(requestOrigin(request({ ...headers, [VIA_TRUSTED_PROXY_HEADER]: '0' }))).toBe('http://192.168.86.175:3000');
  });

  it('keeps the real scheme when a trusted proxy forwards one that is not http or https', () => {
    expect(
      requestOrigin(request({ host: 'hub.lan', 'x-forwarded-proto': 'javascript', [VIA_TRUSTED_PROXY_HEADER]: '1' })),
    ).toBe('http://hub.lan');
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
    viaProxy: string | string[] | undefined;
  }> {
    installClientIpStamping();
    let seen: {
      stamped: string | string[] | undefined;
      xff: string | string[] | undefined;
      viaProxy: string | string[] | undefined;
    } | null = null;
    const server = http.createServer((req, res) => {
      seen = {
        stamped: req.headers[CLIENT_IP_HEADER],
        xff: req.headers['x-forwarded-for'],
        viaProxy: req.headers[VIA_TRUSTED_PROXY_HEADER],
      };
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

  it('overwrites a client-sent trusted-proxy flag (no proxies are trusted here)', async () => {
    const { viaProxy } = await requestWithHeaders({ [VIA_TRUSTED_PROXY_HEADER]: '1' });
    expect(viaProxy).toBe('0');
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
