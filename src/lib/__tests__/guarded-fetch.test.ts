import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { promises as dns } from 'dns';
import { fetchWithAllowedRedirects, readBoundedBody } from '@/lib/guarded-fetch';

// Hosts the tests pretend exist, and what they resolve to. Every address is
// from a documentation range except the two that are meant to be refused.
const ADDRESSES: Record<string, string> = {
  'sheets.example.com': '203.0.113.10',
  'eu.downloads.example.com': '203.0.113.11',
  'login.example.com': '203.0.113.12',
  // Looks public, answers with loopback: the DNS-rebinding case.
  'internal.example.com': '127.0.0.1',
  '192.168.1.50': '192.168.1.50',
};

const ALLOW = ['sheets.example.com', '*.downloads.example.com'];

type FetchMock = Mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>;

let fetchMock: FetchMock;
let routes: Record<string, () => Response>;

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function csv(text: string, init: ResponseInit = {}): Response {
  return new Response(text, {
    status: 200,
    headers: { 'content-type': 'text/csv; charset=utf-8' },
    ...init,
  });
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** URLs the mocked fetch was actually asked for, in order. */
function fetched(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  routes = {};
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new TypeError(`unexpected fetch: ${url}`);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(dns, 'lookup').mockImplementation((async (hostname: string) => {
    const address = ADDRESSES[hostname] ?? '203.0.113.99';
    return [{ address, family: 4 }];
  }) as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchWithAllowedRedirects', () => {
  it('reads a URL with no redirects', async () => {
    routes['https://sheets.example.com/export'] = () => csv('a,b\n1,2');
    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(decode(result.body)).toBe('a,b\n1,2');
    expect(result.url).toBe('https://sheets.example.com/export');
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/csv; charset=utf-8');
  });

  it('follows a redirect chain that stays inside the allowlist', async () => {
    routes['https://sheets.example.com/export?gid=0'] = () =>
      redirect('https://eu.downloads.example.com/blob/1', 307);
    routes['https://eu.downloads.example.com/blob/1'] = () => csv('Stunde,Montag');

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export?gid=0', {
      allowHosts: ALLOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(decode(result.body)).toBe('Stunde,Montag');
    // The final URL is the one that answered, not the one that was asked for.
    expect(result.url).toBe('https://eu.downloads.example.com/blob/1');
    expect(fetched()).toEqual([
      'https://sheets.example.com/export?gid=0',
      'https://eu.downloads.example.com/blob/1',
    ]);
  });

  it('resolves a relative Location header against the current URL', async () => {
    routes['https://sheets.example.com/export/start'] = () => redirect('../download?id=2');
    routes['https://sheets.example.com/download?id=2'] = () => csv('ok');

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export/start', {
      allowHosts: ALLOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toBe('https://sheets.example.com/download?id=2');
  });

  it('refuses a redirect that leaves the allowlist, without fetching it', async () => {
    routes['https://sheets.example.com/export'] = () =>
      redirect('https://login.example.com/signin');
    routes['https://login.example.com/signin'] = () => csv('should never be read');

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not-allowed',
      url: 'https://login.example.com/signin',
    });
    expect(fetched()).toEqual(['https://sheets.example.com/export']);
  });

  it('refuses a first URL that is outside the allowlist', async () => {
    const result = await fetchWithAllowedRedirects('https://login.example.com/signin', {
      allowHosts: ALLOW,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'not-allowed',
      url: 'https://login.example.com/signin',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a link that is not a web address', async () => {
    const bad = await fetchWithAllowedRedirects('not a url', { allowHosts: ['*'] });
    expect(bad).toEqual({ ok: false, reason: 'invalid-url', url: 'not a url' });
    // A parseable non-http scheme gets as far as the safety check.
    const scheme = await fetchWithAllowedRedirects('file:///etc/passwd', { allowHosts: ['*'] });
    expect(scheme.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Private and loopback targets ─────────────────────────────────────

  it('refuses a redirect to a literal private or metadata address', async () => {
    // `*` allows any host that is not an address we refuse outright, so the
    // literal-address check is what stops these before any DNS lookup.
    for (const target of [
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/admin',
      'http://127.0.0.1:3000/api/config',
    ]) {
      fetchMock.mockClear();
      routes = {
        'https://sheets.example.com/export': () => redirect(target),
        [target]: () => csv('should never be read'),
      };
      const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
        allowHosts: ['*'],
      });
      expect(result).toEqual({ ok: false, reason: 'not-allowed', url: target });
      expect(fetched()).toEqual(['https://sheets.example.com/export']);
    }
  });

  it('refuses a redirect to a host that resolves to loopback', async () => {
    const target = 'https://internal.example.com/secret';
    routes['https://sheets.example.com/export'] = () => redirect(target);
    routes[target] = () => csv('should never be read');

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ['sheets.example.com', '*.example.com'],
    });

    expect(result).toEqual({ ok: false, reason: 'blocked', url: target });
    expect(fetched()).toEqual(['https://sheets.example.com/export']);
  });

  // ── Caps ─────────────────────────────────────────────────────────────

  it('gives up after maxHops redirects', async () => {
    for (let i = 0; i < 6; i++) {
      routes[`https://sheets.example.com/hop/${i}`] = () => redirect(`/hop/${i + 1}`);
    }
    const result = await fetchWithAllowedRedirects('https://sheets.example.com/hop/0', {
      allowHosts: ALLOW,
      maxHops: 2,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'too-many-redirects',
      url: 'https://sheets.example.com/hop/2',
    });
    // maxHops redirects followed, so maxHops + 1 requests were made.
    expect(fetched()).toHaveLength(3);
  });

  it('stops mid-stream once the body passes maxBytes', async () => {
    let cancelled = false;
    let pulls = 0;
    const chunk = new Uint8Array(100);
    routes['https://sheets.example.com/big'] = () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;
            if (pulls > 10) {
              controller.close();
              return;
            }
            controller.enqueue(chunk);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { status: 200, headers: { 'content-type': 'text/csv' } },
      );

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/big', {
      allowHosts: ALLOW,
      maxBytes: 150,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'too-large',
      url: 'https://sheets.example.com/big',
      status: 200,
      contentType: 'text/csv',
    });
    expect(cancelled).toBe(true);
    // The whole body was never read: the cap stopped it after two chunks.
    expect(pulls).toBeLessThan(10);
  });

  it('refuses an oversized body from its declared length alone', async () => {
    // The body itself is tiny, so the only thing that can refuse this is the
    // declared length being read before anything is consumed.
    routes['https://sheets.example.com/big'] = () =>
      csv('tiny', { headers: { 'content-type': 'text/csv', 'content-length': '9000' } });

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/big', {
      allowHosts: ALLOW,
      maxBytes: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('too-large');
  });

  it('keeps a body that fits the cap exactly', async () => {
    routes['https://sheets.example.com/export'] = () => csv('12345');
    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
      maxBytes: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(decode(result.body)).toBe('12345');
  });

  // ── What the caller needs to explain a failure ───────────────────────

  it('hands back the status and body of an error response', async () => {
    routes['https://sheets.example.com/export'] = () =>
      new Response('<html>Sign in</html>', {
        status: 403,
        headers: { 'content-type': 'TEXT/HTML; charset=UTF-8' },
      });

    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(403);
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(decode(result.body)).toContain('Sign in');
  });

  it('treats a 3xx with no Location as the final response', async () => {
    routes['https://sheets.example.com/export'] = () =>
      new Response('multiple choices', { status: 300 });
    const result = await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(300);
  });

  it('reports a timeout and a dead connection separately', async () => {
    routes['https://sheets.example.com/slow'] = () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    };
    routes['https://sheets.example.com/dead'] = () => {
      throw new TypeError('fetch failed');
    };

    const slow = await fetchWithAllowedRedirects('https://sheets.example.com/slow', {
      allowHosts: ALLOW,
    });
    const dead = await fetchWithAllowedRedirects('https://sheets.example.com/dead', {
      allowHosts: ALLOW,
    });

    expect(slow).toEqual({
      ok: false,
      reason: 'timeout',
      url: 'https://sheets.example.com/slow',
    });
    expect(dead).toEqual({
      ok: false,
      reason: 'unreachable',
      url: 'https://sheets.example.com/dead',
    });
  });

  it('sends the headers it was given', async () => {
    routes['https://sheets.example.com/export'] = () => csv('ok');
    await fetchWithAllowedRedirects('https://sheets.example.com/export', {
      allowHosts: ALLOW,
      headers: { accept: 'text/csv' },
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      redirect: 'manual',
      headers: { accept: 'text/csv' },
    });
  });

  it('reaches a private address only when the caller allows it', async () => {
    routes['http://192.168.1.50/timetable.csv'] = () => csv('home');

    const refused = await fetchWithAllowedRedirects('http://192.168.1.50/timetable.csv', {
      allowHosts: ['*'],
    });
    expect(refused.ok).toBe(false);

    const allowed = await fetchWithAllowedRedirects('http://192.168.1.50/timetable.csv', {
      allowHosts: ['*'],
      allowPrivateNetwork: true,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(decode(allowed.body)).toBe('home');
  });
});


