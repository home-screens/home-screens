import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/nasa', () => ({
  NASA_IMAGE_API: 'https://images-api.nasa.gov',
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

import { fetchWithTimeout } from '@/lib/api-utils';
import { GET } from '@/app/api/nasa/asset/route';

const mockFetch = vi.mocked(fetchWithTimeout);

function assetReq(query = '') {
  return new NextRequest(`http://localhost/api/nasa/asset${query}`);
}

function manifest(hrefs: string[]) {
  return new Response(JSON.stringify({ collection: { items: hrefs.map((href) => ({ href })) } }), {
    status: 200,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/nasa/asset', () => {
  it('returns 400 when nasaId is missing', async () => {
    const res = await GET(assetReq());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'nasaId required' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('picks the ~orig variant over lower-res ones', async () => {
    mockFetch.mockResolvedValue(
      manifest([
        'https://images-assets.nasa.gov/PIA1/PIA1~medium.jpg',
        'https://images-assets.nasa.gov/PIA1/PIA1~orig.jpg',
        'https://images-assets.nasa.gov/PIA1/PIA1~large.jpg',
      ]),
    );

    const res = await GET(assetReq('?nasaId=PIA1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ imageUrl: 'https://images-assets.nasa.gov/PIA1/PIA1~orig.jpg' });
  });

  it('falls back to ~large then ~medium then first when higher variants are absent', async () => {
    mockFetch.mockResolvedValue(
      manifest([
        'https://images-assets.nasa.gov/PIA1/PIA1~medium.jpg',
        'https://images-assets.nasa.gov/PIA1/PIA1~large.png',
      ]),
    );

    const res = await GET(assetReq('?nasaId=PIA1'));
    const json = await res.json();

    expect(json.imageUrl).toBe('https://images-assets.nasa.gov/PIA1/PIA1~large.png');
  });

  it('ignores non-image files like metadata.json', async () => {
    mockFetch.mockResolvedValue(
      manifest([
        'https://images-assets.nasa.gov/PIA1/metadata.json',
        'https://images-assets.nasa.gov/PIA1/PIA1~orig.tiff',
      ]),
    );

    const res = await GET(assetReq('?nasaId=PIA1'));
    const json = await res.json();

    expect(json.imageUrl).toBe('https://images-assets.nasa.gov/PIA1/PIA1~orig.tiff');
  });

  it('returns null imageUrl when the manifest has no images', async () => {
    mockFetch.mockResolvedValue(manifest(['https://images-assets.nasa.gov/PIA1/metadata.json']));

    const res = await GET(assetReq('?nasaId=PIA1'));
    const json = await res.json();

    expect(json).toEqual({ imageUrl: null });
  });

  it('URL-encodes the nasaId so path segments cannot be injected (SSRF)', async () => {
    mockFetch.mockResolvedValue(manifest([]));

    await GET(assetReq('?nasaId=' + encodeURIComponent('../search?q=evil')));

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe(
      'https://images-api.nasa.gov/asset/' + encodeURIComponent('../search?q=evil'),
    );
    // No raw traversal segment survives into the upstream path.
    expect(calledUrl).not.toContain('/asset/../');
  });

  it('returns 502 when the asset lookup responds non-ok', async () => {
    mockFetch.mockResolvedValue(new Response('', { status: 404 }));

    const res = await GET(assetReq('?nasaId=PIA1'));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Asset lookup failed: 404' });
  });
});
