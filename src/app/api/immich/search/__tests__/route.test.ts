import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));
vi.mock('@/lib/immich', () => ({ immichFetch: vi.fn() }));

import { immichFetch } from '@/lib/immich';
import { GET } from '../route';

const mockFetch = vi.mocked(immichFetch);
const req = (q = '') => new NextRequest(`http://localhost/api/immich/search${q}`);
const reply = (items: unknown[], nextPage: string | null) =>
  new Response(JSON.stringify({ assets: { total: items.length, count: items.length, items, nextPage } }), { status: 200 });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/immich/search', () => {
  it('asks for one 9-photo page of images and maps the result with hasNext', async () => {
    mockFetch.mockResolvedValue(reply([{ id: 'a1', originalFileName: 'x.jpg', fileCreatedAt: '2024-05-06T10:00:00Z' }], '2'));
    const res = await GET(req('?page=1'));
    const json = await res.json();
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe('/api/search/metadata');
    expect(JSON.parse(String(init!.body))).toEqual({ type: 'IMAGE', page: 1, size: 9 });
    expect(json).toEqual({
      photos: [{ id: 'a1', thumb: '/api/immich/serve?assetId=a1&size=thumbnail', alt: 'x.jpg', date: '2024-05-06' }],
      page: 1,
      hasNext: true,
    });
  });

  it('passes the album and page, and reports no next page at the end', async () => {
    mockFetch.mockResolvedValue(reply([], null));
    const json = await (await GET(req('?albumId=abc-123&page=4'))).json();
    expect(JSON.parse(String(mockFetch.mock.calls[0][1]!.body))).toEqual({ type: 'IMAGE', page: 4, size: 9, albumIds: ['abc-123'] });
    expect(json.hasNext).toBe(false);
    expect(json).not.toHaveProperty('total');
  });

  it('rejects a malformed album id without calling Immich', async () => {
    const res = await GET(req('?albumId=../x'));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 when Immich fails', async () => {
    mockFetch.mockResolvedValue(new Response('no', { status: 500 }));
    expect((await GET(req())).status).toBe(502);
  });
});
