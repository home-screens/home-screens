import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/logger', () => ({
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/nasa', () => ({
  NASA_APOD_API: 'https://api.nasa.gov/planetary/apod',
  NASA_IMAGE_API: 'https://images-api.nasa.gov',
  getNasaApiKey: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout } from '@/lib/api-utils';
import { GET } from '@/app/api/nasa/route';

const mockGetKey = vi.mocked(getNasaApiKey);
const mockFetch = vi.mocked(fetchWithTimeout);

function nasaReq(query = '') {
  return new NextRequest(`http://localhost/api/nasa${query}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/nasa — image library search (default)', () => {
  it('normalizes search results and paginates', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        collection: {
          items: [
            {
              data: [{ nasa_id: 'PIA1', title: 'Nebula', description: 'A cloud', date_created: '2020-01-01' }],
              links: [{ href: 'https://images-assets.nasa.gov/PIA1/thumb.jpg' }],
            },
          ],
          metadata: { total_hits: 30 },
        },
      }),
    );

    const res = await GET(nasaReq('?query=nebula'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.photos).toEqual([
      {
        id: 'PIA1',
        title: 'Nebula',
        description: 'A cloud',
        date: '2020-01-01',
        thumb: 'https://images-assets.nasa.gov/PIA1/thumb.jpg',
        nasaId: 'PIA1',
      },
    ]);
    expect(json.total).toBe(30);
    expect(json.totalPages).toBe(Math.ceil(30 / 12));
    expect(mockFetch).toHaveBeenCalledWith(
      'https://images-api.nasa.gov/search?q=nebula&media_type=image&page=1&page_size=12',
    );
  });

  it('URL-encodes the query and forwards the page param', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ collection: { items: [] } }));

    await GET(nasaReq('?query=star%20wars&page=3'));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://images-api.nasa.gov/search?q=star%20wars&media_type=image&page=3&page_size=12',
    );
  });

  it('drops items that have no image links', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        collection: {
          items: [
            { data: [{ nasa_id: 'A', title: 'has-links' }], links: [{ href: 'https://x/a.jpg' }] },
            { data: [{ nasa_id: 'B', title: 'no-links' }] },
          ],
        },
      }),
    );

    const res = await GET(nasaReq('?query=x'));
    const json = await res.json();

    expect(json.photos.map((p: { id: string }) => p.id)).toEqual(['A']);
  });

  it('returns 502 when the image library responds non-ok', async () => {
    mockFetch.mockResolvedValue(new Response('upstream boom', { status: 500 }));

    const res = await GET(nasaReq('?query=x'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to search NASA Image Library' });
  });
});

describe('GET /api/nasa — APOD', () => {
  it('returns 400 when the NASA API key is not configured', async () => {
    mockGetKey.mockResolvedValue(null);

    const res = await GET(nasaReq('?type=apod'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/API key not configured/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('filters out non-image media and maps the photo shape (hdurl fallback)', async () => {
    mockGetKey.mockResolvedValue('KEY123');
    mockFetch.mockResolvedValue(
      jsonResponse([
        {
          media_type: 'image',
          date: '2024-05-01',
          title: 'Galaxy',
          explanation: 'Big',
          url: 'https://apod/img.jpg',
          hdurl: 'https://apod/hd.jpg',
        },
        {
          media_type: 'image',
          date: '2024-05-02',
          title: 'NoHd',
          explanation: 'Small',
          url: 'https://apod/only.jpg',
          // no hdurl -> falls back to url
        },
        { media_type: 'video', date: '2024-05-03', title: 'Clip', url: 'https://apod/vid' },
      ]),
    );

    const res = await GET(nasaReq('?type=apod&count=3'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.photos).toEqual([
      {
        id: '2024-05-01',
        title: 'Galaxy',
        description: 'Big',
        date: '2024-05-01',
        url: 'https://apod/img.jpg',
        hdurl: 'https://apod/hd.jpg',
        thumb: 'https://apod/img.jpg',
      },
      {
        id: '2024-05-02',
        title: 'NoHd',
        description: 'Small',
        date: '2024-05-02',
        url: 'https://apod/only.jpg',
        hdurl: 'https://apod/only.jpg',
        thumb: 'https://apod/only.jpg',
      },
    ]);
    // Key travels in the upstream URL...
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('api_key=KEY123'));
  });

  it('returns 502 without leaking the API key when APOD responds non-ok', async () => {
    mockGetKey.mockResolvedValue('SUPERSECRETKEY');
    mockFetch.mockResolvedValue(new Response('quota exceeded for SUPERSECRETKEY', { status: 429 }));

    const res = await GET(nasaReq('?type=apod'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch NASA Astronomy Picture of the Day' });
    // ...but never in the client-facing error body.
    expect(JSON.stringify(json)).not.toContain('SUPERSECRETKEY');
  });
});
