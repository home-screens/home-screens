/**
 * Route-level tests for `GET /api/system/changelog`.
 *
 * Mocks `fetchGitHubReleases` (the cached-releases fast path) and, via the
 * `api-utils` mock, `fetchWithTimeout` (the direct GitHub fallback). Covers the
 * cached-releases success path, the direct-API fallback when the cache is empty,
 * and the 502 when both the releases and tags endpoints fail. Auth stubbed at
 * `requireSession`; `withAuth` / `fetchWithTimeout` come from a partial mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

const { fetchWithTimeoutMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(),
}));

vi.mock('@/lib/api-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-utils')>('@/lib/api-utils');
  return { ...actual, fetchWithTimeout: fetchWithTimeoutMock };
});

vi.mock('@/lib/version', async () => {
  const actual = await vi.importActual<typeof import('@/lib/version')>('@/lib/version');
  return { ...actual, fetchGitHubReleases: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { fetchGitHubReleases } from '@/lib/version';

const mockFetchReleases = vi.mocked(fetchGitHubReleases);

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/system/changelog', { method: 'GET' });
}

function jsonResponse(ok: boolean, data: unknown) {
  return { ok, json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response;
}

describe('GET /api/system/changelog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps cached GitHub releases', async () => {
    mockFetchReleases.mockResolvedValue([
      {
        tag_name: 'v1.2.0',
        name: 'Release 1.2.0',
        body: 'notes',
        published_at: '2026-01-01T00:00:00Z',
        html_url: 'https://github.com/home-screens/home-screens/releases/tag/v1.2.0',
      },
    ] as never);
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releases[0]).toEqual({
      tag: 'v1.2.0',
      name: 'Release 1.2.0',
      body: 'notes',
      published: '2026-01-01T00:00:00Z',
      url: 'https://github.com/home-screens/home-screens/releases/tag/v1.2.0',
    });
    // Cache hit → no direct fetch fallback.
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  it('falls back to a direct releases fetch when the cache is empty', async () => {
    mockFetchReleases.mockResolvedValue([]);
    fetchWithTimeoutMock.mockResolvedValueOnce(
      jsonResponse(true, [
        { tag_name: 'v2.0.0', name: 'Two', body: '', published_at: '2026-02-01T00:00:00Z', draft: false, prerelease: false },
      ]),
    );
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releases[0].tag).toBe('v2.0.0');
    // No html_url in the payload → the canonical tag page is synthesized.
    expect(body.releases[0].url).toBe('https://github.com/home-screens/home-screens/releases/tag/v2.0.0');
  });

  it('returns 502 when both releases and tags endpoints fail', async () => {
    mockFetchReleases.mockResolvedValue([]);
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse(false, {})) // releases not ok
      .mockResolvedValueOnce(jsonResponse(false, {})); // tags not ok
    const res = await GET(getRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Failed to fetch changelog/);
  });
});
