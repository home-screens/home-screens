/**
 * Route-level tests for `GET /api/system/changelog`.
 *
 * Mocks `getChannelReleases` (the channel-scoped, cached release feed) and,
 * via the `api-utils` mock, `fetchWithTimeout` (the bare-tags fallback).
 * Covers the release-feed success path with channel plumbing, the tags
 * fallback when the feed is empty, and the 502 when the tags call fails too. Auth stubbed at
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
  return { ...actual, getChannelReleases: vi.fn() };
});

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getChannelReleases } from '@/lib/version';

const mockFetchReleases = vi.mocked(getChannelReleases);

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/system/changelog${query}`, { method: 'GET' });
}

function jsonResponse(ok: boolean, data: unknown) {
  return { ok, json: async () => data, text: async () => JSON.stringify(data) } as unknown as Response;
}

describe('GET /api/system/changelog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the channel release feed and scopes it to the requested channel', async () => {
    mockFetchReleases.mockResolvedValue([
      {
        tag_name: 'v1.2.0',
        name: 'Release 1.2.0',
        body: 'notes',
        published_at: '2026-01-01T00:00:00Z',
        html_url: 'https://github.com/home-screens/home-screens/releases/tag/v1.2.0',
      },
    ] as never);
    const res = await GET(getRequest('?channel=beta'));
    expect(res.status).toBe(200);
    // The page is required: a one-entry history from releases/latest alone
    // would be mistaken for the whole list.
    expect(mockFetchReleases).toHaveBeenCalledWith('beta', { requirePage: true });
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

  it('falls back to bare tags when the release feed is empty, still scoped to the channel', async () => {
    mockFetchReleases.mockResolvedValue([]);
    fetchWithTimeoutMock.mockResolvedValueOnce(
      jsonResponse(true, [
        { name: 'v2.0.1-dev.20260908' },
        { name: 'v2.0.0' },
        { name: 'v2.0.0-beta.3' },
        { name: 'v2.0.0-rc.1' },
      ]),
    );
    const res = await GET(getRequest('?channel=rc'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releases.map((r: { tag: string }) => r.tag)).toEqual(['v2.0.0', 'v2.0.0-rc.1']);
    // Tags carry no notes or dates; the canonical tag page is synthesized.
    expect(body.releases[0].published).toBeNull();
    expect(body.releases[0].url).toBe('https://github.com/home-screens/home-screens/releases/tag/v2.0.0');
  });

  it('returns 502 when the release feed throws and the tags endpoint fails', async () => {
    mockFetchReleases.mockRejectedValue(new Error('GitHub API returned 403'));
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse(false, {})); // tags not ok
    const res = await GET(getRequest());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Failed to fetch changelog/);
  });
});
