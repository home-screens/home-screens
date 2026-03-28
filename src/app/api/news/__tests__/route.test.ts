import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { parseItems } from '@/lib/rss';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/rss', () => ({
  parseItems: vi.fn(() => [
    { title: 'Test Article', link: 'https://test.com/article', pubDate: '2026-03-08', description: '' },
  ]),
}));

const mockParseItems = vi.mocked(parseItems);

// Lazily import GET so the rss mock is in place before module evaluation
const { GET, cache } = await import('@/app/api/news/route');

beforeEach(() => {
  vi.restoreAllMocks();
  cache.clear();
  // Re-apply the default parseItems return after restoreAllMocks clears it
  mockParseItems.mockReturnValue([
    { title: 'Test Article', link: 'https://test.com/article', pubDate: '2026-03-08', description: '' },
  ]);
});

describe('GET /api/news', () => {
  it('returns parsed items for a valid feed URL', async () => {
    const xml = '<rss><channel><item><title>Test</title></item></channel></rss>';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml });

    const req = new NextRequest('http://localhost/api/news?feed=https://example.com/rss');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      items: [{ title: 'Test Article', link: 'https://test.com/article', pubDate: '2026-03-08', description: '' }],
    });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/rss', expect.anything());
    expect(mockParseItems).toHaveBeenCalledWith(xml);
  });

  it('uses BBC default feed when no feed param is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<rss></rss>' });

    const req = new NextRequest('http://localhost/api/news');
    await GET(req);

    expect(global.fetch).toHaveBeenCalledWith('https://feeds.bbci.co.uk/news/rss.xml', expect.anything());
  });

  it('returns 400 for an invalid URL', async () => {
    const req = new NextRequest('http://localhost/api/news?feed=not-a-url');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid feed URL' });
  });

  it('returns 400 for a non-http protocol (ftp)', async () => {
    const req = new NextRequest('http://localhost/api/news?feed=ftp://example.com/rss');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid feed URL scheme' });
  });

  it('returns 400 for a non-http protocol (file)', async () => {
    const req = new NextRequest('http://localhost/api/news?feed=file:///etc/passwd');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Invalid feed URL scheme' });
  });

  it('returns 502 when upstream fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const req = new NextRequest('http://localhost/api/news?feed=https://example.com/rss');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch RSS feed' });
  });

  it('returns 500 via errorResponse when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const req = new NextRequest('http://localhost/api/news?feed=https://example.com/rss');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({ error: 'Failed to fetch news' });
  });

  it('passes fetched XML text to parseItems', async () => {
    const xml = '<rss><channel><item><title>Hello</title></item></channel></rss>';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => xml });

    const req = new NextRequest('http://localhost/api/news?feed=https://example.com/feed.xml');
    await GET(req);

    expect(mockParseItems).toHaveBeenCalledWith(xml);
  });

  it('returns whatever parseItems produces without modification', async () => {
    const customItems = [
      { title: 'A', link: 'https://a.com', pubDate: 'Mon', description: 'Desc A' },
      { title: 'B', link: 'https://b.com', pubDate: 'Tue', description: 'Desc B' },
    ];
    mockParseItems.mockReturnValue(customItems);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<xml/>' });

    const req = new NextRequest('http://localhost/api/news');
    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({ items: customItems });
  });
});
