import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { isSafeExternalUrl, isSafeLocalOrExternalUrl } from '@/lib/url-safety';
import type { ScreenConfiguration } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

// Stub the SSRF guards so tests don't depend on real DNS resolution.
// `isSafeExternalUrl` calls `dns.lookup` for every non-literal-IP host,
// which would either flake or fail outright in network-isolated CI
// sandboxes. The stub keeps the same shape (URL parse + protocol check
// + literal loopback / private / metadata block) so the route's behavior
// matches what callers see in production for the cases tested here.
vi.mock('@/lib/url-safety', () => ({
  isSafeExternalUrl: vi.fn(async (url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const blocked = new Set(['localhost', '127.0.0.1', '169.254.169.254', '::1']);
      if (blocked.has(u.hostname)) return false;
      return !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
    } catch {
      return false;
    }
  }),
  isSafeLocalOrExternalUrl: vi.fn(async () => true),
}));

const { GET, cache, MAX_FEEDS_PER_REQUEST } = await import('@/app/api/news/route');

const RSS = (title = 'Example Feed', items = ['One', 'Two']) => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>${title}</title>
${items.map((t, i) => `<item><title>${t}</title><link>https://example.com/${i}</link><guid>${t}-${i}</guid></item>`).join('')}
</channel></rss>`;

function rssResponse(xml = RSS(), init: ResponseInit = {}): Response {
  return new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' }, ...init });
}

function baseConfig(overrides: Partial<ScreenConfiguration['settings']> = {}): ScreenConfiguration {
  return {
    version: 10,
    settings: { locale: 'en-US', ...overrides },
    screens: [],
  } as unknown as ScreenConfiguration;
}

function request(feeds: string[]): NextRequest {
  const qs = feeds.map((f) => `feed=${encodeURIComponent(f)}`).join('&');
  return new NextRequest(`http://localhost/api/news${qs ? `?${qs}` : ''}`);
}

async function call(feeds: string[]) {
  const res = await GET(request(feeds));
  return { res, json: await res.json() };
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => rssResponse());
  global.fetch = fetchMock;
  vi.mocked(readConfig).mockResolvedValue(baseConfig());
});

