/**
 * Route-level tests for `/api/unsplash` (GET search + POST download).
 *
 * Mocks `getUnsplashAccessKey` (the credential gate) and, via a partial
 * `api-utils` mock, `fetchWithTimeout` (the upstream call). The missing-key
 * branch is the key surface — it returns 400 and makes NO upstream call. Also
 * covers the search-success mapping, the upstream-error 502, and the POST
 * missing-imageUrl guard. Auth stubbed at `requireSession`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/unsplash', async () => {
  const actual = await vi.importActual<typeof import('@/lib/unsplash')>('@/lib/unsplash');
  return { ...actual, getUnsplashAccessKey: vi.fn(), trackDownload: vi.fn() };
});

const { fetchWithTimeoutMock } = vi.hoisted(() => ({ fetchWithTimeoutMock: vi.fn() }));
vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, fetchWithTimeout: fetchWithTimeoutMock };
});

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { getUnsplashAccessKey } from '@/lib/unsplash';

const mockKey = vi.mocked(getUnsplashAccessKey);

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/unsplash${query}`, { method: 'GET' });
}
function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/unsplash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/unsplash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 and makes no upstream call when the key is not configured', async () => {
    mockKey.mockResolvedValue(null);
    const res = await GET(getRequest('?query=beach'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/API key not configured/);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('maps Unsplash search results', async () => {
    mockKey.mockResolvedValue('access-key');
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'p1',
            description: 'A beach',
            urls: { thumb: 't', small: 's', regular: 'r', full: 'f', raw: 'raw' },
            user: { name: 'Ansel', links: { html: 'https://u' } },
            links: { download_location: 'https://dl' },
          },
        ],
        total_pages: 3,
        total: 42,
      }),
    } as unknown as Response);
    const res = await GET(getRequest('?query=beach'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalPages).toBe(3);
    expect(body.photos[0]).toMatchObject({ id: 'p1', authorName: 'Ansel', thumb: 't' });
  });

  it('returns 502 when Unsplash responds with an error', async () => {
    mockKey.mockResolvedValue('access-key');
    fetchWithTimeoutMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream boom',
    } as unknown as Response);
    const res = await GET(getRequest('?query=beach'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Failed to search Unsplash/);
  });
});

describe('POST /api/unsplash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a download request with no imageUrl', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing imageUrl/);
  });
});
