import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const mockCache = {
  get: vi.fn(() => null) as ReturnType<typeof vi.fn>,
  set: vi.fn(),
};

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    errorResponse: vi.fn((_err: unknown, msg: string, status = 500) => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ error: msg }, { status });
    }),
    createTTLCache: vi.fn(() => mockCache),
    fetchWithTimeout: vi.fn((...args: unknown[]) => (globalThis.fetch as (...a: unknown[]) => unknown)(...args)),
  };
});

// The address check resolves the host's name; no test asks real DNS.
vi.mock('@/lib/url-safety', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/url-safety')>();
  return { ...actual, isSafeExternalUrl: vi.fn(async () => true) };
});

const { GET } = await import('@/app/api/image-proxy/route');

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(url?: string): NextRequest {
  const base = 'http://localhost/api/image-proxy';
  if (url) {
    return new NextRequest(`${base}?url=${encodeURIComponent(url)}`);
  }
  return new NextRequest(base);
}

function mockFetchImage(data: ArrayBuffer, contentType: string | null, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: async () => data,
    headers: new Headers(contentType ? { 'Content-Type': contentType } : {}),
  });
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockCache.get.mockReturnValue(null);
  mockCache.set.mockClear();
});

describe('GET /api/image-proxy', () => {
  it('returns 400 when url param is missing', async () => {
    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Missing url');
  });

  it('returns 400 for an invalid URL that cannot be parsed', async () => {
    const req = makeRequest('not-a-valid-url');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid url');
  });

  it('returns 403 for a non-whitelisted host (evil.com)', async () => {
    const req = makeRequest('https://evil.com/image.png');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Host not allowed');
  });

  it('returns 403 for another non-whitelisted host (google.com)', async () => {
    const req = makeRequest('https://google.com/logo.png');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Host not allowed');
  });

  it('allows requests to whitelisted host a.espncdn.com', async () => {
    const imageData = new ArrayBuffer(8);
    mockFetchImage(imageData, 'image/jpeg');

    const req = makeRequest('https://a.espncdn.com/team/logo.png');
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it('returns 502 when upstream fetch returns non-ok status', async () => {
    const imageData = new ArrayBuffer(0);
    mockFetchImage(imageData, null, false);

    const req = makeRequest('https://a.espncdn.com/team/logo.png');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBe('Upstream fetch failed');
  });

  it('returns image data with correct Content-Type on success', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const imageData = bytes.buffer;
    mockFetchImage(imageData, 'image/jpeg');

    const req = makeRequest('https://a.espncdn.com/photo.jpg');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');

    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)).toEqual(bytes);
  });

  it('sets Cache-Control header to immutable with long max-age', async () => {
    const imageData = new ArrayBuffer(4);
    mockFetchImage(imageData, 'image/png');

    const req = makeRequest('https://a.espncdn.com/logo.png');
    const res = await GET(req);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800, immutable');
  });

  it('defaults Content-Type to image/png when upstream does not provide one', async () => {
    const imageData = new ArrayBuffer(4);
    mockFetchImage(imageData, null);

    const req = makeRequest('https://a.espncdn.com/logo.png');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
  });

  it('caches fetched images and serves from cache on second request', async () => {
    const imageData = new ArrayBuffer(4);
    mockFetchImage(imageData, 'image/webp');

    const targetUrl = 'https://a.espncdn.com/cached.png';

    // First request - cache miss
    const req1 = makeRequest(targetUrl);
    await GET(req1);
    expect(mockCache.set).toHaveBeenCalledWith(targetUrl, {
      data: imageData,
      contentType: 'image/webp',
    });

    // Simulate cache hit
    mockCache.get.mockReturnValue({ data: imageData, contentType: 'image/webp' });
    const req2 = makeRequest(targetUrl);
    const res2 = await GET(req2);

    expect(res2.status).toBe(200);
    expect(res2.headers.get('Content-Type')).toBe('image/webp');
    // fetch should only have been called once (for the first request)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns 500 via errorResponse when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const req = makeRequest('https://a.espncdn.com/logo.png');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to proxy image');
  });
});

describe('GET /api/image-proxy holds the picture host to https, its own redirects and a size', () => {
  /** Answer each URL from a table of real responses; anything else is a test bug. */
  function mockRoutes(routes: Record<string, () => Response>) {
    global.fetch = vi.fn(async (input: unknown) => {
      const route = routes[String(input)];
      if (!route) throw new TypeError(`unexpected fetch: ${String(input)}`);
      return route();
    }) as never;
  }
  const fetched = () => vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
  const png = () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } });
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

  it.each([
    'http://a.espncdn.com/logo.png',
    'ftp://a.espncdn.com/logo.png',
    'https://a.espncdn.com:8443/logo.png',
    'https://someone:secret@a.espncdn.com/logo.png',
  ])('refuses %s without fetching it', async (url) => {
    mockRoutes({});
    const res = await GET(makeRequest(url));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('follows a redirect that stays on the picture host', async () => {
    mockRoutes({
      'https://a.espncdn.com/old.png': () => redirect('/new.png'),
      'https://a.espncdn.com/new.png': png,
    });
    const res = await GET(makeRequest('https://a.espncdn.com/old.png'));
    expect(res.status).toBe(200);
    expect(fetched()).toEqual(['https://a.espncdn.com/old.png', 'https://a.espncdn.com/new.png']);
  });

  it('does not follow a redirect to another host', async () => {
    mockRoutes({
      'https://a.espncdn.com/logo.png': () => redirect('https://evil.example.com/logo.png'),
      'https://evil.example.com/logo.png': png,
    });
    const res = await GET(makeRequest('https://a.espncdn.com/logo.png'));
    expect(res.status).toBe(502);
    expect(fetched()).toEqual(['https://a.espncdn.com/logo.png']);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('does not follow a redirect down to plain http on the same host', async () => {
    mockRoutes({
      'https://a.espncdn.com/logo.png': () => redirect('http://a.espncdn.com/logo.png'),
      'http://a.espncdn.com/logo.png': png,
    });
    const res = await GET(makeRequest('https://a.espncdn.com/logo.png'));
    expect(res.status).toBe(502);
    expect(fetched()).toEqual(['https://a.espncdn.com/logo.png']);
  });

  it('never lets fetch follow redirects by itself', async () => {
    mockRoutes({ 'https://a.espncdn.com/logo.png': png });
    await GET(makeRequest('https://a.espncdn.com/logo.png'));
    expect(vi.mocked(global.fetch).mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a picture over the size cap from its declared length alone', async () => {
    mockRoutes({
      'https://a.espncdn.com/huge.png': () => new Response('x', { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(50 * 1024 * 1024) } }),
    });
    const res = await GET(makeRequest('https://a.espncdn.com/huge.png'));
    expect(res.status).toBe(502);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('stops reading a picture that runs past the size cap without declaring it', async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    mockRoutes({ 'https://a.espncdn.com/endless.png': () => new Response(endless, { status: 200, headers: { 'content-type': 'image/png' } }) });
    const res = await GET(makeRequest('https://a.espncdn.com/endless.png'));
    expect(res.status).toBe(502);
    // It gave up a little past the cap, not after reading for ever.
    expect(sent).toBeLessThan(12);
  });
});
