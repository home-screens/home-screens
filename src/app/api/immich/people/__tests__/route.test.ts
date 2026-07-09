import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/immich', () => ({
  immichFetch: vi.fn(),
}));

vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    createTTLCache: () => ({ get: () => null, set: () => {}, clear: () => {} }),
  };
});

import { immichFetch } from '@/lib/immich';
import { GET } from '@/app/api/immich/people/route';

const mockImmichFetch = vi.mocked(immichFetch);
const req = new NextRequest('http://localhost/api/immich/people');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/immich/people', () => {
  it('normalizes people and builds a serve URL keyed by person id', async () => {
    mockImmichFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'p1', name: 'Ada', birthDate: null, isHidden: false },
          { id: 'p2', name: 'Bo', birthDate: null, isHidden: false },
        ]),
        { status: 200 },
      ),
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      { id: 'p1', name: 'Ada', thumbnailUrl: '/api/immich/serve?assetId=p1&type=person' },
      { id: 'p2', name: 'Bo', thumbnailUrl: '/api/immich/serve?assetId=p2&type=person' },
    ]);
    expect(mockImmichFetch).toHaveBeenCalledWith('/api/people');
  });

  it('unwraps the paginated { people: [...] } response shape', async () => {
    mockImmichFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ people: [{ id: 'p1', name: 'Ada', birthDate: null, isHidden: false }] }),
        { status: 200 },
      ),
    );

    const res = await GET(req);
    const json = await res.json();

    expect(json).toHaveLength(1);
    expect(json[0].id).toBe('p1');
  });

  it('filters out hidden and unnamed people', async () => {
    mockImmichFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 'p1', name: 'Ada', birthDate: null, isHidden: false },
          { id: 'p2', name: 'Hidden', birthDate: null, isHidden: true },
          { id: 'p3', name: '', birthDate: null, isHidden: false },
        ]),
        { status: 200 },
      ),
    );

    const res = await GET(req);
    const json = await res.json();

    expect(json.map((p: { id: string }) => p.id)).toEqual(['p1']);
  });

  it('returns 502 when Immich responds non-ok', async () => {
    mockImmichFetch.mockResolvedValue(new Response('', { status: 503 }));

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ error: 'Failed to fetch people from Immich' });
  });
});
