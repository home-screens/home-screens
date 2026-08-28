import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, createTTLCache: () => ({ get: () => null, set: () => {} }) };
});

vi.mock('@/lib/onedrive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/onedrive')>();
  return {
    ...actual,
    fetchThumbnail: vi.fn(),
  };
});

import { GET } from '@/app/api/onedrive/serve/route';
import { fetchThumbnail } from '@/lib/onedrive';

const mockFetchThumbnail = vi.mocked(fetchThumbnail);
import { requireDisplayAuth } from '@/lib/auth';

const mockRequireDisplayAuth = vi.mocked(requireDisplayAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

function serveReq(query: string) {
  return new NextRequest(`http://localhost/api/onedrive/serve${query}`);
}

describe('GET /api/onedrive/serve', () => {
  it('streams bytes with immutable cache headers', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mockFetchThumbnail.mockResolvedValue({ data: bytes.buffer as ArrayBuffer, contentType: 'image/jpeg' });

    const res = await GET(serveReq('?itemId=img-1'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800, immutable');
    expect(mockFetchThumbnail).toHaveBeenCalledWith('img-1', 'preview');
    // Display-polled route: the display tier, never session-only.
    expect(mockRequireDisplayAuth).toHaveBeenCalled();
  });

  it('defaults size to preview and accepts thumbnail', async () => {
    mockFetchThumbnail.mockResolvedValue({ data: new ArrayBuffer(1), contentType: 'image/jpeg' });

    await GET(serveReq('?itemId=img-1&size=thumbnail'));
    expect(mockFetchThumbnail).toHaveBeenLastCalledWith('img-1', 'thumbnail');

    await GET(serveReq('?itemId=img-1&size=bogus'));
    expect(mockFetchThumbnail).toHaveBeenLastCalledWith('img-1', 'preview');
  });

  it('requires and validates itemId', async () => {
    expect((await GET(serveReq(''))).status).toBe(400);
    expect((await GET(serveReq('?itemId=%2E%2E%2Fetc'))).status).toBe(400);
    expect(mockFetchThumbnail).not.toHaveBeenCalled();
  });
});