it.each([
  [new TypeError('terminated'), 'unreachable'],
  [new DOMException('timed out', 'TimeoutError'), 'timeout'],
  [new DOMException('aborted', 'AbortError'), 'timeout'],
])('reports a body-read failure as a structured result: %s', async (error, reason) => {
  routes['https://sheets.example.com/export'] = () => new Response(new ReadableStream({
    start(controller) { controller.error(error); },
  }));
  await expect(fetchWithAllowedRedirects('https://sheets.example.com/export', { allowHosts: ALLOW }))
    .resolves.toMatchObject({ ok: false, reason });
});

/** A body that never ends, one chunk per read, counting what was asked of it. */
function endlessBody(chunkBytes: number): { response: Response; pulls: () => number; cancelled: () => boolean } {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(chunkBytes));
    },
    cancel() {
      cancelled = true;
    },
  }, { highWaterMark: 0 });
  return { response: new Response(stream, { status: 200 }), pulls: () => pulls, cancelled: () => cancelled };
}

describe('readBoundedBody', () => {
  it('returns the whole body when it fits', async () => {
    const body = await readBoundedBody(new Response('hello'), 100);
    expect(body && decode(body)).toBe('hello');
  });

  it('stops reading a body with no declared length as soon as it passes the cap', async () => {
    const endless = endlessBody(1024);
    const body = await readBoundedBody(endless.response, 4096);
    expect(body).toBeNull();
    // Five chunks pass 4096 bytes; nothing after that is asked for.
    expect(endless.pulls()).toBeLessThanOrEqual(6);
    expect(endless.cancelled()).toBe(true);
  });

  it('refuses on a declared length past the cap without reading anything', async () => {
    const endless = endlessBody(1024);
    const response = new Response(endless.response.body, { headers: { 'content-length': '999999' } });
    expect(await readBoundedBody(response, 4096)).toBeNull();
    expect(endless.pulls()).toBe(0);
  });
});

