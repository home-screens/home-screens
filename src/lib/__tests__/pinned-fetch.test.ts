import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { promises as dns } from 'dns';
import { addressCheckedFetch, __closePinnedFetchForTests } from '@/lib/pinned-fetch';
import { fetchWithAllowedRedirects } from '@/lib/guarded-fetch';
import { followRedirectsWithValidation } from '@/lib/plugin-proxy';
import { isAddressBlockedError, isSafeExternalUrl, isSafeLocalOrExternalUrl } from '@/lib/url-safety';

// The suite's setup swaps the address-checked fetch for the global one so no
// test reaches the network by accident. This file is the one that tests the
// real thing.
vi.unmock('@/lib/pinned-fetch');

vi.mock('@/lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit')>();
  return { ...actual, auditProxyDenied: vi.fn() };
});
import { auditProxyDenied } from '@/lib/audit';

// Real sockets against a server on this machine, and a stand-in for DNS: the
// only way to see which address a fetch actually connects to. Nothing here
// leaves the machine. Every name is under example.com, and the addresses a
// name "resolves" to are scripted per test, in the order they are asked for.

const PUBLIC = '203.0.113.10';
const HOME = '192.168.1.20';
const LOOPBACK = '127.0.0.1';
const METADATA = '169.254.169.254';

let server: http.Server;
let port: number;
/** Paths the server was really asked for. */
let served: string[];
/** Per host, the answers DNS gives, one per question; the last one repeats. */
let answers: Record<string, string[]>;
/** Hosts DNS was asked about, in order. */
let asked: string[];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    served.push(req.url ?? '');
    const redirectTo = new URL(req.url ?? '/', 'http://x').searchParams.get('to');
    if (redirectTo) {
      res.writeHead(302, { location: redirectTo });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('from this machine');
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await __closePinnedFetchForTests();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  served = [];
  asked = [];
  answers = {};
  vi.spyOn(dns, 'lookup').mockImplementation((async (hostname: string) => {
    asked.push(hostname);
    const script = answers[hostname];
    if (!script) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
    const address = script.length > 1 ? script.shift()! : script[0];
    return [{ address, family: 4 }];
  }) as never);
  vi.mocked(auditProxyDenied).mockClear();
});

afterEach(async () => {
  // No kept connection may carry over: the next test's first request has to
  // resolve and connect afresh.
  await __closePinnedFetchForTests();
  vi.restoreAllMocks();
});

const at = (host: string, path = '/') => `http://${host}:${port}${path}`;

