
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/unsplash', async () => {
  const actual = await vi.importActual<typeof import('@/lib/unsplash')>('@/lib/unsplash');
  return { ...actual, getUnsplashAccessKey: vi.fn() };
});

const { fetchWithTimeoutMock } = vi.hoisted(() => ({ fetchWithTimeoutMock: vi.fn() }));
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, fetchWithTimeout: fetchWithTimeoutMock };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getUnsplashAccessKey } from '@/lib/unsplash';

const mockKey = vi.mocked(getUnsplashAccessKey);

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/unsplash/collections/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 and makes no upstream call when the key is not configured', async () => {
    mockKey.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/unsplash/collections/abc123'), ctx('abc123'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/API key not configured/);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('maps a successful collection lookup', async () => {
    mockKey.mockResolvedValue('access-key');
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: 'October',
        total_photos: 42,
        cover_photo: { urls: { small: 'https://images.unsplash.com/cover.jpg' } },
      }),
    });
    const res = await GET(new NextRequest('http://localhost/api/unsplash/collections/I6rVqHIQXO0'), ctx('I6rVqHIQXO0'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'I6rVqHIQXO0',
      title: 'October',
      totalPhotos: 42,
      coverPhotoUrl: 'https://images.unsplash.com/cover.jpg',
    });
  });

  it('propagates a 404 from Unsplash without leaking the upstream body', async () => {
    mockKey.mockResolvedValue('access-key');
    fetchWithTimeoutMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'not found upstream' });
    const res = await GET(new NextRequest('http://localhost/api/unsplash/collections/does-not-exist'), ctx('does-not-exist'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Collection not found' });
  });
});