describe('fetchWithAllowedRedirects with its own address check', () => {
  it('asks the check about every hop, counting from 0, and stops at the first refusal', async () => {
    routes['http://localhost:5173/p.tar.gz'] = () => redirect('https://sheets.example.com/a');
    routes['https://sheets.example.com/a'] = () => redirect('http://127.0.0.1:8080/admin');
    const asked: Array<[string, number]> = [];

    const result = await fetchWithAllowedRedirects('http://localhost:5173/p.tar.gz', {
      allowHosts: ['*'],
      isSafe: async (url, hop) => {
        asked.push([url, hop]);
        // The typed address may be this machine; nothing after it may.
        return hop === 0 || url.startsWith('https://');
      },
    });

    expect(asked).toEqual([
      ['http://localhost:5173/p.tar.gz', 0],
      ['https://sheets.example.com/a', 1],
      ['http://127.0.0.1:8080/admin', 2],
    ]);
    expect(result).toMatchObject({ ok: false, reason: 'blocked', url: 'http://127.0.0.1:8080/admin' });
    expect(fetched()).toEqual(['http://localhost:5173/p.tar.gz', 'https://sheets.example.com/a']);
  });

  it('still holds every hop to the host list', async () => {
    routes['https://sheets.example.com/a'] = () => redirect('https://elsewhere.example.org/b');
    const result = await fetchWithAllowedRedirects('https://sheets.example.com/a', {
      allowHosts: ALLOW,
      isSafe: async () => true,
    });
    expect(result).toMatchObject({ ok: false, reason: 'not-allowed', url: 'https://elsewhere.example.org/b' });
    expect(fetched()).toEqual(['https://sheets.example.com/a']);
  });
});