describe('GET /api/news', () => {
  it('returns an empty list when no feed is requested', async () => {
    const { res, json } = await call([]);
    expect(res.status).toBe(200);
    expect(json).toEqual({ feeds: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and parses one feed', async () => {
    const { res, json } = await call(['https://example.com/rss']);

    expect(res.status).toBe(200);
    expect(json.feeds).toHaveLength(1);
    expect(json.feeds[0]).toMatchObject({
      url: 'https://example.com/rss',
      ok: true,
      title: 'Example Feed',
      format: 'rss',
    });
    expect(json.feeds[0].items.map((i: { title: string }) => i.title)).toEqual(['One', 'Two']);
    expect(typeof json.feeds[0].fetchedAt).toBe('number');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/rss');
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers['user-agent']).toContain('HomeScreens');
    expect(init.headers.accept).toContain('application/rss+xml');
  });

  it('answers a failing feed next to a healthy one instead of failing the request', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('dead') ? new Response('boom', { status: 500 }) : rssResponse(),
    );

    const { res, json } = await call(['https://example.com/rss', 'https://dead.example.com/rss']);

    expect(res.status).toBe(200);
    expect(json.feeds[0]).toMatchObject({ url: 'https://example.com/rss', ok: true });
    expect(json.feeds[1]).toMatchObject({
      url: 'https://dead.example.com/rss',
      ok: false,
      error: 'http-error',
      status: 500,
      items: [],
    });
  });

  it('reports a 404 as http-error with its status', async () => {
    fetchMock.mockImplementation(async () => new Response('gone', { status: 404 }));
    const { json } = await call(['https://example.com/missing']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'http-error', status: 404 });
  });

  it('blocks loopback URLs without fetching', async () => {
    const { res, json } = await call(['http://127.0.0.1/feed']);
    expect(res.status).toBe(200);
    expect(json.feeds[0]).toMatchObject({ url: 'http://127.0.0.1/feed', ok: false, error: 'blocked-url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks non-http schemes and unparseable URLs', async () => {
    const { json } = await call(['ftp://example.com/rss', 'not a url']);
    expect(json.feeds.map((f: { error: string }) => f.error)).toEqual(['blocked-url', 'blocked-url']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers empty-url for a blank feed param', async () => {
    const { json } = await call(['   ']);
    expect(json.feeds).toEqual([expect.objectContaining({ url: '', ok: false, error: 'empty-url', items: [] })]);
  });

  it('dedupes repeated feed params', async () => {
    const { json } = await call(['https://example.com/rss', ' https://example.com/rss ']);
    expect(json.feeds).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('virtual sources', () => {
    it('local without a location answers no-location without fetching', async () => {
      vi.mocked(readConfig).mockResolvedValue(baseConfig({ locationName: '' }));
      const { json } = await call(['local']);
      expect(json.feeds[0]).toMatchObject({ url: 'local', ok: false, error: 'no-location' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('local with a location fetches a Google News search for that place', async () => {
      vi.mocked(readConfig).mockResolvedValue(baseConfig({ locationName: 'Prior Lake, MN', locale: 'en-US' }));
      const { json } = await call(['local']);

      expect(json.feeds[0]).toMatchObject({ url: 'local', ok: true });
      const fetched = String(fetchMock.mock.calls[0][0]);
      expect(fetched).toContain('news.google.com/rss/search');
      expect(fetched).toContain('q=Prior%20Lake%2C%20MN');
      expect(fetched).toContain('ceid=US:en');
    });

    it('local uses the household locale edition', async () => {
      vi.mocked(readConfig).mockResolvedValue(baseConfig({ locationName: 'München', locale: 'de-DE' }));
      await call(['local']);
      const fetched = String(fetchMock.mock.calls[0][0]);
      expect(fetched).toContain('q=M%C3%BCnchen');
      expect(fetched).toContain('hl=de&gl=DE&ceid=DE:de');
    });

    it('topic: fetches a Google News keyword search and keeps the virtual url in the result', async () => {
      const { json } = await call(['topic:school board']);
      expect(json.feeds[0]).toMatchObject({ url: 'topic:school board', ok: true });
      const fetched = String(fetchMock.mock.calls[0][0]);
      expect(fetched).toContain('news.google.com/rss/search');
      expect(fetched).toContain('q=school%20board');
    });

    it('topic: with no keywords is blocked-url', async () => {
      const { json } = await call(['topic:']);
      expect(json.feeds[0]).toMatchObject({ ok: false, error: 'blocked-url' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('youtube: and reddit: resolve to their real feeds', async () => {
      const id = 'UCXuqSBlHAE6Xw-yeJA0Tunw';
      await call([`youtube:${id}`, 'reddit:r/space']);
      const fetched = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(fetched).toContain(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
      expect(fetched).toContain('https://www.reddit.com/r/space/new/.rss');
    });

    it('still serves virtual sources when settings cannot be read', async () => {
      vi.mocked(readConfig).mockRejectedValue(new Error('disk'));
      const { res, json } = await call(['local', 'topic:parks']);
      expect(res.status).toBe(200);
      expect(json.feeds[0]).toMatchObject({ url: 'local', error: 'no-location' });
      expect(json.feeds[1]).toMatchObject({ url: 'topic:parks', ok: true });
    });
  });

  it('answers not-a-feed for an HTML page', async () => {
    fetchMock.mockImplementation(async () =>
      new Response('<!DOCTYPE html><html><body>Sign in</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const { json } = await call(['https://example.com/page']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'not-a-feed', items: [] });
  });

  it('answers not-a-feed for an empty body', async () => {
    fetchMock.mockImplementation(async () => rssResponse(''));
    const { json } = await call(['https://example.com/empty']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'not-a-feed' });
  });

  it('answers not-a-feed for an oversized body without parsing it', async () => {
    fetchMock.mockImplementation(async () =>
      rssResponse(RSS(), { headers: { 'content-type': 'application/rss+xml', 'content-length': String(5 * 1024 * 1024) } }),
    );
    const { json } = await call(['https://example.com/huge']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'not-a-feed' });
  });

  it('decodes a latin-1 body using the response charset', async () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Café</title><item><title>Crème</title></item></channel></rss>';
    const bytes = new Uint8Array(xml.length);
    for (let i = 0; i < xml.length; i++) bytes[i] = xml.charCodeAt(i) & 0xff;
    fetchMock.mockImplementation(async () =>
      new Response(bytes, { status: 200, headers: { 'content-type': 'text/xml; charset=ISO-8859-1' } }),
    );
    const { json } = await call(['https://example.com/latin1']);
    expect(json.feeds[0].title).toBe('Café');
    expect(json.feeds[0].items[0].title).toBe('Crème');
  });

  it('parses Atom and JSON Feed bodies too', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('.json')) {
        return new Response(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'JF', items: [{ id: '1', title: 'J' }] }), {
          status: 200, headers: { 'content-type': 'application/feed+json' },
        });
      }
      return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>AT</title><entry><title>A</title></entry></feed>', {
        status: 200, headers: { 'content-type': 'application/atom+xml' },
      });
    });
    const { json } = await call(['https://example.com/atom', 'https://example.com/feed.json']);
    expect(json.feeds[0]).toMatchObject({ ok: true, format: 'atom', title: 'AT' });
    expect(json.feeds[1]).toMatchObject({ ok: true, format: 'json', title: 'JF' });
  });

  it('serves a cache hit without refetching', async () => {
    const first = await call(['https://example.com/rss']);
    const second = await call(['https://example.com/rss']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.json.feeds[0]).toEqual(first.json.feeds[0]);
  });

  it('caches failures briefly so a dead feed is not hammered', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    await call(['https://example.com/dead']);
    const { json } = await call(['https://example.com/dead']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'http-error', status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one upstream fetch between concurrent requests for the same feed', async () => {
    let resolveFetch!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const a = GET(request(['https://example.com/rss']));
    const b = GET(request(['https://example.com/rss']));
    await new Promise((r) => setTimeout(r, 0));
    resolveFetch(rssResponse());
    const [ja, jb] = await Promise.all([a.then((r) => r.json()), b.then((r) => r.json())]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ja.feeds[0].ok).toBe(true);
    expect(jb.feeds[0].ok).toBe(true);
  });

  it('marks feeds beyond MAX_FEEDS_PER_REQUEST as too-many-feeds', async () => {
    const feeds = Array.from({ length: MAX_FEEDS_PER_REQUEST + 2 }, (_, i) => `https://example.com/feed-${i}`);
    const { json } = await call(feeds);

    expect(json.feeds).toHaveLength(MAX_FEEDS_PER_REQUEST + 2);
    for (let i = 0; i < MAX_FEEDS_PER_REQUEST; i++) {
      expect(json.feeds[i], `feed ${i}`).toMatchObject({ url: feeds[i], ok: true });
    }
    expect(json.feeds[MAX_FEEDS_PER_REQUEST]).toMatchObject({ url: feeds[MAX_FEEDS_PER_REQUEST], ok: false, error: 'too-many-feeds', items: [] });
    expect(json.feeds[MAX_FEEDS_PER_REQUEST + 1]).toMatchObject({ ok: false, error: 'too-many-feeds' });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_FEEDS_PER_REQUEST);
  });

  describe('home-network consent', () => {
    const LAN_FEED = 'http://192.168.1.5/feed';

    it('blocks a private address unless a news module opted it in', async () => {
      const { json } = await call([LAN_FEED]);
      expect(json.feeds[0]).toMatchObject({ url: LAN_FEED, ok: false, error: 'blocked-url' });
      expect(isSafeLocalOrExternalUrl).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a query flag alone is not consent', async () => {
      const res = await GET(new NextRequest(`http://localhost/api/news?feed=${encodeURIComponent(LAN_FEED)}&homeNetwork=true`));
      const json = await res.json();
      expect(json.feeds[0]).toMatchObject({ ok: false, error: 'blocked-url' });
      expect(isSafeLocalOrExternalUrl).not.toHaveBeenCalled();
    });

    it('fetches it through the local-or-external guard when config carries homeNetwork: true for that exact URL', async () => {
      vi.mocked(readConfig).mockResolvedValue({
        ...baseConfig(),
        screens: [{
          id: 's', name: 'S', modules: [{
            id: 'n', type: 'news', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, zIndex: 1,
            config: { feeds: [{ id: 'lan', url: LAN_FEED, homeNetwork: true }] },
          }],
        }],
      } as unknown as ScreenConfiguration);

      const { json } = await call([LAN_FEED]);

      expect(json.feeds[0]).toMatchObject({ url: LAN_FEED, ok: true });
      expect(isSafeLocalOrExternalUrl).toHaveBeenCalledWith(LAN_FEED);
      expect(isSafeExternalUrl).not.toHaveBeenCalled();
      expect(String(fetchMock.mock.calls[0][0])).toBe(LAN_FEED);
    });

    it('honours opt-ins on displays\' own screens and on fullscreen-news modules', async () => {
      vi.mocked(readConfig).mockResolvedValue({
        ...baseConfig(),
        screens: [],
        displays: [{
          id: 'kitchen', name: 'Kitchen', displayWidth: 1080, displayHeight: 1920,
          screens: [{
            id: 's', name: 'S', modules: [{
              id: 'fn', type: 'fullscreen-news', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, zIndex: 1,
              config: { feeds: [{ id: 'lan', url: LAN_FEED, homeNetwork: true }] },
            }],
          }],
        }],
      } as unknown as ScreenConfiguration);

      const { json } = await call([LAN_FEED]);
      expect(json.feeds[0].ok).toBe(true);
      expect(isSafeLocalOrExternalUrl).toHaveBeenCalledWith(LAN_FEED);
    });

    it('does not extend consent to a different private URL in the same module', async () => {
      vi.mocked(readConfig).mockResolvedValue({
        ...baseConfig(),
        screens: [{
          id: 's', name: 'S', modules: [{
            id: 'n', type: 'news', position: { x: 0, y: 0 }, size: { w: 1, h: 1 }, zIndex: 1,
            config: { feeds: [{ id: 'lan', url: 'http://192.168.1.9/other', homeNetwork: true }] },
          }],
        }],
      } as unknown as ScreenConfiguration);

      const { json } = await call([LAN_FEED]);
      expect(json.feeds[0]).toMatchObject({ ok: false, error: 'blocked-url' });
      expect(isSafeLocalOrExternalUrl).not.toHaveBeenCalled();
    });
  });

  it('returns results in request order even when upstreams answer out of order', async () => {
    fetchMock.mockImplementation((url) => new Promise<Response>((resolve) => {
      const delay = String(url).includes('slow') ? 30 : 0;
      setTimeout(() => resolve(rssResponse(RSS(String(url)))), delay);
    }));
    const feeds = ['https://slow.example.com/rss', 'https://fast.example.com/rss', 'https://other.example.com/rss'];
    const { json } = await call(feeds);
    expect(json.feeds.map((f: { url: string }) => f.url)).toEqual(feeds);
    expect(json.feeds.map((f: { title: string }) => f.title)).toEqual(feeds);
  });

  it('answers timeout when the upstream times out', async () => {
    fetchMock.mockImplementation(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const { res, json } = await call(['https://slow.example.com/rss']);
    expect(res.status).toBe(200);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'timeout', items: [] });
  });

  it('answers unreachable for a network failure', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('ECONNREFUSED');
    });
    const { json } = await call(['https://down.example.com/rss']);
    expect(json.feeds[0]).toMatchObject({ ok: false, error: 'unreachable' });
  });

  it('caps items per feed at 50', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `Story ${i}`);
    fetchMock.mockImplementation(async () => rssResponse(RSS('Big', many)));
    const { json } = await call(['https://example.com/big']);
    expect(json.feeds[0].items).toHaveLength(50);
  });
});