describe('addressCheckedFetch', () => {
  it('reaches a home-network name under the home-network rule', async () => {
    answers['nas.example.com'] = [LOOPBACK];
    const res = await addressCheckedFetch('home-network')(at('nas.example.com'));
    expect(await res.text()).toBe('from this machine');
    expect(served).toEqual(['/']);
  });

  it('refuses a name that resolves to this machine under the public rule', async () => {
    answers['sneaky.example.com'] = [LOOPBACK];
    const error = await addressCheckedFetch('public')(at('sneaky.example.com')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(isAddressBlockedError(error)).toBe(true);
    expect(served).toEqual([]);
  });

  it('refuses cloud metadata even under the home-network rule', async () => {
    answers['meta.example.com'] = [METADATA];
    const error = await addressCheckedFetch('home-network')(at('meta.example.com')).catch((e: unknown) => e);
    expect(isAddressBlockedError(error)).toBe(true);
  });

  it('does not call an ordinary failure a blocked address', async () => {
    const error = await addressCheckedFetch('public')(at('nowhere.example.com')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(isAddressBlockedError(error)).toBe(false);
  });

  it('keeps the two rules on separate connections', async () => {
    // A connection opened for a home-network request must not be reused for
    // one held to the public rule.
    answers['both.example.com'] = [LOOPBACK];
    await (await addressCheckedFetch('home-network')(at('both.example.com'))).text();
    const error = await addressCheckedFetch('public')(at('both.example.com')).catch((e: unknown) => e);
    expect(isAddressBlockedError(error)).toBe(true);
    expect(served).toEqual(['/']);
  });
});

describe('a name that answers the check with one address and the connection with another', () => {
  it('passes the public check, then is refused at connect time (strict rule)', async () => {
    answers['rebind.example.com'] = [PUBLIC, LOOPBACK];
    // The check on its own is satisfied: this is the gap.
    expect(await isSafeExternalUrl(at('rebind.example.com'))).toBe(true);
    answers['rebind.example.com'] = [PUBLIC, LOOPBACK];
    asked = [];

    const result = await fetchWithAllowedRedirects(at('rebind.example.com'), { allowHosts: ['rebind.example.com'] });
    expect(result).toMatchObject({ ok: false, reason: 'blocked', url: at('rebind.example.com') });
    // Asked twice, once for the check and once for the connection, and the
    // second answer never got a request out of this machine's server.
    expect(asked).toEqual(['rebind.example.com', 'rebind.example.com']);
    expect(served).toEqual([]);
  });

  it('passes the home-network check, then is refused at connect time (home-network rule)', async () => {
    answers['rebind.example.com'] = [HOME, METADATA];
    expect(await isSafeLocalOrExternalUrl(at('rebind.example.com'))).toBe(true);
    answers['rebind.example.com'] = [HOME, METADATA];

    const result = await fetchWithAllowedRedirects(at('rebind.example.com'), {
      allowHosts: ['rebind.example.com'], allowPrivateNetwork: true,
    });
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(served).toEqual([]);
  });

  it('is refused on a redirect hop too', async () => {
    answers['nas.example.com'] = [LOOPBACK];
    answers['next.example.com'] = [HOME, METADATA];
    const target = at('next.example.com', '/secret');
    const result = await fetchWithAllowedRedirects(at('nas.example.com', `/?to=${encodeURIComponent(target)}`), {
      allowHosts: ['*.example.com'], allowPrivateNetwork: true,
    });
    expect(result).toMatchObject({ ok: false, reason: 'blocked', url: target });
    expect(served).toHaveLength(1);
  });

  it('follows a redirect whose name keeps answering with an allowed address', async () => {
    answers['nas.example.com'] = [LOOPBACK];
    answers['next.example.com'] = [LOOPBACK];
    const target = at('next.example.com', '/page');
    const result = await fetchWithAllowedRedirects(at('nas.example.com', `/?to=${encodeURIComponent(target)}`), {
      allowHosts: ['*.example.com'], allowPrivateNetwork: true,
    });
    expect(result).toMatchObject({ ok: true, url: target, status: 200 });
    expect(served).toHaveLength(2);
  });

  it('holds a caller with its own check to public addresses for a public-looking name', async () => {
    // The caller's check said yes (it saw the first answer); the connection
    // gets the second.
    answers['tarballs.example.com'] = [LOOPBACK];
    const result = await fetchWithAllowedRedirects(at('tarballs.example.com'), {
      allowHosts: ['*'], isSafe: async () => true,
    });
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(served).toEqual([]);
  });

  it('lets a caller with its own check reach the local address it accepted by name', async () => {
    const result = await fetchWithAllowedRedirects(at(LOOPBACK), { allowHosts: ['*'], isSafe: async () => true });
    expect(result).toMatchObject({ ok: true, status: 200 });
  });

  const proxied = (url: string, allowLan: boolean) => followRedirectsWithValidation({
    pluginId: 'weather-station', url, method: 'GET', payload: undefined, headers: {},
    allowedDomains: ['*.example.com'], allowLan,
    safeCheck: allowLan ? isSafeLocalOrExternalUrl : isSafeExternalUrl,
  });

  it('is refused by the plugin proxy on the first request (strict rule)', async () => {
    answers['rebind.example.com'] = [LOOPBACK];
    const followed = await proxied(at('rebind.example.com'), false);
    expect(followed.ok).toBe(false);
    if (!followed.ok) expect(followed.error.status).toBe(403);
    expect(auditProxyDenied).toHaveBeenCalledWith('weather-station', at('rebind.example.com'), 'ssrf_blocked');
    expect(served).toEqual([]);
  });

  it('is refused by the plugin proxy on a redirect (home-network rule)', async () => {
    answers['nas.example.com'] = [LOOPBACK];
    answers['next.example.com'] = [HOME, METADATA];
    const target = at('next.example.com', '/latest/meta-data');
    const followed = await proxied(at('nas.example.com', `/?to=${encodeURIComponent(target)}`), true);
    expect(followed.ok).toBe(false);
    if (!followed.ok) expect(followed.error.status).toBe(403);
    expect(auditProxyDenied).toHaveBeenCalledWith('weather-station', target, 'redirect_ssrf_blocked');
    expect(served).toHaveLength(1);
  });

  it('lets the plugin proxy through to a home-network service that stays put', async () => {
    answers['nas.example.com'] = [LOOPBACK];
    const followed = await proxied(at('nas.example.com'), true);
    expect(followed.ok).toBe(true);
    if (followed.ok) expect(await followed.response.text()).toBe('from this machine');
  });
});
